// Popup logic for Mueller Reports Route Optimizer v4
// Excel import, Case # lookup, home address detection, mileage flagging

// --- Survey type mapping from Mueller report types ---
const SURVEY_TYPE_MAP = [
  { pattern: /close\s*out/i, type: 'Exterior' },
  { pattern: /elite\s+high\s+value/i, type: 'Elite High Value' },
  { pattern: /high\s+value/i, type: 'High Value' },
  { pattern: /interior\s*[\/&]\s*exterior/i, type: 'Interior/Exterior' },
  { pattern: /interior\s+exterior/i, type: 'Interior/Exterior' },
  { pattern: /exterior/i, type: 'Exterior' },
  { pattern: /lender/i, type: 'Lender Appt' },
  { pattern: /\bLPC\b/i, type: 'LPC' },
  { pattern: /commercial/i, type: 'Commercial' },
];

function mapReportType(rawType) {
  if (!rawType) return 'Exterior';
  const str = String(rawType);
  for (const entry of SURVEY_TYPE_MAP) {
    if (entry.pattern.test(str)) return entry.type;
  }
  return 'Exterior';
}

/**
 * Parse dates in multiple formats:
 *   "Mon 03/16/26", "03/16/26", "03/16/2026", "2026-03-16"
 */
function parseDate(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim();

  // "Mon 03/16/26" or "03/16/26"
  let match = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (match) {
    let [, m, d, y] = match;
    if (y.length === 2) y = (parseInt(y) > 50 ? '19' : '20') + y;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Already YYYY-MM-DD
  match = cleaned.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return cleaned;

  return null;
}

/**
 * Format YYYY-MM-DD as friendly day label
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

/**
 * Check if a "Previous Case/Address" value is a home address (not a case number).
 * Case numbers are purely numeric; addresses contain letters.
 */
function isAddress(value) {
  if (!value) return false;
  const str = String(value).trim();
  if (!str) return false;
  // If it contains any letter, it's an address
  return /[a-zA-Z]/.test(str);
}

// ===================== DOM ELEMENTS =====================

// Tabs
const tabBtns = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// Excel Import
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileRemove = document.getElementById('fileRemove');
const importPreview = document.getElementById('importPreview');
const importSummary = document.getElementById('importSummary');
const importList = document.getElementById('importList');
const importAddBtn = document.getElementById('importAddBtn');
const importClearBtn = document.getElementById('importClearBtn');
const excelProgressSection = document.getElementById('excelProgressSection');
const excelProgressText = document.getElementById('excelProgressText');
const excelProgressCount = document.getElementById('excelProgressCount');
const excelProgressFill = document.getElementById('excelProgressFill');
const excelProgressStatus = document.getElementById('excelProgressStatus');

// Case Lookup
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

// Stops
const addressInput = document.getElementById('addressInput');
const addBtn = document.getElementById('addBtn');
const stopsList = document.getElementById('stopsList');
const clearBtn = document.getElementById('clearBtn');
const sendBtn = document.getElementById('sendBtn');
const countBadge = document.getElementById('countBadge');

// Settings
const settingsToggle = document.getElementById('settingsToggle');
const settingsIcon = document.getElementById('settingsIcon');
const settingsContent = document.getElementById('settingsContent');
const appUrlInput = document.getElementById('appUrlInput');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

// ===================== STATE =====================

let pendingStops = [];
let appUrl = 'https://turrbo.github.io/route-optimizer/';
let lookupResults = [];
let excelData = []; // Parsed rows from Excel
let currentHomeAddresses = {}; // Stored for re-rendering during lookup

// ===================== INIT =====================

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

  // Excel Import
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragging');
  });
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragging');
  });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file) handleExcelFile(file);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) handleExcelFile(file);
  });
  fileRemove.addEventListener('click', clearExcelImport);
  importAddBtn.addEventListener('click', addExcelToStops);
  importClearBtn.addEventListener('click', clearExcelImport);

  // Case Lookup
  lookupBtn.addEventListener('click', startLookup);
  caseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) startLookup();
  });
  addSuccessBtn.addEventListener('click', addResultsToStops);
  clearResultsBtn.addEventListener('click', clearResults);

  // Manual Stops
  addBtn.addEventListener('click', addAddress);
  addressInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addAddress();
  });
  clearBtn.addEventListener('click', clearAll);
  sendBtn.addEventListener('click', sendToRouteOptimizer);

  // Settings
  settingsToggle.addEventListener('click', toggleSettings);
  saveSettingsBtn.addEventListener('click', saveSettings);
}

// ===================== EXCEL IMPORT =====================

function handleExcelFile(file) {
  fileName.textContent = file.name;
  fileInfo.classList.add('active');

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

      parseExcelRows(rows);
    } catch (err) {
      alert('Could not parse Excel file: ' + err.message);
      clearExcelImport();
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseExcelRows(rows) {
  if (rows.length < 2) {
    alert('Excel file appears empty.');
    return;
  }

  // Find header row - look for "Control" in first few rows
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (row && row.some(cell => String(cell || '').toLowerCase().includes('control'))) {
      headerIdx = i;
      break;
    }
  }

  const header = rows[headerIdx].map(h => String(h || '').toLowerCase().trim());

  // Find column indices
  const colIdx = {
    control: header.findIndex(h => h.includes('control')),
    date: header.findIndex(h => h.includes('inspect') || h.includes('date')),
    prevCase: header.findIndex(h => h.includes('previous') || h.includes('prev')),
    actualMileage: header.findIndex(h => h.includes('actual')),
    estMileage: header.findIndex(h => h.includes('estimated') || h.includes('est')),
    surveyType: header.findIndex(h => h.includes('survey')),
    appt: header.findIndex(h => h.includes('appt')),
  };

  // Parse data rows
  excelData = [];
  const homeAddresses = {}; // dayDate -> home address

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[colIdx.control]) continue;

    const controlNum = String(row[colIdx.control] || '').trim();
    if (!controlNum || controlNum === 'null') continue;

    const rawDate = row[colIdx.date] != null ? String(row[colIdx.date]) : null;
    const dayDate = parseDate(rawDate);
    const prevCaseAddr = row[colIdx.prevCase] != null ? String(row[colIdx.prevCase]).trim() : '';
    const actualMileage = colIdx.actualMileage >= 0 ? parseFloat(row[colIdx.actualMileage]) : null;
    const estMileage = colIdx.estMileage >= 0 ? parseFloat(row[colIdx.estMileage]) : null;
    const rawSurvey = colIdx.surveyType >= 0 ? String(row[colIdx.surveyType] || '') : '';
    const surveyType = mapReportType(rawSurvey);
    const apptRequired = colIdx.appt >= 0 ? String(row[colIdx.appt] || '').toLowerCase() === 'yes' : false;

    // Detect home address: first row of each day where prevCase is an actual address
    let homeAddr = null;
    if (dayDate && isAddress(prevCaseAddr) && !homeAddresses[dayDate]) {
      homeAddresses[dayDate] = prevCaseAddr;
      homeAddr = prevCaseAddr;
    }

    // Mileage flag: actual > estimated
    const mileageFlag = (
      actualMileage != null && !isNaN(actualMileage) &&
      estMileage != null && !isNaN(estMileage) &&
      actualMileage > estMileage
    );

    excelData.push({
      controlNum,
      dayDate,
      prevCaseAddr,
      homeAddr, // non-null only for first row of that day
      actualMileage: isNaN(actualMileage) ? null : actualMileage,
      estMileage: isNaN(estMileage) ? null : estMileage,
      mileageFlag,
      surveyType,
      rawSurveyType: rawSurvey,
      apptRequired,
    });
  }

  // Attach home addresses to all rows for that day
  excelData.forEach(item => {
    if (item.dayDate && homeAddresses[item.dayDate]) {
      item.dayHomeAddress = homeAddresses[item.dayDate];
    }
  });

  // Store for re-rendering during lookup progress
  currentHomeAddresses = homeAddresses;

  // Show preview and automatically start looking up addresses
  renderExcelPreview(homeAddresses);
  startExcelLookup(homeAddresses);
}

function renderExcelPreview(homeAddresses) {
  importPreview.classList.add('active');

  const totalCases = excelData.length;
  const days = [...new Set(excelData.map(d => d.dayDate).filter(Boolean))].sort();
  const flaggedCount = excelData.filter(d => d.mileageFlag).length;
  const foundCount = excelData.filter(d => d.resolvedAddress).length;

  importSummary.innerHTML = `
    <div class="summary-card">
      <div class="num">${totalCases}</div>
      <div class="label">Cases</div>
    </div>
    <div class="summary-card">
      <div class="num">${days.length}</div>
      <div class="label">Days</div>
    </div>
    <div class="summary-card">
      <div class="num">${foundCount}/${totalCases}</div>
      <div class="label">Addresses</div>
    </div>
    <div class="summary-card flagged">
      <div class="num">${flaggedCount}</div>
      <div class="label">Over Mileage</div>
    </div>
  `;

  let html = '';
  days.forEach(day => {
    const dayItems = excelData.filter(d => d.dayDate === day);
    const homeAddr = homeAddresses[day] || 'Unknown';
    const label = formatDayLabel(day);

    html += `<div class="import-day-group">`;
    html += `<div class="import-day-header">
      <span>${escapeHtml(label)} (${day}) &mdash; ${dayItems.length} cases</span>
      <span class="home-label">Home: ${escapeHtml(homeAddr.length > 30 ? homeAddr.substring(0, 30) + '...' : homeAddr)}</span>
    </div>`;

    dayItems.forEach(item => {
      const flagClass = item.mileageFlag ? ' flagged' : '';
      let mileageBadge = '';
      if (item.actualMileage != null && item.estMileage != null) {
        if (item.mileageFlag) {
          mileageBadge = `<span class="mileage-badge">${item.actualMileage} / ${item.estMileage} mi</span>`;
        } else {
          mileageBadge = `<span class="mileage-badge mileage-ok">${item.actualMileage} / ${item.estMileage} mi</span>`;
        }
      }

      // Address status
      let addressLine = '';
      if (item.resolvedAddress) {
        const short = item.resolvedAddress.length > 60
          ? item.resolvedAddress.substring(0, 60) + '...'
          : item.resolvedAddress;
        addressLine = `<span class="address-found">${escapeHtml(short)}</span>`;
      } else if (item.lookupError) {
        addressLine = `<span class="address-error">${escapeHtml(item.lookupError)}</span>`;
      } else if (excelLookupInProgress) {
        addressLine = `<span class="address-pending">Looking up...</span>`;
      } else {
        addressLine = `<span class="address-pending">Pending lookup</span>`;
      }

      html += `
        <div class="import-item${flagClass}">
          <div class="item-details">
            <div>
              <span class="case-num">#${escapeHtml(item.controlNum)}</span>
              <span class="survey-badge">${escapeHtml(item.surveyType)}</span>
              ${mileageBadge}
            </div>
            ${addressLine}
          </div>
        </div>
      `;
    });

    html += `</div>`;
  });

  // Undated rows
  const undated = excelData.filter(d => !d.dayDate);
  if (undated.length > 0) {
    html += `<div class="import-day-group">`;
    html += `<div class="import-day-header"><span>No Date &mdash; ${undated.length} cases</span></div>`;
    undated.forEach(item => {
      let addressLine = '';
      if (item.resolvedAddress) {
        addressLine = `<span class="address-found">${escapeHtml(item.resolvedAddress)}</span>`;
      } else if (item.lookupError) {
        addressLine = `<span class="address-error">${escapeHtml(item.lookupError)}</span>`;
      }
      html += `
        <div class="import-item">
          <div class="item-details">
            <div>
              <span class="case-num">#${escapeHtml(item.controlNum)}</span>
              <span class="survey-badge">${escapeHtml(item.surveyType)}</span>
            </div>
            ${addressLine}
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  importList.innerHTML = html;

  // Only enable Add button when lookup is done and we have at least some addresses
  const allDone = !excelLookupInProgress;
  importAddBtn.disabled = !allDone || foundCount === 0;
  if (excelLookupInProgress) {
    importAddBtn.textContent = 'Looking up addresses...';
  } else if (foundCount === 0) {
    importAddBtn.textContent = 'No addresses found';
  } else {
    importAddBtn.textContent = `Add ${foundCount} Addresses to Stops`;
  }
}

// --- Auto address lookup after Excel parse ---

let excelLookupInProgress = false;

function startExcelLookup(homeAddresses) {
  const caseNumbers = excelData.map(d => d.controlNum).filter(c => /^\d+$/.test(c));
  if (caseNumbers.length === 0) {
    renderExcelPreview(homeAddresses);
    return;
  }

  excelLookupInProgress = true;
  excelProgressSection.classList.add('active');
  excelProgressText.textContent = 'Looking up addresses on Mueller Inc...';
  excelProgressCount.textContent = `0 / ${caseNumbers.length}`;
  excelProgressFill.style.width = '0%';
  excelProgressStatus.textContent = 'Make sure you are logged into mueller-inc.com';

  // Disable buttons during lookup
  importAddBtn.disabled = true;
  importAddBtn.textContent = 'Looking up addresses...';
  importClearBtn.disabled = true;

  renderExcelPreview(homeAddresses);

  chrome.runtime.sendMessage(
    { action: 'lookupCases', caseNumbers },
    (response) => {
      excelLookupInProgress = false;
      excelProgressSection.classList.remove('active');
      importClearBtn.disabled = false;

      if (response && response.results) {
        // Merge results into excelData
        response.results.forEach(result => {
          const match = excelData.find(d => d.controlNum === result.caseNumber);
          if (match) {
            if (result.success) {
              match.resolvedAddress = result.address;
              match.lookupError = null;
            } else {
              match.resolvedAddress = null;
              match.lookupError = result.error || 'Not found';
            }
          }
        });
      } else {
        // All failed - mark as error
        excelData.forEach(d => {
          if (!d.resolvedAddress) {
            d.lookupError = 'Lookup failed - are you logged into mueller-inc.com?';
          }
        });
      }

      renderExcelPreview(homeAddresses);
    }
  );
}

// Listen for Excel lookup progress
function handleExcelLookupProgress(request) {
  if (request.action === 'lookupProgress' && excelLookupInProgress) {
    const pct = Math.round((request.completed / request.total) * 100);
    excelProgressCount.textContent = `${request.completed} / ${request.total}`;
    excelProgressFill.style.width = `${pct}%`;

    // Update the individual item as results come in
    if (request.latest) {
      const match = excelData.find(d => d.controlNum === request.latest.caseNumber);
      if (match) {
        if (request.latest.success) {
          match.resolvedAddress = request.latest.address;
          match.lookupError = null;
          excelProgressStatus.textContent = `Found: ${request.latest.address.substring(0, 50)}...`;
        } else {
          match.lookupError = request.latest.error || 'Not found';
          excelProgressStatus.textContent = `Case ${request.latest.caseNumber}: ${request.latest.error || 'Not found'}`;
        }
      }
      // Re-render preview to show updated addresses
      renderExcelPreview(currentHomeAddresses);
    }
  }
}

function addExcelToStops() {
  // Only add items that have resolved addresses
  const resolved = excelData.filter(d => d.resolvedAddress);
  if (resolved.length === 0) return;

  // Group by day to add home address stops
  const dayGroups = {};
  resolved.forEach(item => {
    const key = item.dayDate || '_nodate';
    if (!dayGroups[key]) dayGroups[key] = [];
    dayGroups[key].push(item);
  });

  // For each day, add home address as first stop, then case stops
  Object.keys(dayGroups).sort().forEach(dayKey => {
    const items = dayGroups[dayKey];
    const dayDate = dayKey === '_nodate' ? null : dayKey;

    // Add home address stop if we have one
    const homeAddr = items[0]?.dayHomeAddress;
    if (homeAddr && dayDate) {
      const exists = pendingStops.some(s =>
        s.isHomeAddress && s.dayDate === dayDate
      );
      if (!exists) {
        pendingStops.push({
          address: homeAddr,
          caseNumber: '',
          surveyType: '',
          dayDate: dayDate,
          isHomeAddress: true,
          actualMileage: null,
          estimatedMileage: null,
          mileageFlag: false,
          addedAt: Date.now(),
        });
      }
    }

    // Add each case with the resolved address from Mueller lookup
    items.forEach(item => {
      const exists = pendingStops.some(s =>
        s.caseNumber === item.controlNum && s.dayDate === item.dayDate
      );
      if (!exists) {
        pendingStops.push({
          address: item.resolvedAddress,
          caseNumber: item.controlNum,
          surveyType: item.surveyType,
          dayDate: item.dayDate,
          isHomeAddress: false,
          actualMileage: item.actualMileage,
          estimatedMileage: item.estMileage,
          mileageFlag: item.mileageFlag,
          addedAt: Date.now(),
        });
      }
    });
  });

  saveStops();
  clearExcelImport();

  // Switch to stops tab
  tabBtns.forEach(t => t.classList.remove('active'));
  tabContents.forEach(tc => tc.classList.remove('active'));
  document.querySelector('[data-tab="stops"]').classList.add('active');
  document.getElementById('tab-stops').classList.add('active');
}

function clearExcelImport() {
  excelData = [];
  currentHomeAddresses = {};
  excelLookupInProgress = false;
  fileInput.value = '';
  fileInfo.classList.remove('active');
  importPreview.classList.remove('active');
  excelProgressSection.classList.remove('active');
  importSummary.innerHTML = '';
  importList.innerHTML = '';
}

// ===================== CASE # LOOKUP =====================

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
    // Route to Excel lookup handler if Excel lookup is in progress
    if (excelLookupInProgress) {
      handleExcelLookupProgress(request);
      return;
    }

    // Otherwise, update Case Lookup tab progress
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
      const dateStr = parseDate(result.dateInspected);
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
      const dayDate = parseDate(result.dateInspected) || null;

      pendingStops.push({
        address: result.address,
        caseNumber: result.caseNumber,
        surveyType: surveyType,
        dayDate: dayDate,
        isHomeAddress: false,
        actualMileage: null,
        estimatedMileage: null,
        mileageFlag: false,
        addedAt: Date.now()
      });
    }
  });

  // Also update any "needsLookup" stops that match case numbers
  successful.forEach(result => {
    const matchIdx = pendingStops.findIndex(s =>
      s.needsLookup && s.caseNumber === result.caseNumber
    );
    if (matchIdx >= 0) {
      pendingStops[matchIdx].address = result.address;
      pendingStops[matchIdx].needsLookup = false;
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

// ===================== MANUAL STOPS =====================

function addAddress() {
  const address = addressInput.value.trim();
  if (!address) return;

  pendingStops.push({
    address: address,
    caseNumber: '',
    surveyType: 'Exterior',
    dayDate: null,
    isHomeAddress: false,
    actualMileage: null,
    estimatedMileage: null,
    mileageFlag: false,
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
    alert('No stops to send. Import from Excel, look up case numbers, or add addresses first.');
    return;
  }

  // Build enriched stop data
  const stopData = pendingStops.map(stop => ({
    address: stop.address,
    caseNumber: stop.caseNumber || '',
    surveyType: stop.surveyType || 'Exterior',
    dayDate: stop.dayDate || null,
    isHomeAddress: stop.isHomeAddress || false,
    actualMileage: stop.actualMileage ?? null,
    estimatedMileage: stop.estimatedMileage ?? null,
    mileageFlag: stop.mileageFlag || false,
  }));

  // Encode as base64 JSON
  const json = JSON.stringify(stopData);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  const url = `${appUrl}?data=${encoded}`;

  chrome.tabs.create({ url });

  if (confirm('Stops sent to Route Optimizer. Clear the list?')) {
    pendingStops = [];
    saveStops();
  }
}

// ===================== SETTINGS =====================

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

// ===================== STORAGE & RENDERING =====================

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
          Import from Excel, use Case # Lookup, or add addresses manually.
        </div>
      </div>
    `;
    return;
  }

  // Group stops by dayDate
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

  const sortedDays = Object.keys(grouped).sort();

  let html = '';

  sortedDays.forEach(dayDate => {
    const stops = grouped[dayDate];
    const label = formatDayLabel(dayDate);
    html += `<div class="stop-day-header">${escapeHtml(label)} (${dayDate})</div>`;
    stops.forEach((stop, i) => {
      html += renderStopItem(stop, i + 1);
    });
  });

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
  const isHome = stop.isHomeAddress;
  const isFlagged = stop.mileageFlag;
  const needsLookup = stop.needsLookup;

  let classes = 'stop-item';
  if (isHome) classes += ' home-stop';
  if (isFlagged) classes += ' flagged-stop';

  const markerClass = isHome ? 'stop-number home' : 'stop-number';
  const markerText = isHome ? 'H' : num;

  let meta = '';
  if (isHome) meta += `<span class="stop-tag type-tag">Home</span>`;
  if (stop.caseNumber) meta += `<span class="stop-tag">Case #${escapeHtml(stop.caseNumber)}</span>`;
  if (stop.surveyType && !isHome) meta += `<span class="stop-tag type-tag">${escapeHtml(stop.surveyType)}</span>`;
  if (isFlagged) meta += `<span class="stop-tag" style="background:#fee2e2;color:#dc2626;">Over mileage</span>`;
  if (needsLookup) meta += `<span class="stop-tag" style="background:#fffbeb;color:#92400e;">Needs lookup</span>`;

  return `
    <div class="${classes}">
      <div class="${markerClass}">${markerText}</div>
      <div class="stop-content">
        <div class="stop-address">${escapeHtml(stop.address)}</div>
        <div class="stop-meta">${meta}</div>
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
