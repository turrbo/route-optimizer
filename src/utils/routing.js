const ORS_BASE = 'https://api.openrouteservice.org/v2';

export async function calculateRoute(stops, apiKey) {
  if (stops.length < 2) throw new Error('Need at least 2 stops');
  if (!apiKey) throw new Error('No API key configured. Go to Settings and add your OpenRouteService API key.');

  // Validate all stops have coordinates
  const missing = stops.filter(s => !s.lat || !s.lng);
  if (missing.length > 0) {
    const names = missing.map(s => s.address || 'Unknown').join(', ');
    throw new Error(`${missing.length} stop(s) missing coordinates: ${names}. Wait for geocoding to finish or re-add the stop.`);
  }

  const coordinates = stops.map(s => [s.lng, s.lat]);

  let res;
  try {
    res = await fetch(`${ORS_BASE}/directions/driving-car/geojson`, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        coordinates,
        instructions: true,
        geometry: true,
      }),
    });
  } catch (networkErr) {
    throw new Error(`Network error connecting to routing service: ${networkErr.message}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    let detail = `HTTP ${res.status}`;
    try {
      const errJson = JSON.parse(errBody);
      const msg = errJson.error?.message || errJson.error || errJson.message || '';
      if (msg) detail = typeof msg === 'string' ? msg : JSON.stringify(msg);
    } catch { /* not JSON, use raw */ }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`API key invalid or expired (${res.status}). Check Settings and verify your OpenRouteService key.`);
    }
    throw new Error(`Route calculation failed: ${detail}`);
  }

  const data = await res.json();
  if (!data.features || !data.features[0]) {
    throw new Error('Routing service returned empty result. The stops may be unreachable by road.');
  }

  const feature = data.features[0];
  const summary = feature.properties?.summary;
  if (!summary) {
    throw new Error('Routing service returned incomplete data. Try different stops.');
  }

  return {
    geometry: feature.geometry,
    distance: summary.distance,
    duration: summary.duration,
    segments: feature.properties.segments,
    bbox: data.bbox,
  };
}

export async function optimizeRoute(stops, apiKey) {
  if (stops.length < 3) throw new Error('Need at least 3 stops to optimize');
  if (!apiKey) throw new Error('No API key configured. Go to Settings and add your OpenRouteService API key.');

  // Validate all stops have coordinates
  const missing = stops.filter(s => !s.lat || !s.lng);
  if (missing.length > 0) {
    throw new Error(`${missing.length} stop(s) missing coordinates. Wait for geocoding to finish.`);
  }

  // Use client-side nearest-neighbor + 2-opt optimization
  // (ORS VROOM optimization endpoint has CORS issues from browser)
  return await optimizeRouteLocal(stops, apiKey);
}

// Haversine distance in meters between two lat/lng points
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Client-side nearest-neighbor + 2-opt optimization using geographic distance
async function optimizeRouteLocal(stops, apiKey) {
  const start = stops[0];
  const end = stops[stops.length - 1];
  const middle = stops.slice(1, -1);

  // Nearest-neighbor from start through all middle stops
  const ordered = [];
  const remaining = [...middle];
  let current = start;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(current.lat, current.lng, remaining[i].lat, remaining[i].lng);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    current = remaining.splice(bestIdx, 1)[0];
    ordered.push(current);
  }

  // 2-opt improvement pass
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < ordered.length - 1; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const prevI = i === 0 ? start : ordered[i - 1];
        const nextJ = j === ordered.length - 1 ? end : ordered[j + 1];
        const currentDist =
          haversine(prevI.lat, prevI.lng, ordered[i].lat, ordered[i].lng) +
          haversine(ordered[j].lat, ordered[j].lng, nextJ.lat, nextJ.lng);
        const swapDist =
          haversine(prevI.lat, prevI.lng, ordered[j].lat, ordered[j].lng) +
          haversine(ordered[i].lat, ordered[i].lng, nextJ.lat, nextJ.lng);
        if (swapDist < currentDist) {
          // Reverse the segment between i and j
          const segment = ordered.slice(i, j + 1).reverse();
          ordered.splice(i, j - i + 1, ...segment);
          improved = true;
        }
      }
    }
  }

  const optimizedStops = [start, ...ordered, end];
  const optimizedStopIds = optimizedStops.map(s => s.id);
  const routeData = await calculateRoute(optimizedStops, apiKey);

  return {
    ...routeData,
    optimizedOrder: optimizedStopIds,
    optimizedStops,
    summary: {
      distance: routeData.distance,
      duration: routeData.duration,
      unassigned: 0,
    },
  };
}

export function formatDistance(meters) {
  const miles = meters / 1609.34;
  return `${miles.toFixed(1)} mi`;
}

export function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hrs === 0) return `${mins} min`;
  return `${hrs}h ${mins}m`;
}

export function detectDuplicateAreas(allStops) {
  // Group non-home stops by dayDate, then by ZIP or city
  const dayGroups = {};
  for (const stop of allStops) {
    if (stop.isHomeAddress) continue; // Skip home addresses
    if (!dayGroups[stop.dayDate]) dayGroups[stop.dayDate] = [];
    dayGroups[stop.dayDate].push(stop);
  }

  // Track which areas appear on which days (prefer city name over ZIP)
  const areaVisits = {}; // key: "City, ST" -> [dayDate, dayDate, ...]
  for (const [dayDate, stops] of Object.entries(dayGroups)) {
    const areasThisDay = new Set();
    for (const stop of stops) {
      const areaKey = stop.city
        ? `${stop.city}, ${stop.state}`
        : stop.zip
        ? `ZIP ${stop.zip}`
        : null;
      if (areaKey && !areasThisDay.has(areaKey)) {
        areasThisDay.add(areaKey);
        if (!areaVisits[areaKey]) areaVisits[areaKey] = [];
        areaVisits[areaKey].push(dayDate);
      }
    }
  }

  // Filter to areas visited on multiple days
  const duplicates = {};
  for (const [area, days] of Object.entries(areaVisits)) {
    if (days.length > 1) {
      duplicates[area] = days;
    }
  }

  return duplicates;
}
