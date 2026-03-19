const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

let lastRequestTime = 0;
const MIN_INTERVAL = 1100; // Nominatim requires 1 req/sec

async function throttle() {
  const now = Date.now();
  const wait = MIN_INTERVAL - (now - lastRequestTime);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestTime = Date.now();
}

export async function geocodeAddress(address) {
  await throttle();
  const params = new URLSearchParams({
    q: address,
    format: 'json',
    addressdetails: '1',
    limit: '1',
    countrycodes: 'us',
  });

  const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
    headers: { 'User-Agent': 'MuellerRouteOptimizer/1.0' }
  });

  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = await res.json();
  if (!data.length) throw new Error(`Address not found: ${address}`);

  const result = data[0];
  const addr = result.address || {};

  return {
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    displayName: result.display_name,
    city: addr.city || addr.town || addr.village || addr.hamlet || '',
    state: addr.state || '',
    zip: addr.postcode || '',
  };
}

export async function reverseGeocode(lat, lng) {
  await throttle();
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lng.toString(),
    format: 'json',
    addressdetails: '1',
  });

  const res = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, {
    headers: { 'User-Agent': 'MuellerRouteOptimizer/1.0' }
  });

  if (!res.ok) throw new Error(`Reverse geocoding failed: ${res.status}`);
  const data = await res.json();
  const addr = data.address || {};

  return {
    address: data.display_name,
    city: addr.city || addr.town || addr.village || '',
    state: addr.state || '',
    zip: addr.postcode || '',
  };
}

export async function searchAddresses(query) {
  await throttle();
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '5',
    countrycodes: 'us',
  });

  const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
    headers: { 'User-Agent': 'MuellerRouteOptimizer/1.0' }
  });

  if (!res.ok) return [];
  const data = await res.json();

  return data.map(r => ({
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    displayName: r.display_name,
    city: r.address?.city || r.address?.town || r.address?.village || '',
    state: r.address?.state || '',
    zip: r.address?.postcode || '',
  }));
}
