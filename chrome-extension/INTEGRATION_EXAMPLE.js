/**
 * ROUTE OPTIMIZER WEB APP - CHROME EXTENSION INTEGRATION
 *
 * Add this code to your Route Optimizer web app to handle addresses
 * sent from the Chrome extension.
 */

// ============================================================================
// EXAMPLE 1: Parse stops from URL on app load (React)
// ============================================================================

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

function RouteOptimizerApp() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stops, setStops] = useState([]);

  useEffect(() => {
    // Get stops from URL parameter
    const stopsParam = searchParams.get('stops');

    if (stopsParam) {
      // Split pipe-separated addresses
      const addresses = stopsParam.split('|');

      // Convert to your app's stop format
      const parsedStops = addresses.map((address, index) => ({
        id: `imported-${Date.now()}-${index}`,
        address: address.trim(),
        position: { lat: null, lng: null }, // Geocode these
        order: index,
        imported: true,
        importedAt: new Date().toISOString()
      }));

      // Add to your stops state
      setStops(prevStops => [...prevStops, ...parsedStops]);

      // Optional: Show notification
      console.log(`Imported ${parsedStops.length} stops from Chrome extension`);

      // Clean up URL (remove stops param)
      searchParams.delete('stops');
      setSearchParams(searchParams, { replace: true });

      // Optional: Trigger geocoding for all imported stops
      geocodeImportedStops(parsedStops);
    }
  }, [searchParams]);

  // ... rest of your app
}

// ============================================================================
// EXAMPLE 2: Vanilla JavaScript implementation
// ============================================================================

// On page load
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const stopsParam = urlParams.get('stops');

  if (stopsParam) {
    const addresses = stopsParam.split('|');

    console.log('Received stops from Chrome extension:', addresses);

    // Add each address to your route optimizer
    addresses.forEach((address, index) => {
      addStopToRoute({
        address: address.trim(),
        order: index,
        imported: true
      });
    });

    // Show success message
    showNotification(`Imported ${addresses.length} stops from Chrome extension`);

    // Clean URL
    const newUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, newUrl);
  }
});

// ============================================================================
// EXAMPLE 3: Geocoding imported addresses
// ============================================================================

async function geocodeImportedStops(stops) {
  const geocoder = new google.maps.Geocoder(); // or your preferred service

  for (const stop of stops) {
    try {
      const result = await geocodeAddress(stop.address, geocoder);

      if (result) {
        stop.position = {
          lat: result.geometry.location.lat(),
          lng: result.geometry.location.lng()
        };
        stop.formattedAddress = result.formatted_address;
        console.log(`Geocoded: ${stop.address} → ${stop.formattedAddress}`);
      }
    } catch (error) {
      console.error(`Failed to geocode: ${stop.address}`, error);
      stop.geocodeError = true;
    }
  }

  // Update your app state with geocoded stops
  return stops;
}

function geocodeAddress(address, geocoder) {
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results[0]) {
        resolve(results[0]);
      } else {
        reject(new Error(`Geocoding failed: ${status}`));
      }
    });
  });
}

// ============================================================================
// EXAMPLE 4: Show user notification
// ============================================================================

function showNotification(message, type = 'success') {
  // Using your app's notification system
  // This could be a toast, alert, or custom component

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: ${type === 'success' ? '#4caf50' : '#f44336'};
    color: white;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// ============================================================================
// EXAMPLE 5: Full integration with state management (Redux/Zustand)
// ============================================================================

// Using Zustand
import create from 'zustand';

const useRouteStore = create((set, get) => ({
  stops: [],

  addStop: (stop) => set(state => ({
    stops: [...state.stops, stop]
  })),

  addMultipleStops: (stops) => set(state => ({
    stops: [...state.stops, ...stops]
  })),

  importStopsFromExtension: async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const stopsParam = urlParams.get('stops');

    if (!stopsParam) return;

    const addresses = stopsParam.split('|');
    const parsedStops = addresses.map((address, index) => ({
      id: `ext-${Date.now()}-${index}`,
      address: address.trim(),
      position: null,
      order: index,
      source: 'chrome-extension',
      importedAt: Date.now()
    }));

    // Add to store
    get().addMultipleStops(parsedStops);

    // Geocode in background
    geocodeStops(parsedStops).then(geocodedStops => {
      // Update stops with geocoded data
      set(state => ({
        stops: state.stops.map(stop => {
          const geocoded = geocodedStops.find(g => g.id === stop.id);
          return geocoded || stop;
        })
      }));
    });

    // Clean URL
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.hash
    );

    return parsedStops.length;
  }
}));

// In your app component
function App() {
  const importStopsFromExtension = useRouteStore(
    state => state.importStopsFromExtension
  );

  useEffect(() => {
    importStopsFromExtension().then(count => {
      if (count > 0) {
        console.log(`Imported ${count} stops from extension`);
      }
    });
  }, []);

  // ... rest of app
}

// ============================================================================
// EXAMPLE 6: TypeScript interface definitions
// ============================================================================

interface ImportedStop {
  id: string;
  address: string;
  position: {
    lat: number | null;
    lng: number | null;
  };
  order: number;
  imported: boolean;
  importedAt: string | number;
  formattedAddress?: string;
  geocodeError?: boolean;
}

interface ExtensionImportResult {
  success: boolean;
  count: number;
  stops: ImportedStop[];
  errors?: string[];
}

async function importStopsFromExtension(): Promise<ExtensionImportResult> {
  const urlParams = new URLSearchParams(window.location.search);
  const stopsParam = urlParams.get('stops');

  if (!stopsParam) {
    return { success: false, count: 0, stops: [] };
  }

  try {
    const addresses = stopsParam.split('|');
    const stops: ImportedStop[] = addresses.map((address, index) => ({
      id: `ext-${Date.now()}-${index}`,
      address: address.trim(),
      position: { lat: null, lng: null },
      order: index,
      imported: true,
      importedAt: Date.now()
    }));

    return {
      success: true,
      count: stops.length,
      stops
    };
  } catch (error) {
    return {
      success: false,
      count: 0,
      stops: [],
      errors: [(error as Error).message]
    };
  }
}

// ============================================================================
// EXAMPLE 7: Testing utility
// ============================================================================

/**
 * Test the extension integration locally
 * Open browser console and run: testExtensionIntegration()
 */
function testExtensionIntegration() {
  const testAddresses = [
    '123 Main Street, Springfield, IL 62701',
    '456 Oak Avenue, Chicago, IL 60601',
    '789 Elm Boulevard, Boston, MA 02108'
  ];

  const stopsParam = testAddresses.join('|');
  const testUrl = `${window.location.origin}${window.location.pathname}?stops=${encodeURIComponent(stopsParam)}`;

  console.log('Test URL:', testUrl);
  console.log('Copy this URL to test the extension integration:');
  console.log(testUrl);

  // Optionally open in new tab
  // window.open(testUrl, '_blank');
}

// ============================================================================
// NOTES FOR IMPLEMENTATION
// ============================================================================

/*
1. ADD URL PARAMETER PARSING
   - Check for 'stops' query parameter on app load
   - Parse pipe-separated addresses
   - Convert to your app's stop format

2. GEOCODE IMPORTED ADDRESSES
   - Use Google Maps Geocoding API or alternative
   - Handle geocoding errors gracefully
   - Show loading state during geocoding

3. UPDATE UI
   - Show notification when stops are imported
   - Highlight imported stops in the list
   - Allow user to review before optimizing

4. CLEAN UP URL
   - Remove 'stops' parameter after importing
   - Use history.replaceState to avoid back button issues
   - Preserve other URL parameters if any

5. ERROR HANDLING
   - Handle malformed addresses
   - Deal with geocoding failures
   - Provide fallback for invalid input

6. USER EXPERIENCE
   - Show import progress for many addresses
   - Allow users to edit imported addresses
   - Provide option to undo import
   - Auto-optimize route after import (optional)

7. TESTING
   - Test with various address formats
   - Test with special characters in addresses
   - Test with large numbers of addresses (50+)
   - Test URL encoding/decoding edge cases
*/
