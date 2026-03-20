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

  const jobs = stops.slice(1, -1).map((stop, idx) => ({
    id: idx + 1,
    location: [stop.lng, stop.lat],
    service: 300,
    description: stop.address,
  }));

  const vehicles = [{
    id: 1,
    profile: 'driving-car',
    start: [stops[0].lng, stops[0].lat],
    end: [stops[stops.length - 1].lng, stops[stops.length - 1].lat],
    capacity: [100],
  }];

  let res;
  try {
    res = await fetch(`${ORS_BASE}/optimization`, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobs, vehicles }),
    });
  } catch (networkErr) {
    throw new Error(`Network error connecting to optimization service: ${networkErr.message}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    let detail = `HTTP ${res.status}`;
    try {
      const errJson = JSON.parse(errBody);
      const msg = errJson.error?.message || errJson.error || errJson.message || '';
      if (msg) detail = typeof msg === 'string' ? msg : JSON.stringify(msg);
    } catch { /* not JSON */ }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`API key invalid or expired (${res.status}). Check Settings and verify your OpenRouteService key.`);
    }
    throw new Error(`Route optimization failed: ${detail}`);
  }

  const data = await res.json();
  const route = data.routes[0];

  // Extract optimized order: map job IDs back to stop indices
  const optimizedStopIds = [stops[0].id];
  for (const step of route.steps) {
    if (step.type === 'job') {
      const originalIdx = step.job; // 1-based index into the middle stops
      optimizedStopIds.push(stops[originalIdx].id);
    }
  }
  optimizedStopIds.push(stops[stops.length - 1].id);

  // Now get the actual route geometry for the optimized order
  const optimizedStops = optimizedStopIds.map(id => stops.find(s => s.id === id));
  const routeData = await calculateRoute(optimizedStops, apiKey);

  return {
    ...routeData,
    optimizedOrder: optimizedStopIds,
    optimizedStops,
    summary: {
      distance: route.distance || routeData.distance,
      duration: route.duration || routeData.duration,
      unassigned: data.unassigned?.length || 0,
    },
  };
}

export function formatDistance(meters) {
  const miles = meters / 1609.34;
  return miles < 0.1 ? `${Math.round(meters)} ft` : `${miles.toFixed(1)} mi`;
}

export function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hrs === 0) return `${mins} min`;
  return `${hrs}h ${mins}m`;
}

export function detectDuplicateAreas(allStops) {
  // Group stops by dayDate, then by ZIP or city
  const dayGroups = {};
  for (const stop of allStops) {
    if (!dayGroups[stop.dayDate]) dayGroups[stop.dayDate] = [];
    dayGroups[stop.dayDate].push(stop);
  }

  // Track which areas appear on which days
  const areaVisits = {}; // key: "zip:city" -> [dayDate, dayDate, ...]
  for (const [dayDate, stops] of Object.entries(dayGroups)) {
    const areasThisDay = new Set();
    for (const stop of stops) {
      const areaKey = stop.zip
        ? `ZIP ${stop.zip}`
        : stop.city
        ? `${stop.city}, ${stop.state}`
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
