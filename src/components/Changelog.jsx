import React from 'react';
import './Changelog.css';

const CHANGELOG = [
  {
    version: '1.7.0',
    date: '2026-03-27',
    changes: [
      'Faster geocoding - providers run in round-robin with 3 cases processed concurrently',
      'Search bar no longer blocked while open cases are geocoding',
      'Failed geocodes automatically retry on next load instead of being permanently skipped',
      'Week View now shows FR actual route stats instead of optimized route',
      'New FR Route vs Optimized Route comparison in Week Summary with savings breakdown',
      'Missed Exterior Opportunities now only shows cases assigned to the selected FR',
      'Light mode map switched to CartoDB Positron for cleaner look',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-03-27',
    changes: [
      'Dark mode toggle - click the moon icon in the header to switch themes',
      'Map tiles switch to CartoDB dark basemap in dark mode',
      'Dark mode preference persists across sessions',
      'Fixed dark mode text readability across all buttons, header, and panels',
      'Fixed map tile seam lines in dark mode',
      'Removed Sunday from Week View (Mon-Sat only)',
      'Distance now always shown in miles (was feet for short distances)',
      'Fixed FR selector dropdown readability in Open Cases bar',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-03-26',
    changes: [
      'Stop addresses can now be edited inline - click the pencil icon to change an address and re-geocode',
      'Manual geocode button (map pin icon) on each stop to retry geocoding',
      'Added Photon geocoder as fallback when Nominatim is down or returns no results',
      'Geocoding fallback chain now: Nominatim -> Photon -> Census Bureau -> LocationIQ',
      'Address search autocomplete works even when Nominatim is unavailable (Photon fallback)',
      'Fixed address normalization bug that could mangle city names (e.g. St. Louis)',
      'Home address geocoding improved - failures no longer prevent retries on subsequent days',
      'Open Cases Excel data now persists when clicking New Rep (only cleared manually)',
      'Update Log and version number added to header',
      'UI rebrand to match Mueller Reports Operations Dashboard (Segoe UI, charcoal header, red accent icons)',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-03-23',
    changes: [
      'Geocoding fallback chain: Nominatim -> US Census Bureau -> LocationIQ',
      'Address normalization expands abbreviations and strips apt/unit/suite suffixes',
      'Structured geocoding queries (street, city, state, zip) for better accuracy',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-03-23',
    changes: [
      'Route stats and action buttons moved above stops list in left panel',
      'Chrome extension now persists progress when popup closes',
      'Chrome extension retries timed-out cases and allows manual address input',
      'Clickable map pins for open cases with "Add to Route" button',
      'Weekly view shows missed exterior opportunities within 20 miles',
      'Duplicate area analysis now ignores home addresses',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-03-21',
    changes: [
      'Fixed URI Too Long error when sending data to the site (hash fragment instead of query param)',
      'Open case map pins now appear correctly after geocoding',
      'Open Cases bar moved to top of page with lazy geocoding for visible cases',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-03-20',
    changes: [
      'Open Cases Excel import with map pins showing case locations',
      'Fixed blank page crash when stops exist in store',
      'Stop numbers reorder to match optimized route sequence',
      'Removed duplicate route legend',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-19',
    changes: [
      'Client-side route optimization (nearest-neighbor + 2-opt) replacing ORS VROOM API',
      'Optimized route displayed in green on the map alongside original blue route',
      'Home address markers (H) with home as start and end of each day',
      'City-based duplicate area detection in Week View',
      'Chrome extension Excel import with home address detection and mileage flags',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-03-18',
    changes: [
      'Chrome extension v3: auto-extract report type, date, survey type mapping',
      'Weekend days (Sat-Sun) added to week view',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-03-17',
    changes: [
      'Chrome extension for case # lookup from Mueller Reports',
      'Week View with day-by-day route analysis and PDF/image export',
      'New Rep reset button to clear all data and start fresh',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-03-16',
    changes: [
      'Initial release: Mueller Reports Route Optimizer',
      'Interactive map with Leaflet + OpenStreetMap',
      'Add/remove/reorder stops with address geocoding',
      'Route calculation via OpenRouteService API',
      'Survey type tracking (Exterior, Interior/Exterior, High Value, etc.)',
    ],
  },
];

export const CURRENT_VERSION = '1.7.0';

export default function Changelog({ onClose }) {
  return (
    <div className="changelog-overlay" onClick={onClose}>
      <div className="changelog-modal" onClick={e => e.stopPropagation()}>
        <div className="changelog-header">
          <h2>Update Log</h2>
          <span className="changelog-version">v{CURRENT_VERSION}</span>
          <button className="changelog-close" onClick={onClose}>x</button>
        </div>
        <div className="changelog-body">
          {CHANGELOG.map((release) => (
            <div key={release.version} className="changelog-release">
              <div className="release-header">
                <span className="release-version">v{release.version}</span>
                <span className="release-date">{release.date}</span>
              </div>
              <ul className="release-changes">
                {release.changes.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
