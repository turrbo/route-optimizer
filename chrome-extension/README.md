# Mueller Reports Route Optimizer - Chrome Extension

A Chrome extension for capturing addresses from web pages and sending them to the Mueller Reports Route Optimizer web application.

## Features

- **Context Menu Integration**: Right-click selected text and add it to your route
- **Manual Address Entry**: Type addresses directly into the popup
- **Page Scanning**: Automatically detect addresses on any web page
- **Address Highlighting**: Visual indicators for detected addresses on pages
- **Batch Processing**: Collect multiple stops before sending to the optimizer
- **Badge Counter**: See pending stop count at a glance
- **Configurable App URL**: Point to your local or production Route Optimizer instance

## Installation

### Development Installation (Unpacked Extension)

1. **Clone or download** this extension folder to your local machine

2. **Open Chrome** and navigate to `chrome://extensions/`

3. **Enable Developer Mode** (toggle in the top-right corner)

4. **Click "Load unpacked"** and select the `chrome-extension` folder

5. The extension icon should appear in your Chrome toolbar (you may need to pin it)

### Files Included

```
chrome-extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Service worker for context menu and storage
├── content.js             # Content script for address detection
├── content.css            # Styles for address highlighting
├── popup.html             # Extension popup interface
├── popup.js               # Popup logic and functionality
├── icon16.png             # 16x16 icon
├── icon48.png             # 48x48 icon
├── icon128.png            # 128x128 icon
└── README.md              # This file
```

## Usage

### Adding Addresses

**Method 1: Context Menu (Right-Click)**
1. Highlight any text on a web page containing an address
2. Right-click the selected text
3. Choose "Add to Route Optimizer"
4. The address is added to your pending stops

**Method 2: Manual Entry**
1. Click the extension icon in the Chrome toolbar
2. Type an address in the "Add Stop" field
3. Click "Add" or press Enter

**Method 3: Page Scanning**
1. Click the extension icon on any web page
2. Click "Scan Page for Addresses"
3. The extension will automatically detect and add addresses from the page

### Managing Stops

- **View Stops**: Click the extension icon to see all pending stops
- **Remove Stop**: Click the "×" button next to any stop
- **Clear All**: Click "Clear All" to remove all pending stops
- **Reorder**: Stops are numbered in the order they'll be sent to the optimizer

### Sending to Route Optimizer

1. Collect all desired stops using any of the methods above
2. Click the extension icon
3. Click "Send to Route Optimizer" (big red button)
4. The Route Optimizer web app opens in a new tab with your stops pre-loaded
5. Choose whether to keep or clear the stop list

### Configuration

**Setting the Route Optimizer URL**:
1. Click the extension icon
2. Click "Settings" at the bottom
3. Enter your Route Optimizer URL (default: `http://localhost:5173`)
4. Click "Save Settings"

**For production use**, change the URL to your deployed application (e.g., `https://routes.muellerreports.com`)

## Technical Details

### URL Format

Stops are sent to the Route Optimizer using URL query parameters:

```
{APP_URL}?stops=ADDRESS1|ADDRESS2|ADDRESS3
```

- Addresses are pipe-separated (`|`)
- Values are URI-encoded for safe transmission
- Example: `http://localhost:5173?stops=123%20Main%20St|456%20Oak%20Ave`

### Permissions

The extension requires the following permissions:

- **contextMenus**: Create "Add to Route Optimizer" right-click menu
- **activeTab**: Access the current tab for address scanning
- **storage**: Store pending stops and settings locally
- **scripting**: Inject content script for address detection
- **host_permissions**: Access all URLs for address scanning (`<all_urls>`)

### Storage Structure

```javascript
{
  pendingStops: [
    {
      address: "123 Main St, Springfield, IL 62701",
      addedAt: 1710824400000  // Unix timestamp
    }
  ],
  appUrl: "http://localhost:5173"
}
```

## Address Detection

The extension uses a regex pattern to detect common US address formats:

```
[Number] [Street Name] [Street Type], [City], [State] [ZIP]
```

Examples:
- `123 Main Street, Springfield, IL 62701`
- `456 Oak Ave, Chicago, IL 60601-1234`
- `789 Elm Blvd, Unit 5, Boston, MA 02108`

## Development

### Modifying the Extension

1. Make changes to any of the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

### Debugging

- **Popup**: Right-click the extension icon → "Inspect popup"
- **Background Script**: Go to `chrome://extensions/` → Click "service worker" link
- **Content Script**: Open DevTools on any page → Console tab (filter by extension)

### Customization

**Branding Colors**:
- Red: `#c8102e`
- Dark Gray: `#292929`
- Font: Raleway (with fallbacks)

**Modify in**:
- `popup.html`: Update CSS variables in `<style>` section
- `content.css`: Update highlight colors

## Integration with Route Optimizer Web App

The web app should handle the `stops` query parameter on load:

```javascript
// Example: Parse stops from URL on app load
const urlParams = new URLSearchParams(window.location.search);
const stopsParam = urlParams.get('stops');

if (stopsParam) {
  const addresses = stopsParam.split('|');
  // Add addresses to your route optimizer...
}
```

## Troubleshooting

**Extension icon not showing**:
- Check that the extension is enabled in `chrome://extensions/`
- Pin the extension icon to the toolbar

**"Scan Page" not finding addresses**:
- Ensure the page has loaded completely
- Refresh the page and try again
- The regex pattern may need adjustment for non-US addresses

**Stops not appearing in popup**:
- Check browser console for errors
- Try removing and re-adding the extension

**"Send to Route Optimizer" opens wrong URL**:
- Check Settings and update the App URL
- Ensure the URL includes protocol (`http://` or `https://`)

## Security & Privacy

- All data is stored locally in Chrome's storage (no external servers)
- No tracking or analytics
- Addresses are only sent to the URL you configure
- Extension only runs on pages you explicitly scan or interact with

## Browser Compatibility

- Chrome (Manifest V3 required, version 88+)
- Edge (Chromium-based, version 88+)
- Other Chromium browsers with Manifest V3 support

## License

Copyright Mueller Reports. All rights reserved.

## Support

For issues or feature requests, contact the Mueller Reports development team.
