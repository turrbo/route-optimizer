// Popup logic for Mueller Reports Route Optimizer

// DOM Elements
const addressInput = document.getElementById('addressInput');
const addBtn = document.getElementById('addBtn');
const scanBtn = document.getElementById('scanBtn');
const stopsList = document.getElementById('stopsList');
const clearBtn = document.getElementById('clearBtn');
const sendBtn = document.getElementById('sendBtn');
const countBadge = document.getElementById('countBadge');
const settingsToggle = document.getElementById('settingsToggle');
const settingsIcon = document.getElementById('settingsIcon');
const settingsContent = document.getElementById('settingsContent');
const appUrlInput = document.getElementById('appUrlInput');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

let pendingStops = [];
let appUrl = 'http://localhost:5173';

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();
});

// Load data from storage
function loadData() {
  chrome.storage.local.get(['pendingStops', 'appUrl'], (result) => {
    pendingStops = result.pendingStops || [];
    appUrl = result.appUrl || 'http://localhost:5173';

    appUrlInput.value = appUrl;
    renderStops();
  });
}

// Setup event listeners
function setupEventListeners() {
  // Add address
  addBtn.addEventListener('click', addAddress);
  addressInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addAddress();
    }
  });

  // Scan page
  scanBtn.addEventListener('click', scanPage);

  // Clear all
  clearBtn.addEventListener('click', clearAll);

  // Send to route optimizer
  sendBtn.addEventListener('click', sendToRouteOptimizer);

  // Settings toggle
  settingsToggle.addEventListener('click', toggleSettings);

  // Save settings
  saveSettingsBtn.addEventListener('click', saveSettings);
}

// Add address manually
function addAddress() {
  const address = addressInput.value.trim();

  if (!address) {
    return;
  }

  const newStop = {
    address: address,
    addedAt: Date.now()
  };

  pendingStops.push(newStop);
  saveStops();

  addressInput.value = '';
  addressInput.focus();
}

// Scan page for addresses
async function scanPage() {
  scanBtn.disabled = true;
  scanBtn.textContent = 'Scanning...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.tabs.sendMessage(tab.id, { action: 'scanForAddresses' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error scanning page:', chrome.runtime.lastError);
        alert('Could not scan page. Please refresh the page and try again.');
        scanBtn.disabled = false;
        scanBtn.innerHTML = '<span class="scan-icon">🔍</span><span>Scan Page for Addresses</span>';
        return;
      }

      if (response && response.addresses && response.addresses.length > 0) {
        // Add found addresses
        const addedCount = response.addresses.length;

        response.addresses.forEach(address => {
          // Check if address already exists
          const exists = pendingStops.some(stop =>
            stop.address.toLowerCase() === address.toLowerCase()
          );

          if (!exists) {
            pendingStops.push({
              address: address,
              addedAt: Date.now()
            });
          }
        });

        saveStops();
        alert(`Found and added ${addedCount} address(es) from the page.`);
      } else {
        alert('No addresses found on this page.');
      }

      scanBtn.disabled = false;
      scanBtn.innerHTML = '<span class="scan-icon">🔍</span><span>Scan Page for Addresses</span>';
    });
  } catch (error) {
    console.error('Error:', error);
    alert('Could not scan page. Please try again.');
    scanBtn.disabled = false;
    scanBtn.innerHTML = '<span class="scan-icon">🔍</span><span>Scan Page for Addresses</span>';
  }
}

// Remove a specific stop
function removeStop(index) {
  pendingStops.splice(index, 1);
  saveStops();
}

// Clear all stops
function clearAll() {
  if (pendingStops.length === 0) {
    return;
  }

  if (confirm(`Clear all ${pendingStops.length} pending stop(s)?`)) {
    pendingStops = [];
    saveStops();
  }
}

// Send stops to route optimizer
function sendToRouteOptimizer() {
  if (pendingStops.length === 0) {
    alert('No stops to send. Please add at least one address.');
    return;
  }

  // Prepare URL with stops as pipe-separated query parameter
  const addresses = pendingStops.map(stop => stop.address);
  const stopsParam = encodeURIComponent(addresses.join('|'));
  const url = `${appUrl}?stops=${stopsParam}`;

  // Open the route optimizer in a new tab
  chrome.tabs.create({ url: url });

  // Optionally clear stops after sending
  if (confirm('Stops sent to Route Optimizer. Clear the list?')) {
    pendingStops = [];
    saveStops();
  }
}

// Toggle settings panel
function toggleSettings() {
  const isOpen = settingsContent.classList.contains('open');

  if (isOpen) {
    settingsContent.classList.remove('open');
    settingsIcon.classList.remove('open');
  } else {
    settingsContent.classList.add('open');
    settingsIcon.classList.add('open');
  }
}

// Save settings
function saveSettings() {
  const newUrl = appUrlInput.value.trim();

  if (!newUrl) {
    alert('Please enter a valid URL.');
    return;
  }

  // Basic URL validation
  try {
    new URL(newUrl);
  } catch (error) {
    alert('Please enter a valid URL (e.g., http://localhost:5173)');
    return;
  }

  appUrl = newUrl;
  chrome.storage.local.set({ appUrl }, () => {
    saveSettingsBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveSettingsBtn.textContent = 'Save Settings';
    }, 2000);
  });
}

// Save stops to storage
function saveStops() {
  chrome.storage.local.set({ pendingStops }, () => {
    renderStops();

    // Update badge
    chrome.runtime.sendMessage({ action: 'updateBadge' });
  });
}

// Render stops list
function renderStops() {
  // Update count badge
  if (pendingStops.length > 0) {
    countBadge.textContent = pendingStops.length;
    countBadge.style.display = 'inline-block';
  } else {
    countBadge.style.display = 'none';
  }

  // Render list
  if (pendingStops.length === 0) {
    stopsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📍</div>
        <div class="empty-state-text">
          No pending stops.<br>
          Add an address or scan a page to get started.
        </div>
      </div>
    `;
    return;
  }

  stopsList.innerHTML = pendingStops.map((stop, index) => `
    <div class="stop-item">
      <div class="stop-number">${index + 1}</div>
      <div class="stop-content">
        <div class="stop-address">${escapeHtml(stop.address)}</div>
        <div class="stop-time">${formatTime(stop.addedAt)}</div>
      </div>
      <button class="stop-remove" data-index="${index}" title="Remove stop">×</button>
    </div>
  `).join('');

  // Add remove listeners
  document.querySelectorAll('.stop-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      removeStop(index);
    });
  });
}

// Format timestamp
function formatTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return 'Just now';
  } else if (minutes < 60) {
    return `${minutes} min ago`;
  } else if (hours < 24) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'addressAdded') {
    loadData(); // Reload data when address is added via context menu
  }
});
