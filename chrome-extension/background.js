// Background service worker for Mueller Reports Route Optimizer
// Handles context menu, case # lookup via Mueller Inc, and badge updates

const MUELLER_BASE_URL = 'https://www.mueller-inc.com/inspectorappviewpolicy.asp?ControlIDNumber=';

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'addToRouteOptimizer',
    title: 'Add to Route Optimizer',
    contexts: ['selection']
  });

  chrome.storage.local.get(['pendingStops', 'appUrl'], (result) => {
    if (!result.pendingStops) chrome.storage.local.set({ pendingStops: [] });
    if (!result.appUrl) chrome.storage.local.set({ appUrl: 'https://turrbo.github.io/route-optimizer/' });
  });

  updateBadge();
});

// Context menu: right-click to add selected text as address
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'addToRouteOptimizer' && info.selectionText) {
    const address = info.selectionText.trim();
    chrome.storage.local.get(['pendingStops'], (result) => {
      const pendingStops = result.pendingStops || [];
      pendingStops.push({ address, caseNumber: '', addedAt: Date.now() });
      chrome.storage.local.set({ pendingStops }, () => {
        updateBadge();
      });
    });
  }
});

// Look up a single case number by opening the Mueller page in a background tab,
// injecting the scraper, and extracting the address.
async function lookupCaseNumber(caseNumber) {
  const url = MUELLER_BASE_URL + encodeURIComponent(caseNumber);

  return new Promise((resolve) => {
    // Open the Mueller page in a background tab
    chrome.tabs.create({ url, active: false }, (tab) => {
      const tabId = tab.id;
      let resolved = false;

      // Timeout after 20 seconds
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.remove(tabId).catch(() => {});
          resolve({ caseNumber, success: false, error: 'Timeout - page took too long to load' });
        }
      }, 20000);

      // Wait for the page to finish loading, then scrape
      const onUpdated = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete' && !resolved) {
          chrome.tabs.onUpdated.removeListener(onUpdated);

          // Small delay for any JS rendering on the page
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: 'scrapeAddress' }, (response) => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);

                if (chrome.runtime.lastError || !response) {
                  // Content script not loaded yet, try injecting manually
                  chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['mueller-scraper.js']
                  }).then(() => {
                    setTimeout(() => {
                      chrome.tabs.sendMessage(tabId, { action: 'scrapeAddress' }, (retryResponse) => {
                        chrome.tabs.remove(tabId).catch(() => {});
                        if (retryResponse && retryResponse.success) {
                          resolve({
                            caseNumber, success: true,
                            address: retryResponse.address,
                            reportType: retryResponse.reportType || null,
                            dateInspected: retryResponse.dateInspected || null
                          });
                        } else {
                          resolve({ caseNumber, success: false, error: 'Could not find address on page' });
                        }
                      });
                    }, 500);
                  }).catch((err) => {
                    chrome.tabs.remove(tabId).catch(() => {});
                    resolve({ caseNumber, success: false, error: 'Could not access page - are you logged in?' });
                  });
                } else if (response.success) {
                  chrome.tabs.remove(tabId).catch(() => {});
                  resolve({
                    caseNumber, success: true,
                    address: response.address,
                    reportType: response.reportType || null,
                    dateInspected: response.dateInspected || null
                  });
                } else {
                  chrome.tabs.remove(tabId).catch(() => {});
                  resolve({ caseNumber, success: false, error: 'Address not found on page' });
                }
              }
            });
          }, 1000);
        }
      };

      chrome.tabs.onUpdated.addListener(onUpdated);

      // Handle tab close/error
      const onRemoved = (removedTabId) => {
        if (removedTabId === tabId && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(onUpdated);
          chrome.tabs.onRemoved.removeListener(onRemoved);
          resolve({ caseNumber, success: false, error: 'Tab was closed' });
        }
      };
      chrome.tabs.onRemoved.addListener(onRemoved);
    });
  });
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateBadge') {
    updateBadge();
    sendResponse({ success: true });
  }

  if (request.action === 'lookupCases') {
    const caseNumbers = request.caseNumbers || [];
    const skipRetry = request.skipRetry || false;

    // Mark lookup as active so popup knows when reopening
    chrome.storage.local.set({
      lookupActive: true,
      lookupResults: [],
      lookupTotal: caseNumbers.length,
      lookupCompleted: 0,
      lookupPhase: 'first'
    });

    // Process case numbers sequentially to avoid overwhelming the server
    (async () => {
      const results = [];
      for (const caseNum of caseNumbers) {
        const result = await lookupCaseNumber(caseNum);
        results.push(result);

        // Save incrementally to storage (popup may be closed)
        chrome.storage.local.set({
          lookupResults: results,
          lookupCompleted: results.length,
          lookupPhase: 'first'
        });

        // Notify popup of progress (if open)
        chrome.runtime.sendMessage({
          action: 'lookupProgress',
          completed: results.length,
          total: caseNumbers.length,
          latest: result,
          phase: 'first'
        }).catch(() => {}); // Popup might be closed
      }

      // Retry failed cases once more (unless told to skip)
      if (!skipRetry) {
        const failedCases = results.filter(r => !r.success);
        if (failedCases.length > 0) {
          chrome.storage.local.set({ lookupPhase: 'retry' });
          chrome.runtime.sendMessage({
            action: 'lookupRetryStarting',
            count: failedCases.length
          }).catch(() => {});

          let retryDone = 0;
          for (const failed of failedCases) {
            const retry = await lookupCaseNumber(failed.caseNumber);
            retryDone++;
            // If retry succeeded, update the result
            if (retry.success) {
              const idx = results.findIndex(r => r.caseNumber === failed.caseNumber);
              if (idx >= 0) results[idx] = retry;
            }

            // Save incrementally
            chrome.storage.local.set({ lookupResults: results });

            chrome.runtime.sendMessage({
              action: 'lookupProgress',
              completed: retryDone,
              total: failedCases.length,
              latest: retry,
              phase: 'retry'
            }).catch(() => {});
          }
        }
      }

      // Mark lookup as done and save final results
      chrome.storage.local.set({
        lookupActive: false,
        lookupResults: results
      });

      sendResponse({ results });
    })();
    return true; // Keep message channel open for async response
  }

  if (request.action === 'checkLookupStatus') {
    chrome.storage.local.get(['lookupActive', 'lookupResults', 'lookupTotal', 'lookupCompleted', 'lookupPhase'], (data) => {
      sendResponse(data);
    });
    return true;
  }

  return true;
});

// Update badge count
function updateBadge() {
  chrome.storage.local.get(['pendingStops'], (result) => {
    const count = (result.pendingStops || []).length;
    if (count > 0) {
      chrome.action.setBadgeText({ text: count.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#c8102e' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  });
}

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.pendingStops) {
    updateBadge();
  }
});
