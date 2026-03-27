import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import useRouteStore from '../store/routeStore';
import { reverseGeocode } from '../utils/geocoding';
import { filterOpenCases } from '../utils/excelParser';
import './MapView.css';

// Shared ref so the map click handler can skip clicks caused by popup buttons
let lastPopupActionTime = 0;

// Component to handle map bounds and events
const MapController = ({ stops }) => {
  const map = useMap();
  const addStop = useRouteStore((state) => state.addStop);

  // Auto-fit bounds when stops change
  useEffect(() => {
    if (stops.length > 0) {
      const validStops = stops.filter((stop) => stop.lat && stop.lng);
      if (validStops.length > 0) {
        const bounds = L.latLngBounds(
          validStops.map((stop) => [stop.lat, stop.lng])
        );
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    }
  }, [stops, map]);

  // Handle map clicks to add stops
  useEffect(() => {
    const handleMapClick = async (e) => {
      // Skip if a popup button was just clicked (prevents duplicate stop)
      if (Date.now() - lastPopupActionTime < 500) return;

      const { lat, lng } = e.latlng;

      try {
        const geocodeResult = await reverseGeocode(lat, lng);

        if (geocodeResult) {
          addStop({
            address: geocodeResult.address,
            lat,
            lng,
            city: geocodeResult.city,
            state: geocodeResult.state,
            zip: geocodeResult.zip,
          });
        } else {
          // Fallback if geocoding fails
          addStop({
            address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
            lat,
            lng,
            city: '',
            state: '',
            zip: '',
          });
        }
      } catch (error) {
        console.error('Error adding stop:', error);
        // Add with coordinates only on error
        addStop({
          address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          lat,
          lng,
          city: '',
          state: '',
          zip: '',
        });
      }
    };

    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [map, addStop]);

  return null;
};

// Create custom numbered marker icon
const createNumberedIcon = (number, isHome = false) => {
  const className = isHome ? 'marker-number marker-home' : 'marker-number';
  return L.divIcon({
    className: 'custom-marker-icon',
    html: `<div class="${className}">${isHome ? 'H' : number}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

// Create open case pin icon (green for unassigned, light blue for assigned)
const createCaseIcon = (type) => {
  const color = type === 'unassigned' ? '#16a34a' : '#38bdf8';
  return L.divIcon({
    className: 'custom-marker-icon',
    html: `<div class="marker-case" style="background:${color}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
};
const caseIconUnassigned = createCaseIcon('unassigned');
const caseIconAssigned = createCaseIcon('assigned');

// Convert GeoJSON LineString coordinates to Leaflet format
const convertGeometryToLatLngs = (geometry) => {
  if (!geometry || !geometry.coordinates) return [];
  // GeoJSON format: [lng, lat] -> Leaflet format: [lat, lng]
  return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
};

const MapView = () => {
  const activeDay = useRouteStore((state) => state.activeDay);
  const addStop = useRouteStore((state) => state.addStop);
  const routes = useRouteStore((state) => state.routes);
  const openCases = useRouteStore((state) => state.openCases);
  const selectedFR = useRouteStore((state) => state.selectedFR);
  const showOpenCases = useRouteStore((state) => state.showOpenCases);
  const showUnassigned = useRouteStore((state) => state.showUnassigned);
  const darkMode = useRouteStore((state) => state.darkMode);
  const allStops = useRouteStore((state) => state.stops);

  // Get stops for the active day (allStops in deps ensures re-computation on add/remove)
  const stops = useMemo(() => {
    return allStops
      .filter(s => s.dayDate === activeDay)
      .sort((a, b) => a.stopNumber - b.stopNumber);
  }, [allStops, activeDay]);

  // Filter open cases for the active day
  const visibleCases = useMemo(() => {
    if (!showOpenCases || openCases.length === 0) return { unassigned: [], assigned: [] };
    const filtered = filterOpenCases(openCases, activeDay);
    return {
      unassigned: showUnassigned
        ? filtered.filter(c => !c.frAssigned && c.lat && c.lng)
        : [],
      assigned: selectedFR
        ? filtered.filter(c => c.frAssigned === selectedFR && c.lat && c.lng)
        : [],
    };
  }, [openCases, activeDay, selectedFR, showOpenCases, showUnassigned]);

  // Get route geometries for the active day
  const routeData = useMemo(() => {
    const dayRoutes = routes[activeDay];
    if (!dayRoutes) return { original: [], optimized: [] };

    return {
      original: convertGeometryToLatLngs(dayRoutes.original?.geometry),
      optimized: convertGeometryToLatLngs(dayRoutes.optimized?.geometry),
    };
  }, [routes, activeDay]);

  // Determine map center and zoom
  const { center, zoom } = useMemo(() => {
    const validStops = stops.filter((stop) => stop.lat && stop.lng);
    if (validStops.length === 0) {
      // Default to US center
      return { center: [39.8, -98.5], zoom: 4 };
    }
    // Will be overridden by fitBounds, but set reasonable default
    return { center: [validStops[0].lat, validStops[0].lng], zoom: 13 };
  }, [stops]);

  // Check if a case is already added as a stop, and return its stop number
  const getCaseStopNumber = (controlNumber) => {
    const nonHomeStops = stops.filter(s => !s.isHomeAddress);
    const idx = nonHomeStops.findIndex(s => s.caseNumber === controlNumber);
    return idx >= 0 ? idx + 1 : null;
  };

  const handleAddCaseToRoute = (caseItem) => {
    lastPopupActionTime = Date.now();
    if (getCaseStopNumber(caseItem.controlNumber) !== null) return;
    addStop({
      address: `${caseItem.address}, ${caseItem.city}, ${caseItem.state}`,
      lat: caseItem.lat,
      lng: caseItem.lng,
      city: caseItem.city,
      state: caseItem.state,
      zip: '',
      caseNumber: caseItem.controlNumber,
      surveyType: caseItem.surveyType,
      dayDate: activeDay,
      isHomeAddress: false,
    });
  };

  const hasOptimized = routeData.optimized.length > 0;
  const hasOriginal = routeData.original.length > 0;
  const hasCases = visibleCases.unassigned.length > 0 || visibleCases.assigned.length > 0;

  return (
    <div className="map-view-container">
      {/* Route legend */}
      {(hasOriginal && hasOptimized || hasCases) && (
        <div className="map-legend">
          {hasOriginal && hasOptimized && (
            <>
              <div className="legend-item">
                <span className="legend-line legend-original"></span>
                <span className="legend-label">Original</span>
              </div>
              <div className="legend-item">
                <span className="legend-line legend-optimized"></span>
                <span className="legend-label">Optimized</span>
              </div>
            </>
          )}
          {visibleCases.unassigned.length > 0 && (
            <div className="legend-item">
              <span className="legend-dot legend-dot-green"></span>
              <span className="legend-label">Unassigned</span>
            </div>
          )}
          {visibleCases.assigned.length > 0 && (
            <div className="legend-item">
              <span className="legend-dot legend-dot-blue"></span>
              <span className="legend-label">FR Assigned</span>
            </div>
          )}
        </div>
      )}
      <MapContainer
        center={center}
        zoom={zoom}
        className="map-container"
        zoomControl={true}
      >
        <TileLayer
          key={darkMode ? 'dark' : 'light'}
          attribution={darkMode
            ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
          url={darkMode
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          }
        />

        <MapController stops={stops} />

        {/* Render original route (blue, dimmed if optimized exists) */}
        {routeData.original.length > 0 && (
          <Polyline
            positions={routeData.original}
            pathOptions={{
              color: '#2563eb',
              weight: routeData.optimized.length > 0 ? 3 : 4,
              opacity: routeData.optimized.length > 0 ? 0.35 : 0.7,
              dashArray: routeData.optimized.length > 0 ? '8, 6' : undefined,
            }}
          />
        )}

        {/* Render optimized route (green, always shown when available) */}
        {routeData.optimized.length > 0 && (
          <Polyline
            positions={routeData.optimized}
            pathOptions={{
              color: '#16a34a',
              weight: 5,
              opacity: 0.85,
            }}
          />
        )}

        {/* Open case markers - unassigned (green dot, or numbered stop if in route) */}
        {visibleCases.unassigned.map((c) => {
          const stopNum = getCaseStopNumber(c.controlNumber);
          const inRoute = stopNum !== null;
          return (
            <Marker
              key={`oc-u-${c.controlNumber}`}
              position={[c.lat, c.lng]}
              icon={inRoute ? createNumberedIcon(stopNum) : caseIconUnassigned}
            >
              <Popup>
                <div className="stop-popup">
                  <div className="popup-address">{c.address}, {c.city}, {c.state}</div>
                  <div className="popup-field"><strong>Control #:</strong> {c.controlNumber}</div>
                  <div className="popup-field"><strong>Survey:</strong> {c.surveyType}</div>
                  <div className="popup-field"><strong>Ordered:</strong> {c.dateOrdered}</div>
                  <div className="popup-field" style={{ color: '#16a34a', fontWeight: 600 }}>Unassigned</div>
                  {!inRoute ? (
                    <button className="popup-add-btn" onClick={() => handleAddCaseToRoute(c)}>
                      Add to Route
                    </button>
                  ) : (
                    <div className="popup-field" style={{ color: '#c8102e', fontWeight: 600 }}>Stop #{stopNum}</div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Open case markers - assigned to selected FR (blue dot, or numbered stop if in route) */}
        {visibleCases.assigned.map((c) => {
          const stopNum = getCaseStopNumber(c.controlNumber);
          const inRoute = stopNum !== null;
          return (
            <Marker
              key={`oc-a-${c.controlNumber}`}
              position={[c.lat, c.lng]}
              icon={inRoute ? createNumberedIcon(stopNum) : caseIconAssigned}
            >
              <Popup>
                <div className="stop-popup">
                  <div className="popup-address">{c.address}, {c.city}, {c.state}</div>
                  <div className="popup-field"><strong>Control #:</strong> {c.controlNumber}</div>
                  <div className="popup-field"><strong>Survey:</strong> {c.surveyType}</div>
                  <div className="popup-field"><strong>Ordered:</strong> {c.dateOrdered}</div>
                  <div className="popup-field" style={{ color: '#38bdf8', fontWeight: 600 }}>FR: {c.frAssigned}</div>
                  {!inRoute ? (
                    <button className="popup-add-btn" onClick={() => handleAddCaseToRoute(c)}>
                      Add to Route
                    </button>
                  ) : (
                    <div className="popup-field" style={{ color: '#c8102e', fontWeight: 600 }}>Stop #{stopNum}</div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Render stop markers (on top of case markers) */}
        {stops.map((stop) => {
          if (!stop.lat || !stop.lng) return null;

          const isHome = stop.isHomeAddress;
          let displayNum = stop.stopNumber || '?';
          if (!isHome) {
            const nonHomeStops = stops.filter(s => !s.isHomeAddress);
            const idx = nonHomeStops.findIndex(s => s.id === stop.id);
            displayNum = idx >= 0 ? idx + 1 : displayNum;
          }

          return (
            <Marker
              key={stop.id}
              position={[stop.lat, stop.lng]}
              icon={createNumberedIcon(displayNum, isHome)}
            >
              <Popup>
                <div className="stop-popup">
                  <div className="popup-address">
                    {isHome && <strong>[Home] </strong>}
                    {stop.address}
                  </div>
                  {stop.caseNumber && (
                    <div className="popup-field">
                      <strong>Case #:</strong> {stop.caseNumber}
                    </div>
                  )}
                  {stop.surveyType && (
                    <div className="popup-field">
                      <strong>Survey Type:</strong> {stop.surveyType}
                    </div>
                  )}
                  {!isHome && displayNum && (
                    <div className="popup-field">
                      <strong>Stop #:</strong> {displayNum}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default MapView;
