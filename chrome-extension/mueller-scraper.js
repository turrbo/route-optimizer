// Content script for scraping data from Mueller Inc policy pages
// Injected into https://www.mueller-inc.com/* pages
// Extracts: Address To Survey, Report Type, Date Inspected

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeAddress') {
    const result = scrapePageData();
    sendResponse(result);
  }
  return true;
});

/**
 * Find a label cell (ReportUnderlineText or any td) matching a regex,
 * then return the text content of the value cell(s) in subsequent row(s).
 */
function findLabelValue(labelRegex) {
  // Try ReportUnderlineText cells first
  const labelCells = document.querySelectorAll('td.ReportUnderlineText');
  for (const cell of labelCells) {
    const text = (cell.textContent || '').trim();
    if (labelRegex.test(text)) {
      const row = cell.closest('tr');
      if (row && row.nextElementSibling) {
        const nextTd = row.nextElementSibling.querySelector('td.ReportText1') ||
                       row.nextElementSibling.querySelector('td');
        if (nextTd) {
          return (nextTd.textContent || '').replace(/\u00a0/g, ' ').trim();
        }
      }
    }
  }

  // Fallback: check all bold/font cells
  const allCells = document.querySelectorAll('td, b, font, span');
  for (const cell of allCells) {
    const text = (cell.textContent || '').trim();
    if (labelRegex.test(text) && text.length < 80) {
      // Check sibling text or next row
      const parent = cell.closest('td');
      if (parent) {
        // Same-cell pattern: "Label: Value"
        const fullText = parent.textContent || '';
        const colonMatch = fullText.match(new RegExp(labelRegex.source + '\\s*:?\\s*(.+)', 'i'));
        if (colonMatch && colonMatch[1]) {
          const val = colonMatch[1].trim();
          if (val.length > 1 && val.length < 300) return val;
        }

        // Next sibling td
        const nextTd = parent.nextElementSibling;
        if (nextTd) {
          const val = (nextTd.textContent || '').replace(/\u00a0/g, ' ').trim();
          if (val.length > 1) return val;
        }
      }

      // Next row
      const row = cell.closest('tr');
      if (row && row.nextElementSibling) {
        const nextTd = row.nextElementSibling.querySelector('td');
        if (nextTd) {
          const val = (nextTd.textContent || '').replace(/\u00a0/g, ' ').trim();
          if (val.length > 1 && val.length < 300) return val;
        }
      }
    }
  }

  return null;
}

function scrapePageData() {
  try {
    // --- Extract Address ---
    let address = null;
    let street = '';
    let cityStateZip = '';

    const labelCells = document.querySelectorAll('td.ReportUnderlineText');
    for (const cell of labelCells) {
      const text = (cell.textContent || '').trim();
      if (/address\s+to\s+survey/i.test(text)) {
        const labelRow = cell.closest('tr');
        if (!labelRow) continue;

        const streetRow = labelRow.nextElementSibling;
        if (streetRow) {
          const link = streetRow.querySelector('a');
          if (link) {
            street = (link.textContent || '').trim();
          } else {
            const td = streetRow.querySelector('td.ReportText1');
            if (td) street = (td.textContent || '').trim();
          }

          const cityRow = streetRow.nextElementSibling;
          if (cityRow) {
            const td = cityRow.querySelector('td.ReportText1');
            if (td) {
              cityStateZip = (td.textContent || '').replace(/\u00a0/g, ' ').trim();
            }
          }
        }

        if (street) {
          address = cityStateZip ? `${street}, ${cityStateZip}` : street;
          break;
        }
      }
    }

    // Fallback: Google Maps link
    if (!address) {
      const mapLinks = document.querySelectorAll('a[href*="maps.google.com"]');
      if (mapLinks.length > 0) {
        const link = mapLinks[0];
        street = (link.textContent || '').trim();
        if (street && street.length > 3) {
          const row = link.closest('tr');
          if (row && row.nextElementSibling) {
            const td = row.nextElementSibling.querySelector('td.ReportText1') ||
                       row.nextElementSibling.querySelector('td');
            if (td) cityStateZip = (td.textContent || '').replace(/\u00a0/g, ' ').trim();
          }
          address = cityStateZip ? `${street}, ${cityStateZip}` : street;
        }
      }
    }

    // --- Extract Report Type ---
    // Mueller shows it as: "INTERIOR/EXTERIOR (DIAGRAM AND R/C) ON-SITE REPORT"
    // Located near "Report Type:" label
    let reportType = findLabelValue(/report\s+type/i);

    // Also try scanning for the report type text in ReportText1 cells
    // since it may appear as a standalone bold/large cell
    if (!reportType) {
      const textCells = document.querySelectorAll('td.ReportText1, td b, td font');
      for (const cell of textCells) {
        const text = (cell.textContent || '').trim().toUpperCase();
        if ((text.includes('EXTERIOR') || text.includes('INTERIOR') ||
             text.includes('HIGH VALUE') || text.includes('LENDER') ||
             text.includes('LPC') || text.includes('COMMERCIAL')) &&
            text.includes('REPORT') && text.length < 200) {
          reportType = (cell.textContent || '').trim();
          break;
        }
      }
    }

    // --- Extract Date Inspected ---
    // Located at the bottom of the page as "Date Inspected:" or "Date of Inspection:"
    let dateInspected = findLabelValue(/date\s+(inspected|of\s+inspection)/i);

    // Also try searching the full page text as a fallback
    if (!dateInspected) {
      const bodyText = document.body.innerText || '';
      const dateMatch = bodyText.match(/date\s+inspected\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
      if (dateMatch) {
        dateInspected = dateMatch[1];
      }
    }

    if (!address) {
      return {
        success: false,
        address: null,
        error: 'Could not find "Address To Survey" on this page'
      };
    }

    return {
      success: true,
      address: address,
      street: street,
      cityStateZip: cityStateZip,
      reportType: reportType || null,
      dateInspected: dateInspected || null,
      pageTitle: document.title,
      url: window.location.href
    };
  } catch (err) {
    return {
      success: false,
      address: null,
      error: err.message
    };
  }
}
