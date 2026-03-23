import React, { useState, useEffect, useRef } from 'react';
import useRouteStore from '../store/routeStore';
import { searchAddresses, geocodeAddress } from '../utils/geocoding';
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
    isGeocoding,
    setIsGeocoding,
    clearRoute,
    setError,
    clearError
  } = useRouteStore();

  const stops = getStopsForDay(activeDay);

  // Add Stop Form State
  const [addressInput, setAddressInput] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [caseNumber, setCaseNumber] = useState('');
  const [surveyType, setSurveyType] = useState('Exterior');
  const [stopNumber, setStopNumber] = useState('');
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [editingStopId, setEditingStopId] = useState(null);

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
    setEditingStopId(editingStopId === stopId ? null : stopId);
  };

  const handleUpdateStop = (stopId, field, value) => {
    updateStop(stopId, { [field]: value });
  };

  const handleClearAll = () => {
    clearStops(activeDay);
    clearRoute(activeDay);
  };

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

      {/* Stop List */}
      <div className="stop-panel-section stop-list-section">
        <div className="stop-list-header">
          <h2 className="section-title">Stops ({stops.length})</h2>
          {stops.length > 0 && (
            <button
              className="btn btn-secondary btn-clear-sm"
              onClick={handleClearAll}
            >
              Clear All
            </button>
          )}
        </div>

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
