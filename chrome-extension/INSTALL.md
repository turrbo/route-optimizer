# Quick Installation Guide

## Install the Chrome Extension (5 minutes)

### Step 1: Open Chrome Extensions Page
1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Or click the three-dot menu → More tools → Extensions

### Step 2: Enable Developer Mode
1. Look for the toggle in the **top-right corner**
2. Switch "Developer mode" to **ON**

### Step 3: Load the Extension
1. Click the **"Load unpacked"** button (top-left)
2. Navigate to this folder:
   ```
   /home/node/a0/workspace/c01bce70-eb25-4295-8907-5962f2753080/workspace/route-optimizer/chrome-extension/
   ```
3. Select the folder and click "Select"

### Step 4: Pin the Extension (Optional)
1. Click the **puzzle piece icon** in Chrome's toolbar
2. Find "Mueller Reports Route Optimizer"
3. Click the **pin icon** to keep it visible

## First-Time Setup

### Configure Your Route Optimizer URL

**For Local Development**:
1. Click the extension icon
2. Click "Settings" at the bottom
3. The default URL is: `http://localhost:5173`
4. Click "Save Settings"

**For Production**:
1. Change the URL to your production app
2. Example: `https://routes.muellerreports.com`
3. Click "Save Settings"

## Quick Test

1. Go to any webpage with addresses (e.g., Google Maps, Yelp)
2. Click the extension icon
3. Click "Scan Page for Addresses"
4. Addresses should appear in the popup
5. Click "Send to Route Optimizer"
6. Your Route Optimizer web app should open with the addresses pre-loaded

## Troubleshooting

**Extension not loading?**
- Make sure you selected the `chrome-extension` folder, not a parent folder
- Check that all files are present (manifest.json, popup.html, etc.)

**Icon not showing?**
- The extension is installed but not pinned
- Click the puzzle piece icon and pin it

**Addresses not sending?**
- Check your App URL in Settings
- Make sure your Route Optimizer web app is running
- For local development, ensure it's running on the correct port

## Next Steps

1. Read the full [README.md](README.md) for detailed usage instructions
2. Configure your Route Optimizer web app to accept the `stops` URL parameter
3. Start optimizing routes!

---

**Need Help?** Contact the Mueller Reports development team.
