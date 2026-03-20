import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import useRouteStore from '../store/routeStore';
import { reverseGeocode } from '../utils/geocoding';
import './MapView.css';

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

// Convert GeoJSON LineString coordinates to Leaflet format
const convertGeometryToLatLngs = (geometry) => {
  if (!geometry || !geometry.coordinates) return [];
  // GeoJSON format: [lng, lat] -> Leaflet format: [lat, lng]
  return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
};

const MapView = () => {
  const activeDay = useRouteStore((state) => state.activeDay);
  const getStopsForDay = useRouteStore((state) => state.getStopsForDay);
  const routes = useRouteStore((state) => state.routes);

  // Get stops for the active day
  const stops = useMemo(() => {
    return getStopsForDay(activeDay);
  }, [getStopsForDay, activeDay]);

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

  const hasOptimized = routeData.optimized.length > 0;
  const hasOriginal = routeData.original.length > 0;

  return (
    <div className="map-view-container">
      {/* Route legend */}
      {hasOriginal && hasOptimized && (
        <div className="map-legend">
          <div className="legend-item">
            <span className="legend-line legend-original"></span>
            <span className="legend-label">Original</span>
          </div>
          <div className="legend-item">
            <span className="legend-line legend-optimized"></span>
            <span className="legend-label">Optimized</span>
          </div>
        </div>
      )}
      <MapContainer
        center={center}
        zoom={zoom}
        className="map-container"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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

        {/* Render stop markers */}
        {stops.map((stop) => {
          if (!stop.lat || !stop.lng) return null;

          // Calculate display number: home gets "H", others numbered 1,2,3... excluding home
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
