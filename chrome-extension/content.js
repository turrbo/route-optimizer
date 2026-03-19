// Content script for detecting and highlighting addresses
// Runs on all web pages

// US address pattern (basic regex for common formats)
const ADDRESS_PATTERN = /\b\d{1,5}\s+[A-Za-z0-9\s,.'#-]+(?:Street|St|Avenue|Ave|Road|Rd|Highway|Hwy|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way|Place|Pl|Parkway|Pkwy)(?:\s+[A-Za-z]{2,})*,?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/gi;

let isHighlightingActive = false;
let highlightedElements = [];

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scanForAddresses') {
    const addresses = scanPageForAddresses();
    sendResponse({ addresses });
  } else if (request.action === 'toggleHighlighting') {
    toggleHighlighting();
    sendResponse({ active: isHighlightingActive });
  }
  return true;
});

// Scan page for addresses
function scanPageForAddresses() {
  const addresses = new Set();
  const bodyText = document.body.innerText;

  const matches = bodyText.match(ADDRESS_PATTERN);

  if (matches) {
    matches.forEach(address => {
      // Clean up the address
      const cleaned = address.replace(/\s+/g, ' ').trim();
      addresses.add(cleaned);
    });
  }

  return Array.from(addresses);
}

// Toggle address highlighting on the page
function toggleHighlighting() {
  if (isHighlightingActive) {
    removeHighlights();
    isHighlightingActive = false;
  } else {
    highlightAddresses();
    isHighlightingActive = true;
  }
}

// Highlight detected addresses
function highlightAddresses() {
  removeHighlights(); // Clear any existing highlights

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  const textNodes = [];
  let node;

  while (node = walker.nextNode()) {
    // Skip script and style elements
    if (node.parentElement.tagName === 'SCRIPT' ||
        node.parentElement.tagName === 'STYLE') {
      continue;
    }

    if (ADDRESS_PATTERN.test(node.textContent)) {
      textNodes.push(node);
    }
  }

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    const matches = [...text.matchAll(ADDRESS_PATTERN)];

    if (matches.length > 0) {
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;

      matches.forEach(match => {
        // Add text before match
        if (match.index > lastIndex) {
          fragment.appendChild(
            document.createTextNode(text.substring(lastIndex, match.index))
          );
        }

        // Add highlighted match
        const span = document.createElement('span');
        span.className = 'route-optimizer-highlight';
        span.textContent = match[0];
        span.style.cssText = `
          background-color: rgba(200, 16, 46, 0.1);
          border: 1px solid #c8102e;
          border-radius: 2px;
          padding: 2px 4px;
          cursor: pointer;
          transition: background-color 0.2s;
        `;

        // Click to add to route optimizer
        span.addEventListener('click', () => {
          chrome.runtime.sendMessage({
            action: 'addAddress',
            address: match[0]
          });
        });

        span.addEventListener('mouseenter', () => {
          span.style.backgroundColor = 'rgba(200, 16, 46, 0.2)';
        });

        span.addEventListener('mouseleave', () => {
          span.style.backgroundColor = 'rgba(200, 16, 46, 0.1)';
        });

        fragment.appendChild(span);
        highlightedElements.push(span);

        lastIndex = match.index + match[0].length;
      });

      // Add remaining text
      if (lastIndex < text.length) {
        fragment.appendChild(
          document.createTextNode(text.substring(lastIndex))
        );
      }

      textNode.parentNode.replaceChild(fragment, textNode);
    }
  });
}

// Remove all highlights
function removeHighlights() {
  const highlights = document.querySelectorAll('.route-optimizer-highlight');
  highlights.forEach(span => {
    const text = document.createTextNode(span.textContent);
    span.parentNode.replaceChild(text, span);
  });

  highlightedElements = [];

  // Normalize text nodes
  document.body.normalize();
}

// Clean up on unload
window.addEventListener('beforeunload', () => {
  removeHighlights();
});
