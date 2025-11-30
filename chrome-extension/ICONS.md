# Extension Icons

You need to create three icon files for the Chrome extension:

- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

## Quick Solution

For development, you can:

1. **Use the Glass logo** from `src/ui/assets/logo.png` and resize it to these sizes
2. **Create simple placeholder icons** - any 16x16, 48x48, and 128x128 PNG images
3. **Use an online icon generator** - search for "chrome extension icon generator"

## For Production

Create proper icons that match the Glass branding. You can use the logo from the Electron app assets.

## Temporary Workaround

If you don't have icons yet, the extension will still work but Chrome will show a default icon. The extension functionality is not affected by missing icons.

