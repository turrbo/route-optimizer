// Content script for scraping address from Mueller Inc policy pages
// Injected into https://www.mueller-inc.com/* pages
// Targets the exact DOM structure of the Mueller inspectorappviewpolicy page

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeAddress') {
    const result = scrapeAddressFromPage();
    sendResponse(result);
  }
  return true;
});

function scrapeAddressFromPage() {
  try {
    // The Mueller page structure for "Address To Survey":
    //   <td class="ReportUnderlineText">Address To Survey</td>
    //   </tr>
    //   <tr>
    //     <td class="ReportText1"><a href="maps.google.com/...">20 Bellevue Ter</a></td>
    //   </tr>
    //   <tr>
    //     <td class="ReportText1">Seymour, CT&nbsp;06483</td>
    //   </tr>

    // Strategy 1: Find the "Address To Survey" label cell
    const labelCells = document.querySelectorAll('td.ReportUnderlineText');
    for (const cell of labelCells) {
      const text = (cell.textContent || '').trim();
      if (/address\s+to\s+survey/i.test(text)) {
        // Found label - navigate to the next rows for street + city/state/zip
        const labelRow = cell.closest('tr');
        if (!labelRow) continue;

        let street = '';
        let cityStateZip = '';

        // Next row has the street address (inside an <a> tag linking to Google Maps)
        const streetRow = labelRow.nextElementSibling;
        if (streetRow) {
          const link = streetRow.querySelector('a');
          if (link) {
            street = (link.textContent || '').trim();
          } else {
            const td = streetRow.querySelector('td.ReportText1');
            if (td) street = (td.textContent || '').trim();
          }

          // Row after that has city, state, zip
          const cityRow = streetRow.nextElementSibling;
          if (cityRow) {
            const td = cityRow.querySelector('td.ReportText1');
            if (td) {
              cityStateZip = (td.textContent || '').replace(/\u00a0/g, ' ').trim();
            }
          }
        }

        if (street) {
          const fullAddress = cityStateZip
            ? `${street}, ${cityStateZip}`
            : street;

          return {
            success: true,
            address: fullAddress,
            street: street,
            cityStateZip: cityStateZip,
            pageTitle: document.title,
            url: window.location.href
          };
        }
      }
    }

    // Strategy 2: Fallback - look for any ReportUnderlineText containing "Address"
    for (const cell of labelCells) {
      const text = (cell.textContent || '').trim();
      if (/address/i.test(text)) {
        const labelRow = cell.closest('tr');
        if (!labelRow) continue;

        const nextRow = labelRow.nextElementSibling;
        if (nextRow) {
          const td = nextRow.querySelector('td.ReportText1') || nextRow.querySelector('td');
          if (td) {
            const link = td.querySelector('a');
            const street = link ? (link.textContent || '').trim() : (td.textContent || '').trim();

            if (street && street.length > 3) {
              let cityStateZip = '';
              const cityRow = nextRow.nextElementSibling;
              if (cityRow) {
                const cityTd = cityRow.querySelector('td.ReportText1') || cityRow.querySelector('td');
                if (cityTd) {
                  cityStateZip = (cityTd.textContent || '').replace(/\u00a0/g, ' ').trim();
                }
              }

              const fullAddress = cityStateZip
                ? `${street}, ${cityStateZip}`
                : street;

              return {
                success: true,
                address: fullAddress,
                street: street,
                cityStateZip: cityStateZip,
                pageTitle: document.title,
                url: window.location.href
              };
            }
          }
        }
      }
    }

    // Strategy 3: Look for Google Maps link as last resort
    const mapLinks = document.querySelectorAll('a[href*="maps.google.com"]');
    if (mapLinks.length > 0) {
      const link = mapLinks[0];
      const street = (link.textContent || '').trim();
      if (street && street.length > 3) {
        // Try to get city/state/zip from the next row
        const row = link.closest('tr');
        let cityStateZip = '';
        if (row && row.nextElementSibling) {
          const td = row.nextElementSibling.querySelector('td.ReportText1') || row.nextElementSibling.querySelector('td');
          if (td) {
            cityStateZip = (td.textContent || '').replace(/\u00a0/g, ' ').trim();
          }
        }

        const fullAddress = cityStateZip
          ? `${street}, ${cityStateZip}`
          : street;

        return {
          success: true,
          address: fullAddress,
          street: street,
          cityStateZip: cityStateZip,
          pageTitle: document.title,
          url: window.location.href
        };
      }
    }

    return {
      success: false,
      address: null,
      error: 'Could not find "Address To Survey" on this page'
    };
  } catch (err) {
    return {
      success: false,
      address: null,
      error: err.message
    };
  }
}
