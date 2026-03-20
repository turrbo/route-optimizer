import * as XLSX from 'xlsx';

// Survey types we care about for open cases
const MATCHING_SURVEY_TYPES = [
  'exterior (diagram and r/c)',
  'exterior (diagram and rc) with supplement',
  'exterior (no diagram or r/c)',
  'exterior (diagram only)',
  'lender property condition',
];

function normalizeSurveyType(raw) {
  if (!raw) return '';
  return raw.toString().trim().toLowerCase();
}

// Parse MM/DD/YYYY date string to a Date object (local time)
function parseDate(raw) {
  if (!raw) return null;
  const str = raw.toString().trim();
  // Handle MM/DD/YYYY
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    return new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
  }
  // Fallback to Date.parse
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// Parse YYYY-MM-DD to Date for comparison
function parseISODate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Parse an "All Open Cases" Excel file.
 * Returns { cases: [...], frNames: [...] }
 */
export function parseOpenCasesExcel(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const cases = [];
  const frNameSet = new Set();

  for (const row of rows) {
    const surveyType = row['Survey Type'] || '';
    const normalized = normalizeSurveyType(surveyType);

    if (!MATCHING_SURVEY_TYPES.includes(normalized)) continue;

    const frAssigned = (row['FR Assigned'] || '').toString().trim();
    if (frAssigned) frNameSet.add(frAssigned);

    cases.push({
      controlNumber: (row['Control #'] || '').toString().trim(),
      address: (row['Address'] || '').toString().trim(),
      city: (row['City'] || '').toString().trim(),
      state: (row['State'] || '').toString().trim(),
      surveyType: surveyType.toString().trim(),
      dateOrdered: (row['Date Ordered'] || '').toString().trim(),
      dateOrderedParsed: parseDate(row['Date Ordered']),
      frAssigned: frAssigned || null,
      customerName: (row['Customer Name #'] || '').toString().trim(),
      customerDueDate: (row['Customer Due Date'] || '').toString().trim(),
    });
  }

  const frNames = Array.from(frNameSet).sort();
  return { cases, frNames };
}

/**
 * Filter cases by route date and FR selection.
 * routeDate: YYYY-MM-DD string (cases must be ordered BEFORE this date)
 * selectedFR: string FR name to filter, or null for all
 * Returns { assignedCases, unassignedCases }
 */
export function filterOpenCases(cases, routeDate) {
  const routeDateObj = parseISODate(routeDate);

  return cases.filter(c => {
    if (!c.dateOrderedParsed) return true; // include if no date
    // Date ordered must be on or before the route date
    return c.dateOrderedParsed <= routeDateObj;
  });
}
