const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const CENSUS_BASE = 'https://geocoding.geo.census.gov/geocoder/locations';
const LOCATIONIQ_BASE = 'https://us1.locationiq.com/v1';
// LocationIQ free tier key - register at locationiq.com for your own
// Set to empty string to skip this fallback
const LOCATIONIQ_KEY = '';

let lastNominatimTime = 0;
const NOMINATIM_INTERVAL = 1100; // 1 req/sec

let lastLocationIQTime = 0;
const LOCATIONIQ_INTERVAL = 550; // 2 req/sec on free tier

async function throttleNominatim() {
  const now = Date.now();
  const wait = NOMINATIM_INTERVAL - (now - lastNominatimTime);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastNominatimTime = Date.now();
}

async function throttleLocationIQ() {
  const now = Date.now();
  const wait = LOCATIONIQ_INTERVAL - (now - lastLocationIQTime);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastLocationIQTime = Date.now();
}

// ---------------------------------------------------------------------------
// Address normalization - clean up addresses before geocoding
// ---------------------------------------------------------------------------

const STREET_ABBREVS = {
  'st': 'Street', 'st.': 'Street',
  'ave': 'Avenue', 'ave.': 'Avenue',
  'blvd': 'Boulevard', 'blvd.': 'Boulevard',
  'dr': 'Drive', 'dr.': 'Drive',
  'ln': 'Lane', 'ln.': 'Lane',
  'rd': 'Road', 'rd.': 'Road',
  'ct': 'Court', 'ct.': 'Court',
  'pl': 'Place', 'pl.': 'Place',
  'cir': 'Circle', 'cir.': 'Circle',
  'pkwy': 'Parkway', 'pkwy.': 'Parkway',
  'hwy': 'Highway', 'hwy.': 'Highway',
  'trl': 'Trail', 'trl.': 'Trail',
  'ter': 'Terrace', 'ter.': 'Terrace',
  'way': 'Way',
};

const DIRECTION_ABBREVS = {
  'n': 'North', 'n.': 'North',
  's': 'South', 's.': 'South',
  'e': 'East', 'e.': 'East',
  'w': 'West', 'w.': 'West',
  'ne': 'Northeast', 'nw': 'Northwest',
  'se': 'Southeast', 'sw': 'Southwest',
};

function normalizeAddress(address) {
  if (!address) return address;
  let normalized = address.trim().replace(/\s+/g, ' ');
  // Strip apt/unit/suite/# suffixes (geocoders can't find them)
  normalized = normalized.replace(/\s*(?:apt|unit|suite|ste|#|bldg|building)\s*[#.]?\s*\S+$/i, '');
  // Expand street type abbreviations (only at word boundaries)
  normalized = normalized.replace(/\b(\w+\.?)\b/g, (match) => {
    const lower = match.toLowerCase();
    return STREET_ABBREVS[lower] || DIRECTION_ABBREVS[lower] || match;
  });
  return normalized;
}

// Try to parse "123 Main St, Springfield, IL 62704" into components
function parseAddress(address) {
  const parts = address.split(',').map(p => p.trim());
  if (parts.length < 2) return null;

  const street = parts[0];
  // Last part might be "IL 62704" or "IL" or "62704"
  // Second-to-last is usually city
  let city = '', state = '', zip = '';

  if (parts.length >= 3) {
    city = parts[1];
    const stateZip = parts[parts.length - 1].trim();
    const szMatch = stateZip.match(/^([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)$/);
    if (szMatch) {
      state = szMatch[1];
      zip = szMatch[2];
    } else if (/^\d{5}/.test(stateZip)) {
      zip = stateZip.match(/\d{5}(?:-\d{4})?/)[0];
      if (parts.length >= 4) state = parts[parts.length - 2].trim();
    } else if (/^[A-Za-z]{2}$/.test(stateZip)) {
      state = stateZip;
    }
  } else {
    // "123 Main St, Springfield IL 62704"
    const last = parts[1];
    const m = last.match(/^(.+?)\s+([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)$/);
    if (m) {
      city = m[1];
      state = m[2];
      zip = m[3];
    } else {
      city = last;
    }
  }

  if (!street) return null;
  return { street, city, state: state.toUpperCase(), zip };
}

// ---------------------------------------------------------------------------
// Geocoder 1: Nominatim (structured query when possible)
// ---------------------------------------------------------------------------

async function nominatimGeocode(address) {
  await throttleNominatim();
  const parsed = parseAddress(address);

  let params;
  if (parsed && parsed.city) {
    // Structured query - more accurate
    params = new URLSearchParams({
      street: parsed.street,
      city: parsed.city,
      state: parsed.state,
      postalcode: parsed.zip,
      format: 'json',
      addressdetails: '1',
      limit: '1',
      countrycodes: 'us',
    });
    // Remove empty params
    for (const [k, v] of [...params.entries()]) {
      if (!v) params.delete(k);
    }
  } else {
    // Fallback to free-form
    params = new URLSearchParams({
      q: address,
      format: 'json',
      addressdetails: '1',
      limit: '1',
      countrycodes: 'us',
    });
  }

  const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
    headers: { 'User-Agent': 'MuellerRouteOptimizer/1.0' }
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length) return null;

  const result = data[0];
  const addr = result.address || {};
  return {
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    displayName: result.display_name,
    city: addr.city || addr.town || addr.village || addr.hamlet || '',
    state: addr.state || '',
    zip: addr.postcode || '',
    source: 'nominatim',
  };
}

// ---------------------------------------------------------------------------
// Geocoder 2: US Census Bureau (free, no key, US addresses only)
// ---------------------------------------------------------------------------

async function censusGeocode(address) {
  const parsed = parseAddress(address);

  try {
    let url;
    if (parsed && parsed.city && parsed.state) {
      // Structured endpoint
      const params = new URLSearchParams({
        street: parsed.street,
        city: parsed.city,
        state: parsed.state,
        benchmark: 'Public_AR_Current',
        format: 'json',
      });
      if (parsed.zip) params.set('zip', parsed.zip);
      url = `${CENSUS_BASE}/address?${params}`;
    } else {
      // One-line endpoint
      const params = new URLSearchParams({
        address: address,
        benchmark: 'Public_AR_Current',
        format: 'json',
      });
      url = `${CENSUS_BASE}/onelineaddress?${params}`;
    }

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const matches = data?.result?.addressMatches;
    if (!matches || matches.length === 0) return null;

    const match = matches[0];
    const coords = match.coordinates;
    const addrComp = match.addressComponents || {};

    const city = addrComp.city || '';
    const state = addrComp.state || '';
    const zip = addrComp.zip || '';
    const matchedAddr = match.matchedAddress || address;

    return {
      lat: coords.y,
      lng: coords.x,
      displayName: matchedAddr,
      city,
      state,
      zip,
      source: 'census',
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Geocoder 3: LocationIQ (5,000 req/day free, Nominatim-compatible)
// ---------------------------------------------------------------------------

async function locationIQGeocode(address) {
  if (!LOCATIONIQ_KEY) return null; // skip if no key configured
  await throttleLocationIQ();
  const parsed = parseAddress(address);

  try {
    let params;
    if (parsed && parsed.city) {
      params = new URLSearchParams({
        key: LOCATIONIQ_KEY,
        street: parsed.street,
        city: parsed.city,
        state: parsed.state,
        postalcode: parsed.zip,
        format: 'json',
        addressdetails: '1',
        limit: '1',
        countrycodes: 'us',
      });
      for (const [k, v] of [...params.entries()]) {
        if (!v) params.delete(k);
      }
    } else {
      params = new URLSearchParams({
        key: LOCATIONIQ_KEY,
        q: address,
        format: 'json',
        addressdetails: '1',
        limit: '1',
        countrycodes: 'us',
      });
    }

    const res = await fetch(`${LOCATIONIQ_BASE}/search?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;

    const result = data[0];
    const addr = result.address || {};
    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      displayName: result.display_name,
      city: addr.city || addr.town || addr.village || addr.hamlet || '',
      state: addr.state || '',
      zip: addr.postcode || '',
      source: 'locationiq',
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main geocoding function with fallback chain
// ---------------------------------------------------------------------------

export async function geocodeAddress(address) {
  const normalized = normalizeAddress(address);

  // 1. Nominatim (free, primary)
  const nom = await nominatimGeocode(normalized);
  if (nom) return nom;

  // 2. US Census Bureau (free, authoritative for US residential)
  const census = await censusGeocode(normalized);
  if (census) return census;

  // 3. LocationIQ (5K/day free, different data processing)
  const liq = await locationIQGeocode(normalized);
  if (liq) return liq;

  // All failed
  throw new Error(`Address not found: ${address}`);
}

// ---------------------------------------------------------------------------
// Reverse geocoding (still Nominatim-only, works fine for coords)
// ---------------------------------------------------------------------------

export async function reverseGeocode(lat, lng) {
  await throttleNominatim();
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

// ---------------------------------------------------------------------------
// Address search (autocomplete) with Census Bureau fallback
// ---------------------------------------------------------------------------

export async function searchAddresses(query) {
  // 1. Try Nominatim first
  try {
    await throttleNominatim();
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

    if (res.ok) {
      const data = await res.json();
      if (data.length > 0) {
        return data.map(r => ({
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          displayName: r.display_name,
          city: r.address?.city || r.address?.town || r.address?.village || '',
          state: r.address?.state || '',
          zip: r.address?.postcode || '',
        }));
      }
    }
  } catch {
    // Nominatim failed, try fallback
  }

  // 2. Fallback: Census Bureau one-line search
  try {
    const cParams = new URLSearchParams({
      address: query,
      benchmark: 'Public_AR_Current',
      format: 'json',
    });
    const cRes = await fetch(`${CENSUS_BASE}/onelineaddress?${cParams}`);
    if (cRes.ok) {
      const cData = await cRes.json();
      const matches = cData?.result?.addressMatches;
      if (matches && matches.length > 0) {
        return matches.map(m => ({
          lat: m.coordinates.y,
          lng: m.coordinates.x,
          displayName: m.matchedAddress,
          city: m.addressComponents?.city || '',
          state: m.addressComponents?.state || '',
          zip: m.addressComponents?.zip || '',
        }));
      }
    }
  } catch {
    // Census also failed
  }

  return [];
}
