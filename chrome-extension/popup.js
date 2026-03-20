// Popup logic for Mueller Reports Route Optimizer v2
// Handles case # lookup via background.js and manual stop management

// DOM Elements - Tabs
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// DOM Elements - Case Lookup
const caseInput = document.getElementById('caseInput');
const lookupBtn = document.getElementById('lookupBtn');
const progressSection = document.getElementById('progressSection');
const progressText = document.getElementById('progressText');
const progressCount = document.getElementById('progressCount');
const progressFill = document.getElementById('progressFill');
const progressStatus = document.getElementById('progressStatus');
const resultsSection = document.getElementById('resultsSection');
const resultsList = document.getElementById('resultsList');
const addSuccessBtn = document.getElementById('addSuccessBtn');
const clearResultsBtn = document.getElementById('clearResultsBtn');

// DOM Elements - Stops
const addressInput = document.getElementById('addressInput');
const addBtn = document.getElementById('addBtn');
const stopsList = document.getElementById('stopsList');
const clearBtn = document.getElementById('clearBtn');
const sendBtn = document.getElementById('sendBtn');
const countBadge = document.getElementById('countBadge');

// DOM Elements - Settings
const settingsToggle = document.getElementById('settingsToggle');
const settingsIcon = document.getElementById('settingsIcon');
const settingsContent = document.getElementById('settingsContent');
const appUrlInput = document.getElementById('appUrlInput');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

let pendingStops = [];
let appUrl = 'https://turrbo.github.io/route-optimizer/';
let lookupResults = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();
});

function loadData() {
  chrome.storage.local.get(['pendingStops', 'appUrl'], (result) => {
    pendingStops = result.pendingStops || [];
    appUrl = result.appUrl || 'https://turrbo.github.io/route-optimizer/';
    appUrlInput.value = appUrl;
    renderStops();
    updateBadge();
  });
}

function setupEventListeners() {
  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${target}`).classList.add('active');
    });
  });

  // Case lookup
  lookupBtn.addEventListener('click', startLookup);
  caseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) startLookup();
  });

  // Add results to stops
  addSuccessBtn.addEventListener('click', addResultsToStops);
  clearResultsBtn.addEventListener('click', clearResults);

  // Manual address add
  addBtn.addEventListener('click', addAddress);
  addressInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addAddress();
  });

  // Stop management
  clearBtn.addEventListener('click', clearAll);
  sendBtn.addEventListener('click', sendToRouteOptimizer);

  // Settings
  settingsToggle.addEventListener('click', toggleSettings);
  saveSettingsBtn.addEventListener('click', saveSettings);
}

// --- Case # Lookup ---

function parseCaseNumbers(text) {
  return text
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && /^\d+$/.test(s));
}

function startLookup() {
  const raw = caseInput.value.trim();
  if (!raw) return;

  const caseNumbers = parseCaseNumbers(raw);
  if (caseNumbers.length === 0) {
    alert('No valid case numbers found. Enter numeric case numbers, one per line or comma-separated.');
    return;
  }

  // Show progress
  lookupBtn.disabled = true;
  lookupBtn.textContent = 'Looking up...';
  progressSection.classList.add('active');
  progressText.textContent = 'Looking up cases...';
  progressCount.textContent = `0 / ${caseNumbers.length}`;
  progressFill.style.width = '0%';
  progressStatus.textContent = '';
  resultsSection.style.display = 'none';
  lookupResults = [];

  // Send to background script
  chrome.runtime.sendMessage(
    { action: 'lookupCases', caseNumbers },
    (response) => {
      lookupBtn.disabled = false;
      lookupBtn.textContent = 'Look Up Addresses';
      progressSection.classList.remove('active');

      if (response && response.results) {
        lookupResults = response.results;
        renderResults();
      } else {
        alert('Lookup failed. Make sure you are logged into mueller-inc.com.');
      }
    }
  );
}

// Listen for progress updates from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'lookupProgress') {
    const pct = Math.round((request.completed / request.total) * 100);
    progressCount.textContent = `${request.completed} / ${request.total}`;
    progressFill.style.width = `${pct}%`;

    if (request.latest) {
      if (request.latest.success) {
        progressStatus.textContent = `Found: ${request.latest.address}`;
      } else {
        progressStatus.textContent = `Case ${request.latest.caseNumber}: ${request.latest.error || 'Not found'}`;
      }
    }
  }

  if (request.action === 'addressAdded') {
    loadData();
  }
});

function renderResults() {
  resultsSection.style.display = 'block';
  const successCount = lookupResults.filter(r => r.success).length;

  resultsList.innerHTML = lookupResults.map((result, index) => {
    if (result.success) {
      return `
        <div class="result-item success">
          <span class="result-icon">&#10003;</span>
          <div class="result-content">
            <div class="result-case">Case #${escapeHtml(result.caseNumber)}</div>
            <div class="result-address">${escapeHtml(result.address)}</div>
          </div>
          <button class="result-remove" data-index="${index}" title="Remove">&#215;</button>
        </div>
      `;
    } else {
      return `
        <div class="result-item error">
          <span class="result-icon">&#10007;</span>
          <div class="result-content">
            <div class="result-case">Case #${escapeHtml(result.caseNumber)}</div>
            <div class="result-error">${escapeHtml(result.error || 'Address not found')}</div>
          </div>
        </div>
      `;
    }
  }).join('');

  // Enable/disable add button
  addSuccessBtn.disabled = successCount === 0;
  addSuccessBtn.textContent = successCount > 0
    ? `Add ${successCount} Address${successCount > 1 ? 'es' : ''} to Stops`
    : 'No Addresses Found';

  // Remove button listeners
  document.querySelectorAll('#resultsList .result-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      lookupResults.splice(index, 1);
      renderResults();
    });
  });
}

function addResultsToStops() {
  const successful = lookupResults.filter(r => r.success);
  if (successful.length === 0) return;

  successful.forEach(result => {
    const exists = pendingStops.some(stop =>
      stop.address.toLowerCase() === result.address.toLowerCase()
    );

    if (!exists) {
      pendingStops.push({
        address: result.address,
        caseNumber: result.caseNumber,
        addedAt: Date.now()
      });
    }
  });

  saveStops();
  clearResults();

  // Switch to stops tab
  tabs.forEach(t => t.classList.remove('active'));
  tabContents.forEach(tc => tc.classList.remove('active'));
  document.querySelector('[data-tab="stops"]').classList.add('active');
  document.getElementById('tab-stops').classList.add('active');
}

function clearResults() {
  lookupResults = [];
  resultsSection.style.display = 'none';
  resultsList.innerHTML = '';
  caseInput.value = '';
}

// --- Manual Stops ---

function addAddress() {
  const address = addressInput.value.trim();
  if (!address) return;

  pendingStops.push({
    address: address,
    caseNumber: '',
    addedAt: Date.now()
  });

  saveStops();
  addressInput.value = '';
  addressInput.focus();
}

function removeStop(index) {
  pendingStops.splice(index, 1);
  saveStops();
}

function clearAll() {
  if (pendingStops.length === 0) return;
  if (confirm(`Clear all ${pendingStops.length} pending stop(s)?`)) {
    pendingStops = [];
    saveStops();
  }
}

function sendToRouteOptimizer() {
  if (pendingStops.length === 0) {
    alert('No stops to send. Look up case numbers or add addresses first.');
    return;
  }

  const addresses = pendingStops.map(stop => stop.address);
  const stopsParam = encodeURIComponent(addresses.join('|'));
  const url = `${appUrl}?stops=${stopsParam}`;

  chrome.tabs.create({ url });

  if (confirm('Stops sent to Route Optimizer. Clear the list?')) {
    pendingStops = [];
    saveStops();
  }
}

// --- Settings ---

function toggleSettings() {
  const isOpen = settingsContent.classList.contains('open');
  settingsContent.classList.toggle('open');
  settingsIcon.classList.toggle('open');
}

function saveSettings() {
  const newUrl = appUrlInput.value.trim();
  if (!newUrl) {
    alert('Please enter a valid URL.');
    return;
  }

  try {
    new URL(newUrl);
  } catch {
    alert('Please enter a valid URL (e.g., https://turrbo.github.io/route-optimizer/)');
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

// --- Storage & Rendering ---

function saveStops() {
  chrome.storage.local.set({ pendingStops }, () => {
    renderStops();
    updateBadge();
    chrome.runtime.sendMessage({ action: 'updateBadge' });
  });
}

function updateBadge() {
  if (pendingStops.length > 0) {
    countBadge.textContent = `${pendingStops.length} stop${pendingStops.length > 1 ? 's' : ''}`;
    countBadge.style.display = 'inline-block';
  } else {
    countBadge.style.display = 'none';
  }
}

function renderStops() {
  updateBadge();

  if (pendingStops.length === 0) {
    stopsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-text">
          No pending stops.<br>
          Use Case # Lookup or add addresses manually.
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
        ${stop.caseNumber ? `<div class="stop-case">Case #${escapeHtml(stop.caseNumber)}</div>` : ''}
      </div>
      <button class="stop-remove" data-index="${index}" title="Remove">&#215;</button>
    </div>
  `).join('');

  document.querySelectorAll('.stop-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      removeStop(index);
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
