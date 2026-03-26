import React, { useState, useEffect, useRef } from 'react';
import useRouteStore from '../store/routeStore';
import { searchAddresses, geocodeAddress } from '../utils/geocoding';
import { calculateRoute, optimizeRoute, formatDistance, formatDuration } from '../utils/routing';
import './StopPanel.css';

const SURVEY_TYPES = [
  'Exterior',
  'Interior/Exterior',
  'High Value',
  'Elite High Value',
  'Lender Appt',
  'LPC',
  'Commercial'
];

export default function StopPanel() {
  const {
    getStopsForDay,
    addStop,
    updateStop,
    removeStop,
    reorderStops,
    clearStops,
    activeDay,
    routes,
    showComparison,
    setShowComparison,
    isCalculating,
    isOptimizing,
    isGeocoding,
    setIsCalculating,
    setIsOptimizing,
    setIsGeocoding,
    setRoute,
    clearRoute,
    orsApiKey,
    setError,
    clearError
  } = useRouteStore();

  const stops = getStopsForDay(activeDay);
  const dayRoutes = routes[activeDay] || { original: null, optimized: null };

  // Add Stop Form State
  const [addressInput, setAddressInput] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [caseNumber, setCaseNumber] = useState('');
  const [surveyType, setSurveyType] = useState('Exterior');
  const [stopNumber, setStopNumber] = useState('');
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [editingStopId, setEditingStopId] = useState(null);
  const [editAddress, setEditAddress] = useState('');
  const [isReGeocoding, setIsReGeocoding] = useState(null); // stop id being re-geocoded

  const debounceTimerRef = useRef(null);
  const addressInputRef = useRef(null);

  // Auto-fill stop number based on current stops count
  useEffect(() => {
    if (!stopNumber || stopNumber === String(stops.length)) {
      setStopNumber(String(stops.length + 1));
    }
  }, [stops.length, stopNumber]);

  // Debounced address search
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (addressInput.length < 3) {
      setAddressSuggestions([]);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const suggestions = await searchAddresses(addressInput);
        setAddressSuggestions(suggestions);
      } catch (error) {
        console.error('Address search error:', error);
        setAddressSuggestions([]);
      }
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [addressInput]);

  const handleAddressSelect = async (suggestion) => {
    setAddressInput(suggestion.displayName);
    setSelectedAddress(suggestion);
    setAddressSuggestions([]);
  };

  const handleAddStop = async () => {
    if (!selectedAddress && !addressInput) {
      setError('Please enter an address');
      return;
    }

    setIsGeocoding(true);
    clearError();

    try {
      let geocodedLocation;

      if (selectedAddress) {
        geocodedLocation = selectedAddress;
      } else {
        geocodedLocation = await geocodeAddress(addressInput);
      }

      const newStop = {
        id: Date.now().toString(),
        address: geocodedLocation.displayName,
        lat: geocodedLocation.lat,
        lng: geocodedLocation.lng,
        city: geocodedLocation.city,
        state: geocodedLocation.state,
        zip: geocodedLocation.zip,
        caseNumber: caseNumber || '',
        surveyType: surveyType || 'Exterior',
        stopNumber: stopNumber || String(stops.length + 1),
        dayDate: activeDay
      };

      addStop(newStop);

      // Reset form
      setAddressInput('');
      setSelectedAddress(null);
      setCaseNumber('');
      setSurveyType('Exterior');
      setStopNumber('');
      setAddressSuggestions([]);
    } catch (error) {
      console.error('Geocoding error:', error);
      setError('Could not find that address. Please try again.');
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleRemoveStop = (stopId) => {
    removeStop(stopId);
    if (stops.length <= 2) {
      clearRoute(activeDay);
    }
  };

  const handleMoveStop = (stopId, direction) => {
    const currentIndex = stops.findIndex(s => s.id === stopId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= stops.length) return;

    const newOrder = [...stops];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];

    reorderStops(activeDay, newOrder.map(s => s.id));
  };

  const handleToggleEdit = (stopId) => {
    if (editingStopId === stopId) {
      setEditingStopId(null);
      setEditAddress('');
    } else {
      setEditingStopId(stopId);
      const stop = stops.find(s => s.id === stopId);
      setEditAddress(stop?.address || '');
    }
  };

  const handleUpdateStop = (stopId, field, value) => {
    updateStop(stopId, { [field]: value });
  };

  const handleReGeocode = async (stopId) => {
    if (!editAddress.trim()) return;
    setIsReGeocoding(stopId);
    try {
      const geo = await geocodeAddress(editAddress.trim());
      updateStop(stopId, {
        address: geo.displayName,
        lat: geo.lat,
        lng: geo.lng,
        city: geo.city,
        state: geo.state,
        zip: geo.zip,
      });
      setEditAddress(geo.displayName);
    } catch (err) {
      setError('Could not find that address. Please try a different format.');
    } finally {
      setIsReGeocoding(null);
    }
  };

  // Build route-ready stop list: home first, stops in order, home last
  const buildRouteStops = (stopsArr) => {
    const homeStop = stopsArr.find(s => s.isHomeAddress);
    const nonHome = stopsArr.filter(s => !s.isHomeAddress);
    if (homeStop) {
      // Home as start and end (clone for end so routing gets return trip)
      return [homeStop, ...nonHome, { ...homeStop, id: homeStop.id + '-return' }];
    }
    return stopsArr;
  };

  const handleCalculateRoute = async () => {
    if (stops.length < 2) return;

    setIsCalculating(true);
    clearError();

    try {
      const routeStops = buildRouteStops(stops);
      const routeData = await calculateRoute(routeStops, orsApiKey);
      setRoute(activeDay, 'original', routeData);
    } catch (error) {
      console.error('Route calculation error:', error);
      setError(error.message || 'Route calculation failed. Check console for details.');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleOptimizeRoute = async () => {
    if (stops.length < 3) return;

    setIsOptimizing(true);
    clearError();

    try {
      const routeStops = buildRouteStops(stops);
      const optimizedData = await optimizeRoute(routeStops, orsApiKey);
      setRoute(activeDay, 'optimized', optimizedData);

      // Reorder stops in the list to match the optimized sequence
      if (optimizedData.optimizedOrder) {
        // Filter out the home-return clone ID (ends with '-return')
        const realIds = optimizedData.optimizedOrder.filter(id => !id.endsWith('-return'));
        reorderStops(activeDay, realIds);
      }
    } catch (error) {
      console.error('Route optimization error:', error);
      setError(error.message || 'Route optimization failed. Check console for details.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleClearAll = () => {
    clearStops(activeDay);
    clearRoute(activeDay);
    setShowComparison(false);
  };

  const handleToggleComparison = () => {
    setShowComparison(!showComparison);
  };

  const canCalculateRoute = stops.length >= 2 && !isCalculating;
  const canOptimizeRoute = stops.length >= 3 && !isOptimizing;
  const canCompareRoutes = dayRoutes.original && dayRoutes.optimized;

  return (
    <div className="stop-panel">
      {/* Add Stop Form */}
      <div className="stop-panel-section add-stop-section">
        <h2 className="section-title">Add Stop</h2>

        <div className="form-group">
          <label htmlFor="address-input">Address</label>
          <div className="address-input-wrapper">
            <input
              ref={addressInputRef}
              id="address-input"
              type="text"
              className="address-input"
              placeholder="Search for an address..."
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              disabled={isGeocoding}
            />
            {addressSuggestions.length > 0 && (
              <ul className="address-suggestions">
                {addressSuggestions.map((suggestion, index) => (
                  <li
                    key={index}
                    className="suggestion-item"
                    onClick={() => handleAddressSelect(suggestion)}
                  >
                    {suggestion.displayName}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="case-number">Case #</label>
            <input
              id="case-number"
              type="text"
              className="text-input"
              placeholder="Case #"
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              disabled={isGeocoding}
            />
          </div>

          <div className="form-group">
            <label htmlFor="survey-type">Survey Type</label>
            <select
              id="survey-type"
              className="select-input"
              value={surveyType}
              onChange={(e) => setSurveyType(e.target.value)}
              disabled={isGeocoding}
            >
              {SURVEY_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="stop-number">Stop #</label>
            <input
              id="stop-number"
              type="text"
              className="text-input"
              placeholder="Stop #"
              value={stopNumber}
              onChange={(e) => setStopNumber(e.target.value)}
              disabled={isGeocoding}
            />
          </div>
        </div>

        <button
          className="btn btn-primary add-stop-btn"
          onClick={handleAddStop}
          disabled={isGeocoding || !addressInput}
        >
          {isGeocoding ? 'Adding...' : 'Add Stop'}
        </button>
      </div>

      {/* Route Stats + Actions - pinned below Add Stop form */}
      <div className="stop-panel-section route-actions-section">
        {/* Route Stats */}
        {(dayRoutes.original || dayRoutes.optimized) && (
          <div className="route-stats">
            {dayRoutes.original && (
              <div className="route-stat">
                <div className="stat-label">Original Route</div>
                <div className="stat-values">
                  <span className="stat-value">{formatDistance(dayRoutes.original.distance)}</span>
                  <span className="stat-separator">•</span>
                  <span className="stat-value">{formatDuration(dayRoutes.original.duration)}</span>
                </div>
              </div>
            )}

            {dayRoutes.optimized && (
              <div className="route-stat optimized">
                <div className="stat-label">Optimized Route</div>
                <div className="stat-values">
                  <span className="stat-value">{formatDistance(dayRoutes.optimized.distance)}</span>
                  <span className="stat-separator">•</span>
                  <span className="stat-value">{formatDuration(dayRoutes.optimized.duration)}</span>
                </div>
                {dayRoutes.original && (
                  <div className="stat-savings">
                    Saves {formatDistance(dayRoutes.original.distance - dayRoutes.optimized.distance)}
                    {' and '}
                    {formatDuration(dayRoutes.original.duration - dayRoutes.optimized.duration)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="action-buttons">
          <button
            className="btn btn-primary"
            onClick={handleCalculateRoute}
            disabled={!canCalculateRoute}
          >
            {isCalculating ? 'Calculating...' : 'Calculate Route'}
          </button>

          <button
            className="btn btn-optimize"
            onClick={handleOptimizeRoute}
            disabled={!canOptimizeRoute}
          >
            {isOptimizing ? 'Optimizing...' : 'Optimize Route'}
          </button>

          {canCompareRoutes && (
            <button
              className={`btn btn-toggle ${showComparison ? 'active' : ''}`}
              onClick={handleToggleComparison}
            >
              {showComparison ? 'Hide Comparison' : 'Compare Routes'}
            </button>
          )}

          <button
            className="btn btn-secondary"
            onClick={handleClearAll}
            disabled={stops.length === 0}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Stop List - scrollable at bottom */}
      <div className="stop-panel-section stop-list-section">
        <h2 className="section-title">Stops ({stops.length})</h2>

        {stops.length === 0 ? (
          <div className="empty-state">
            <p>No stops added. Search for an address or click the map.</p>
          </div>
        ) : (
          <ul className="stop-list">
            {stops.map((stop, index) => {
              // Home gets "H", others numbered 1,2,3... excluding home stops
              const nonHomeStops = stops.filter(s => !s.isHomeAddress);
              const nonHomeIdx = nonHomeStops.findIndex(s => s.id === stop.id);
              const displayNum = stop.isHomeAddress ? 'H' : (nonHomeIdx >= 0 ? nonHomeIdx + 1 : '?');

              return (
              <li key={stop.id} className={`stop-item${!stop.lat || !stop.lng ? ' geocoding' : ''}${stop.isHomeAddress ? ' home-address' : ''}${stop.mileageFlag ? ' mileage-flag' : ''}`}>
                <div className="stop-header">
                  <div className={`stop-marker${stop.isHomeAddress ? ' home' : ''}`}>
                    {displayNum}
                  </div>
                  <div className="stop-info">
                    <div className="stop-address" title={stop.address}>
                      {(!stop.lat || !stop.lng) && <span className="geocoding-dot" title="Geocoding..."></span>}
                      {stop.address.length > 45
                        ? `${stop.address.substring(0, 45)}...`
                        : stop.address}
                    </div>
                    <div className="stop-meta">
                      {stop.isHomeAddress && (
                        <span className="meta-badge home-badge">Home</span>
                      )}
                      {stop.caseNumber && (
                        <span className="meta-badge">Case: {stop.caseNumber}</span>
                      )}
                      {stop.surveyType && (
                        <span className="meta-badge survey-type">{stop.surveyType}</span>
                      )}
                      {stop.mileageFlag && (
                        <span className="meta-badge mileage-over" title={`Actual: ${stop.actualMileage} mi | Est: ${stop.estimatedMileage} mi`}>
                          Over mileage
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="stop-actions">
                    <button
                      className="icon-btn edit-btn"
                      onClick={() => handleToggleEdit(stop.id)}
                      title="Edit stop"
                    >
                      ✏
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => handleMoveStop(stop.id, 'up')}
                      disabled={index === 0}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => handleMoveStop(stop.id, 'down')}
                      disabled={index === stops.length - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      className="icon-btn remove-btn"
                      onClick={() => handleRemoveStop(stop.id)}
                      title="Remove stop"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {editingStopId === stop.id && (
                  <div className="stop-edit-form">
                    <div className="form-group edit-address-group">
                      <label>Address</label>
                      <div className="edit-address-row">
                        <input
                          type="text"
                          className="text-input"
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleReGeocode(stop.id); }}
                          disabled={isReGeocoding === stop.id}
                        />
                        <button
                          className="btn btn-primary btn-regeocode"
                          onClick={() => handleReGeocode(stop.id)}
                          disabled={isReGeocoding === stop.id || !editAddress.trim()}
                        >
                          {isReGeocoding === stop.id ? '...' : 'Update'}
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Case #</label>
                      <input
                        type="text"
                        className="text-input"
                        value={stop.caseNumber || ''}
                        onChange={(e) => handleUpdateStop(stop.id, 'caseNumber', e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Survey Type</label>
                      <select
                        className="select-input"
                        value={stop.surveyType || 'Exterior'}
                        onChange={(e) => handleUpdateStop(stop.id, 'surveyType', e.target.value)}
                      >
                        {SURVEY_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </div>

    </div>
  );
}
