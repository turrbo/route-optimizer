// Popup logic for Mueller Reports Route Optimizer v3
// Case # lookup with auto report type mapping, date extraction, and day sorting

// --- Survey type mapping from Mueller report types ---
const SURVEY_TYPE_MAP = [
  { pattern: /elite\s+high\s+value/i, type: 'Elite High Value' },
  { pattern: /high\s+value/i, type: 'High Value' },
  { pattern: /interior\s*\/\s*exterior/i, type: 'Interior/Exterior' },
  { pattern: /interior\s+exterior/i, type: 'Interior/Exterior' },
  { pattern: /exterior/i, type: 'Exterior' },
  { pattern: /lender/i, type: 'Lender Appt' },
  { pattern: /\bLPC\b/i, type: 'LPC' },
  { pattern: /commercial/i, type: 'Commercial' },
];

function mapReportType(rawType) {
  if (!rawType) return 'Exterior';
  for (const entry of SURVEY_TYPE_MAP) {
    if (entry.pattern.test(rawType)) return entry.type;
  }
  return 'Exterior';
}

/**
 * Parse a date string from Mueller (e.g. "03/20/2026", "3/20/26") to YYYY-MM-DD
 */
function parseMuellerDate(raw) {
  if (!raw) return null;
  const cleaned = raw.trim();

  // Try MM/DD/YYYY or M/D/YYYY
  let match = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (match) {
    let [, m, d, y] = match;
    if (y.length === 2) y = (parseInt(y) > 50 ? '19' : '20') + y;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Try YYYY-MM-DD already
  match = cleaned.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return cleaned;

  return null;
}

/**
 * Format YYYY-MM-DD as a friendly day string
 */
function formatDayLabel(dateStr) {
  if (!dateStr) return 'No date';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${dayNames[date.getDay()]} ${monthNames[date.getMonth()]} ${d}`;
}

// DOM Elements - Tabs
const tabBtns = document.querySelectorAll('.tab');
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
  tabBtns.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabBtns.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${target}`).classList.add('active');
    });
  });

  lookupBtn.addEventListener('click', startLookup);
  caseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) startLookup();
  });

  addSuccessBtn.addEventListener('click', addResultsToStops);
  clearResultsBtn.addEventListener('click', clearResults);

  addBtn.addEventListener('click', addAddress);
  addressInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addAddress();
  });

  clearBtn.addEventListener('click', clearAll);
  sendBtn.addEventListener('click', sendToRouteOptimizer);

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

  lookupBtn.disabled = true;
  lookupBtn.textContent = 'Looking up...';
  progressSection.classList.add('active');
  progressText.textContent = 'Looking up cases...';
  progressCount.textContent = `0 / ${caseNumbers.length}`;
  progressFill.style.width = '0%';
  progressStatus.textContent = '';
  resultsSection.style.display = 'none';
  lookupResults = [];

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
chrome.runtime.onMessage.addListener((request) => {
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
      const surveyType = mapReportType(result.reportType);
      const dateStr = parseMuellerDate(result.dateInspected);
      const dayLabel = formatDayLabel(dateStr);

      return `
        <div class="result-item success">
          <span class="result-icon">&#10003;</span>
          <div class="result-content">
            <div class="result-case">Case #${escapeHtml(result.caseNumber)}</div>
            <div class="result-address">${escapeHtml(result.address)}</div>
            <div class="result-meta">
              <span class="result-tag type-tag">${escapeHtml(surveyType)}</span>
              <span class="result-tag date-tag">${escapeHtml(dayLabel)}</span>
              ${result.reportType ? `<span class="result-raw-type">${escapeHtml(result.reportType)}</span>` : ''}
            </div>
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

  addSuccessBtn.disabled = successCount === 0;
  addSuccessBtn.textContent = successCount > 0
    ? `Add ${successCount} Address${successCount > 1 ? 'es' : ''} to Stops`
    : 'No Addresses Found';

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
      const surveyType = mapReportType(result.reportType);
      const dayDate = parseMuellerDate(result.dateInspected) || null;

      pendingStops.push({
        address: result.address,
        caseNumber: result.caseNumber,
        surveyType: surveyType,
        dayDate: dayDate,
        addedAt: Date.now()
      });
    }
  });

  saveStops();
  clearResults();

  // Switch to stops tab
  tabBtns.forEach(t => t.classList.remove('active'));
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
    surveyType: 'Exterior',
    dayDate: null,
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

  // Build enriched stop data with all fields
  const stopData = pendingStops.map(stop => ({
    address: stop.address,
    caseNumber: stop.caseNumber || '',
    surveyType: stop.surveyType || 'Exterior',
    dayDate: stop.dayDate || null
  }));

  // Encode as base64 JSON for URL transport
  const json = JSON.stringify(stopData);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  const url = `${appUrl}?data=${encoded}`;

  chrome.tabs.create({ url });

  if (confirm('Stops sent to Route Optimizer. Clear the list?')) {
    pendingStops = [];
    saveStops();
  }
}

// --- Settings ---

function toggleSettings() {
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

  // Group stops by dayDate for display
  const grouped = {};
  const noDate = [];
  pendingStops.forEach((stop, index) => {
    if (stop.dayDate) {
      if (!grouped[stop.dayDate]) grouped[stop.dayDate] = [];
      grouped[stop.dayDate].push({ ...stop, _index: index });
    } else {
      noDate.push({ ...stop, _index: index });
    }
  });

  // Sort days chronologically
  const sortedDays = Object.keys(grouped).sort();

  let html = '';

  // Render grouped by day
  sortedDays.forEach(dayDate => {
    const stops = grouped[dayDate];
    const label = formatDayLabel(dayDate);
    html += `<div class="stop-day-header">${escapeHtml(label)} (${dayDate})</div>`;
    stops.forEach((stop, i) => {
      html += renderStopItem(stop, i + 1);
    });
  });

  // Render undated stops
  if (noDate.length > 0) {
    if (sortedDays.length > 0) {
      html += `<div class="stop-day-header">No Date Assigned</div>`;
    }
    noDate.forEach((stop, i) => {
      html += renderStopItem(stop, i + 1);
    });
  }

  stopsList.innerHTML = html;

  document.querySelectorAll('.stop-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      removeStop(index);
    });
  });
}

function renderStopItem(stop, num) {
  return `
    <div class="stop-item">
      <div class="stop-number">${num}</div>
      <div class="stop-content">
        <div class="stop-address">${escapeHtml(stop.address)}</div>
        <div class="stop-meta">
          ${stop.caseNumber ? `<span class="stop-tag">Case #${escapeHtml(stop.caseNumber)}</span>` : ''}
          ${stop.surveyType ? `<span class="stop-tag type-tag">${escapeHtml(stop.surveyType)}</span>` : ''}
        </div>
      </div>
      <button class="stop-remove" data-index="${stop._index}" title="Remove">&#215;</button>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
