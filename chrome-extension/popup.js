// Popup script for Glass extension

let isReading = false;

// Check connection status
async function checkConnection() {
  const statusEl = document.getElementById('status');
  const readButton = document.getElementById('readButton');
  
  try {
    // Glass uses fixed port 51173 for API
    const commonPorts = [51173];
    const portsToCheck = [...commonPorts];
    
    let connected = false;
    let connectedPort = null;
    
    // Check ports in parallel batches for speed
    const checkPort = async (port) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300); // Fast timeout
        
        const response = await fetch(`http://localhost:${port}/api/health`, {
          method: 'GET',
          signal: controller.signal,
          mode: 'cors'
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.service === 'Glass API' || (data.status === 'online' && data.service)) {
            return { port, success: true };
          }
        }
      } catch (e) {
        // Port not available or not Glass - ignore
      }
      return { port, success: false };
    };
    
    // Check common ports first (faster)
    for (const port of commonPorts) {
      const result = await checkPort(port);
      if (result.success) {
        connected = true;
        connectedPort = result.port;
        break;
      }
    }
    
    // Port 51173 should always work if Glass is running
    
    if (connected && connectedPort) {
      statusEl.textContent = `Connected to Glass (port ${connectedPort})`;
      statusEl.className = 'status connected';
      readButton.disabled = false;
      
      // Update background script with port
      chrome.runtime.sendMessage({
        action: 'updateApiPort',
        port: connectedPort
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error updating port:', chrome.runtime.lastError);
        }
      });
    }
    
    if (!connected) {
      statusEl.textContent = 'Glass app not detected. Please start Glass and check the terminal for the API port.';
      statusEl.className = 'status disconnected';
      readButton.disabled = true;
    }
  } catch (error) {
    console.error('Error checking connection:', error);
    statusEl.textContent = `Error: ${error.message || 'Unknown error'}`;
    statusEl.className = 'status disconnected';
    readButton.disabled = true;
  }
}

// Read current tab
async function readCurrentTab() {
  if (isReading) return;
  
  isReading = true;
  const readButton = document.getElementById('readButton');
  const loading = document.getElementById('loading');
  const success = document.getElementById('success');
  const error = document.getElementById('error');
  
  // Reset UI
  readButton.disabled = true;
  loading.classList.add('active');
  success.classList.remove('active');
  error.classList.remove('active');
  
  // Get current active tab first
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      error.textContent = chrome.runtime.lastError.message;
      error.classList.add('active');
      isReading = false;
      readButton.disabled = false;
      loading.classList.remove('active');
      return;
    }
    
    if (!tabs || tabs.length === 0) {
      error.textContent = 'No active tab found';
      error.classList.add('active');
      isReading = false;
      readButton.disabled = false;
      loading.classList.remove('active');
      return;
    }
    
    // Send message to background script
    chrome.runtime.sendMessage({
      action: 'readCurrentTab'
    }, (response) => {
      // Handle Chrome runtime errors first
      if (chrome.runtime.lastError) {
        error.textContent = chrome.runtime.lastError.message;
        error.classList.add('active');
        isReading = false;
        readButton.disabled = false;
        loading.classList.remove('active');
        return;
      }
      
      // Handle response - check if response exists and has success property
      if (!response) {
        error.textContent = 'No response from extension background script';
        error.classList.add('active');
        isReading = false;
        readButton.disabled = false;
        loading.classList.remove('active');
        return;
      }
      
      if (response.success) {
        success.textContent = `Successfully read: ${response.data?.title || 'Current tab'}`;
        success.classList.add('active');
        
        // Hide success message after 3 seconds
        setTimeout(() => {
          success.classList.remove('active');
        }, 3000);
      } else {
        error.textContent = response.error || 'Failed to read tab';
        error.classList.add('active');
      }
      
      isReading = false;
      readButton.disabled = false;
      loading.classList.remove('active');
    });
  });
}

// Manual port entry
function setupManualPort() {
  const manualPortDiv = document.getElementById('manualPort');
  const portInput = document.getElementById('portInput');
  const setPortButton = document.getElementById('setPortButton');
  const statusEl = document.getElementById('status');
  const readButton = document.getElementById('readButton');
  
  // Show manual port entry if not connected
  setPortButton.addEventListener('click', async () => {
    const port = parseInt(portInput.value);
    if (!port || port < 1 || port > 65535) {
      alert('Please enter a valid port number (1-65535)');
      return;
    }
    
    // Test the port
    try {
      const response = await fetch(`http://localhost:${port}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.service === 'Glass API' || data.status === 'online') {
          // Update background script
          chrome.runtime.sendMessage({
            action: 'updateApiPort',
            port: port
          });
          
          statusEl.textContent = `Connected to Glass (port ${port})`;
          statusEl.className = 'status connected';
          readButton.disabled = false;
          manualPortDiv.style.display = 'none';
          
          // Save port for next time
          chrome.storage.local.set({ glassPort: port });
        } else {
          alert('Port is open but not Glass API');
        }
      } else {
        alert(`Port ${port} responded but not Glass API`);
      }
    } catch (error) {
      alert(`Cannot connect to port ${port}. Make sure Glass is running and check the port number in the Glass terminal.`);
    }
  });
}

// Load saved port
async function loadSavedPort() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['glassPort'], (result) => {
      resolve(result.glassPort);
    });
  });
}

// Ping background script to keep it alive when popup opens
chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
  if (chrome.runtime.lastError) {
    console.warn('Background script not responding:', chrome.runtime.lastError);
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved port first
  const savedPort = await loadSavedPort();
  if (savedPort) {
    // Try the saved port first
    try {
      const response = await fetch(`http://localhost:${savedPort}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1000)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.service === 'Glass API') {
          chrome.runtime.sendMessage({
            action: 'updateApiPort',
            port: savedPort
          });
          document.getElementById('status').textContent = `Connected to Glass (port ${savedPort})`;
          document.getElementById('status').className = 'status connected';
          document.getElementById('readButton').disabled = false;
          return; // Skip scanning
        }
      }
    } catch (e) {
      // Saved port didn't work, continue with scanning
    }
  }
  
  setupManualPort();
  checkConnection();
  
  // If not connected after 3 seconds, show manual port entry
  setTimeout(() => {
    const statusEl = document.getElementById('status');
    if (statusEl.className.includes('disconnected')) {
      document.getElementById('manualPort').style.display = 'block';
      statusEl.textContent = 'Enter Glass API port manually (check Glass terminal)';
    }
  }, 3000);
  
  // Check connection every 5 seconds
  setInterval(checkConnection, 5000);
  
  // Read button click
  document.getElementById('readButton').addEventListener('click', readCurrentTab);
});

