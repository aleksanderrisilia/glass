# Setting Up Node.js 20 for Glass Project

## Step 1: Install nvm-windows

1. Download nvm-windows from: https://github.com/coreybutler/nvm-windows/releases/latest
2. Download the `nvm-setup.exe` file
3. Run the installer and follow the prompts
4. **Important:** Restart your terminal/PowerShell after installation

## Step 2: Install Node.js 20

After restarting your terminal, run:

```powershell
nvm install 20
nvm use 20
node --version
```

You should see `v20.x.x` (any version starting with 20).

## Step 3: Verify Visual Studio Build Tools

You have Visual Studio installed, but you need to ensure the "Desktop development with C++" workload is installed:

1. Open Visual Studio Installer
2. Click "Modify" on your Visual Studio installation
3. Check "Desktop development with C++" workload
4. Click "Modify" to install

## Step 4: Install Project Dependencies

Once Node 20 is active, run:

```powershell
npm run setup
```

This will:
- Install all dependencies
- Build the web app
- Start the Electron app

## Troubleshooting

If you get build errors:
- Make sure you're using Node 20: `node --version`
- Ensure Visual Studio Build Tools with C++ workload is installed
- Try: `npm rebuild` to rebuild native modules

