#!/usr/bin/env node
/**
 * Install script for Chrome Native Messaging Host on Windows
 * Run this script to register the native messaging host with Chrome
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOST_NAME = 'com.glass.reader';
const MANIFEST_NAME = `${HOST_NAME}.json`;

// Windows registry location for native messaging hosts
const REGISTRY_PATH = path.join(
  os.homedir(),
  'AppData',
  'Local',
  'Google',
  'Chrome',
  'User Data',
  'NativeMessagingHosts'
);

// Alternative location (system-wide, requires admin)
const SYSTEM_REGISTRY_PATH = path.join(
  process.env.PROGRAMFILES || 'C:\\Program Files',
  'Google',
  'Chrome',
  'Application',
  'NativeMessagingHosts'
);

function install() {
  console.log('Installing Chrome Native Messaging Host for Glass...');
  
  // Read the manifest template
  const manifestPath = path.join(__dirname, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: ${MANIFEST_NAME} not found in ${__dirname}`);
    process.exit(1);
  }
  
  let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // Get extension ID (user needs to provide this or we can try to detect it)
  const extensionId = process.argv[2];
  if (!extensionId) {
    console.warn('Warning: Extension ID not provided. Using placeholder.');
    console.warn('After installing the extension, update the manifest with the actual extension ID.');
    console.warn('You can find the extension ID at chrome://extensions/');
  } else {
    manifest.allowed_origins = [`chrome-extension://${extensionId}/`];
  }
  
  // Resolve native host script path (absolute path required)
  const nativeHostScript = path.resolve(__dirname, 'native-host.js');
  manifest.path = nativeHostScript;
  
  // Create registry directory if it doesn't exist
  if (!fs.existsSync(REGISTRY_PATH)) {
    fs.mkdirSync(REGISTRY_PATH, { recursive: true });
    console.log(`Created directory: ${REGISTRY_PATH}`);
  }
  
  // Write manifest to registry location
  const registryManifestPath = path.join(REGISTRY_PATH, MANIFEST_NAME);
  fs.writeFileSync(registryManifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Installed manifest to: ${registryManifestPath}`);
  
  console.log('\n✅ Native messaging host installed successfully!');
  console.log('\nNext steps:');
  console.log('1. Install the extension in Chrome');
  console.log('2. Get the extension ID from chrome://extensions/');
  console.log('3. Run this script again with the extension ID:');
  console.log(`   node install-native-host.js <EXTENSION_ID>`);
  console.log('4. Restart Chrome');
}

if (require.main === module) {
  install();
}

module.exports = { install };

