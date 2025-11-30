# Glass Chrome Extension

This Chrome extension allows the Glass Electron app to read content from your current Chrome tab.

## Installation

### Method 1: Load Unpacked Extension (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder from this project
5. The extension should now appear in your extensions list

### Method 2: Install from Chrome Web Store (Production)

*Coming soon - extension will be published to Chrome Web Store*

## Usage

1. **Start the Glass Electron app** - Make sure Glass is running
2. **Open any webpage** in Chrome that you want to read
3. **Click the Glass extension icon** in Chrome's toolbar
4. **Click "Read Current Tab"** in the popup
5. The content will be sent to Glass and stored
6. **Ask questions in Glass** - The read content will be included in the context

## How It Works

- The extension reads the HTML content of your active Chrome tab
- It sends the content to the Glass Electron app via HTTP API
- Glass stores the content and includes it when you ask questions
- No command-line flags or manual setup required!

## Permissions

The extension requires:
- **activeTab**: To read content from the current tab
- **tabs**: To identify the active tab
- **http://localhost/***: To communicate with the Glass app

## Troubleshooting

### Extension shows "Glass app not detected"

- Make sure the Glass Electron app is running
- Check that the Glass app is listening on port 51173 (or check the console for the actual port)
- Try refreshing the extension popup

### "Failed to read tab" error

- Make sure you're on a regular webpage (not chrome:// pages)
- Some pages may block content scripts - try a different page
- Check Chrome's console for detailed error messages

## Development

To modify the extension:
1. Make changes to the files in `chrome-extension/`
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Glass extension card
4. Test your changes

## Icons

Place icon files (`icon16.png`, `icon48.png`, `icon128.png`) in the `chrome-extension/` folder. You can create simple icons or use placeholder images for development.

