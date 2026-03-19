// Background service worker for Mueller Reports Route Optimizer
// Handles context menu, storage, and badge updates

// Initialize context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'addToRouteOptimizer',
    title: 'Add to Route Optimizer',
    contexts: ['selection']
  });

  // Initialize storage if needed
  chrome.storage.local.get(['pendingStops', 'appUrl'], (result) => {
    if (!result.pendingStops) {
      chrome.storage.local.set({ pendingStops: [] });
    }
    if (!result.appUrl) {
      chrome.storage.local.set({ appUrl: 'http://localhost:5173' });
    }
  });

  updateBadge();
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'addToRouteOptimizer' && info.selectionText) {
    const address = info.selectionText.trim();

    chrome.storage.local.get(['pendingStops'], (result) => {
      const pendingStops = result.pendingStops || [];

      // Add new stop with timestamp
      const newStop = {
        address: address,
        addedAt: Date.now()
      };

      pendingStops.push(newStop);

      chrome.storage.local.set({ pendingStops }, () => {
        updateBadge();

        // Show notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'Address Added',
          message: `Added: ${address.substring(0, 50)}${address.length > 50 ? '...' : ''}`,
          priority: 1
        });
      });
    });
  }
});

// Update badge with pending stops count
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

// Listen for storage changes to update badge
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.pendingStops) {
    updateBadge();
  }
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateBadge') {
    updateBadge();
    sendResponse({ success: true });
  }
  return true;
});
