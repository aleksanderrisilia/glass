# Chrome Native Messaging Setup

This extension uses Chrome Native Messaging for reliable communication with the Glass Electron app.

## Installation Steps

### 1. Install the Extension
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `chrome-extension` directory
5. **Copy the Extension ID** (you'll need it for step 2)

### 2. Install Native Messaging Host

#### Option A: Automatic Installation (Recommended)
```bash
cd chrome-extension
node install-native-host.js <YOUR_EXTENSION_ID>
```

Replace `<YOUR_EXTENSION_ID>` with the ID from step 1 (e.g., `abcdefghijklmnopqrstuvwxyz123456`)

#### Option B: Manual Installation
1. Find your extension ID at `chrome://extensions/`
2. Edit `com.glass.reader.json`:
   - Replace `EXTENSION_ID_PLACEHOLDER` with your actual extension ID
   - Update the `path` to the absolute path of `native-host.js`
3. Copy `com.glass.reader.json` to:
   - **Windows (User)**: `%LOCALAPPDATA%\Google\Chrome\User Data\NativeMessagingHosts\`
   - **Windows (System)**: `C:\Program Files\Google\Chrome\Application\NativeMessagingHosts\` (requires admin)

### 3. Make Native Host Executable
The `native-host.js` script needs to be executable. On Windows, you may need to:
- Ensure Node.js is in your PATH
- Or update the `path` in the manifest to use the full path to `node.exe`

### 4. Restart Chrome
Close and reopen Chrome for the changes to take effect.

## How It Works

1. **Extension** connects to native messaging host on startup
2. **Electron** sends read request via HTTP to `/api/extension/trigger-read`
3. **Native Host** receives request and forwards to extension via native messaging
4. **Extension** reads the current tab and sends content back to Electron

## Troubleshooting

### Extension shows "Native host has exited"
- Check that `native-host.js` is executable
- Verify Node.js is installed and in PATH
- Check Chrome's error console: `chrome://extensions/` → Service Worker → Console

### "Native messaging host not found"
- Verify `com.glass.reader.json` is in the correct location
- Check that the extension ID in the manifest matches your extension
- Restart Chrome

### Test Native Messaging Connection
Open the extension's service worker console and check for:
```
[Glass Extension] Connecting to native messaging host...
[Glass Extension] Native messaging port connected
```

If you see connection errors, check:
1. Native host manifest is installed correctly
2. Extension ID matches
3. Node.js is accessible

