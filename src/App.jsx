import { useState, useEffect } from 'react';
import useRouteStore from './store/routeStore';
import { geocodeAddress } from './utils/geocoding';
import MapView from './components/MapView';
import StopPanel from './components/StopPanel';
import OpenCasesBar from './components/OpenCasesPanel';
import { WeekView } from './components/WeekView';
import './App.css';

function App() {
  const activeView = useRouteStore(s => s.activeView);
  const setActiveView = useRouteStore(s => s.setActiveView);
  const activeDay = useRouteStore(s => s.activeDay);
  const setActiveDay = useRouteStore(s => s.setActiveDay);
  const orsApiKey = useRouteStore(s => s.orsApiKey);
  const setOrsApiKey = useRouteStore(s => s.setOrsApiKey);
  const showSettings = useRouteStore(s => s.showSettings);
  const setShowSettings = useRouteStore(s => s.setShowSettings);
  const error = useRouteStore(s => s.error);
  const clearError = useRouteStore(s => s.clearError);
  const routes = useRouteStore(s => s.routes);
  const addStop = useRouteStore(s => s.addStop);
  const updateStop = useRouteStore(s => s.updateStop);
  const resetAll = useRouteStore(s => s.resetAll);
  const stops = useRouteStore(s => s.stops);

  const [apiKeyInput, setApiKeyInput] = useState(orsApiKey);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState(null); // { done, total }

  const handleResetAll = () => {
    resetAll();
    setShowResetConfirm(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    async function importAndGeocode(stopList) {
      // Add all stops first (with addresses but no coordinates)
      const addedIds = [];
      for (const stop of stopList) {
        const id = addStop({
          address: stop.address || '',
          caseNumber: stop.caseNumber || '',
          surveyType: stop.surveyType || 'Exterior',
          dayDate: stop.dayDate || activeDay,
          isHomeAddress: stop.isHomeAddress || false,
          actualMileage: stop.actualMileage ?? null,
          estimatedMileage: stop.estimatedMileage ?? null,
          mileageFlag: stop.mileageFlag || false,
        });
        addedIds.push({ id, address: stop.address });
      }

      // Then geocode each one sequentially (Nominatim: 1 req/sec)
      setGeocodingProgress({ done: 0, total: addedIds.length });
      let done = 0;
      for (const item of addedIds) {
        try {
          const geo = await geocodeAddress(item.address);
          updateStop(item.id, {
            address: geo.displayName,
            lat: geo.lat,
            lng: geo.lng,
            city: geo.city,
            state: geo.state,
            zip: geo.zip,
          });
        } catch (err) {
          console.warn(`Could not geocode "${item.address}":`, err.message);
        }
        done++;
        setGeocodingProgress({ done, total: addedIds.length });
      }
      setGeocodingProgress(null);
    }

    // New format: ?data=<base64 JSON> with full stop metadata
    const dataParam = params.get('data');
    if (dataParam) {
      try {
        const json = decodeURIComponent(escape(atob(dataParam)));
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) {
          importAndGeocode(parsed);
        }
      } catch (err) {
        console.error('Failed to parse stop data from extension:', err);
      }
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    // Legacy format: ?stops=address1|address2
    const stopsParam = params.get('stops');
    if (stopsParam) {
      const addresses = stopsParam.split('|').map(a => decodeURIComponent(a.trim())).filter(Boolean);
      importAndGeocode(addresses.map(a => ({ address: a })));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleSaveSettings = () => {
    setOrsApiKey(apiKeyInput);
    setShowSettings(false);
  };

  const dayRoutes = routes[activeDay];
  const hasRoutes = dayRoutes?.original || dayRoutes?.optimized;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="app-logo">
            Mueller <span>Reports</span> Route Optimizer
          </div>
          <nav className="header-nav">
            <button
              className={`nav-tab ${activeView === 'planner' ? 'active' : ''}`}
              onClick={() => setActiveView('planner')}
            >
              Route Planner
            </button>
            <button
              className={`nav-tab ${activeView === 'week' ? 'active' : ''}`}
              onClick={() => setActiveView('week')}
            >
              Week View
            </button>
          </nav>
        </div>
        <div className="header-right">
          {activeView === 'planner' && (
            <div className="day-selector">
              <span>Day:</span>
              <input
                type="date"
                value={activeDay}
                onChange={(e) => setActiveDay(e.target.value)}
              />
            </div>
          )}
          {stops.length > 0 && (
            <button className="reset-btn" onClick={() => setShowResetConfirm(true)}>
              New Rep
            </button>
          )}
          <button className="settings-btn" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
      </header>

      {!orsApiKey && (
        <div className="api-key-banner">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Add your OpenRouteService API key to enable routing. Get a free key at openrouteservice.org
          <button onClick={() => setShowSettings(true)}>Add API Key</button>
        </div>
      )}

      {geocodingProgress && (
        <div className="geocoding-banner">
          Geocoding addresses... {geocodingProgress.done} / {geocodingProgress.total}
          <div className="geocoding-progress-bar">
            <div
              className="geocoding-progress-fill"
              style={{ width: `${(geocodingProgress.done / geocodingProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={clearError}>x</button>
        </div>
      )}

      <OpenCasesBar />

      <main className="app-main">
        {activeView === 'planner' ? (
          <div className="planner-layout">
            <StopPanel />
            <div className="map-area">
              <MapView />
            </div>
          </div>
        ) : (
          <div className="week-area">
            <WeekView />
          </div>
        )}
      </main>

      {showResetConfirm && (
        <div className="settings-overlay" onClick={() => setShowResetConfirm(false)}>
          <div className="settings-modal reset-modal" onClick={e => e.stopPropagation()}>
            <h2>Start New Rep?</h2>
            <p className="reset-description">
              This will clear all stops and routes for every day. Your API key and settings will be kept.
            </p>
            <div className="settings-actions">
              <button className="btn-cancel" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleResetAll}>
                Clear Everything
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <h2>Settings</h2>
            <div className="settings-field">
              <label htmlFor="api-key">OpenRouteService API Key</label>
              <input
                id="api-key"
                type="text"
                placeholder="Enter your ORS API key..."
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
              />
              <p>
                Get a free API key at openrouteservice.org/dev/#/signup.
                The free tier allows up to 2,000 requests/day.
              </p>
            </div>
            <div className="settings-actions">
              <button className="btn-cancel" onClick={() => setShowSettings(false)}>
                Cancel
              </button>
              <button className="btn-save" onClick={handleSaveSettings}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
