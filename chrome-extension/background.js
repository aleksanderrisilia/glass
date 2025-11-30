// Background service worker for Glass extension
// Uses Chrome Native Messaging for reliable communication with Electron

const GLASS_API_URL = 'http://localhost:51173'; // Default, will be updated
let currentApiPort = null;
let nativePort = null;

// Initialize immediately when service worker loads
console.log('[Glass Extension] Service worker starting...');

// Connect to native messaging host
function connectNativeHost() {
  try {
    console.log('[Glass Extension] Connecting to native messaging host...');
    nativePort = chrome.runtime.connectNative('com.glass.reader');
    
    nativePort.onMessage.addListener((message) => {
      console.log('[Glass Extension] Received from native host:', message);
      
      if (message.type === 'READ_TAB_REQUEST') {
        // Electron requested a read via native host
        doReadCurrentTab()
          .then((result) => {
            // Send result back to native host
            if (nativePort) {
              nativePort.postMessage({
                type: 'READ_TAB_COMPLETE',
                success: true,
                data: result
              });
            }
          })
          .catch((error) => {
            // Send error back to native host
            if (nativePort) {
              nativePort.postMessage({
                type: 'READ_TAB_COMPLETE',
                success: false,
                error: error.message
              });
            }
          });
      }
    });
    
    nativePort.onDisconnect.addListener(() => {
      console.warn('[Glass Extension] Native port disconnected:', chrome.runtime.lastError?.message);
      nativePort = null;
      // Try to reconnect after a delay
      setTimeout(connectNativeHost, 5000);
    });
    
    console.log('[Glass Extension] Native messaging port connected');
  } catch (error) {
    console.error('[Glass Extension] Failed to connect to native host:', error);
    nativePort = null;
    // Retry after delay
    setTimeout(connectNativeHost, 5000);
  }
}

// Read current tab (called by native messaging or popup)
async function doReadCurrentTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      throw new Error('No active tab found');
    }
    
    const tabId = tabs[0].id;
    const result = await readCurrentTab(tabId);
    return result;
  } catch (error) {
    console.error('[Glass Extension] Error in doReadCurrentTab:', error);
    throw error;
  }
}

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'readCurrentTab') {
    // Get current active tab (popup doesn't have sender.tab)
    doReadCurrentTab()
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'updateApiPort') {
    currentApiPort = request.port;
    sendResponse({ success: true });
    return false;
  }
  
  // Return false if we don't handle the message
  return false;
});

// Read the current active tab
async function readCurrentTab(tabId) {
  try {
    // Get the tab to verify it's accessible
    const tab = await chrome.tabs.get(tabId);
    if (!tab) {
      throw new Error('Tab not found');
    }

    // Check if it's a chrome:// or chrome-extension:// page (can't read these)
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      throw new Error('Cannot read Chrome internal pages. Please navigate to a regular webpage.');
    }

    // Execute script in the tab to get HTML content
    let results;
    
    // Check if scripting API is available
    if (!chrome.scripting || !chrome.scripting.executeScript) {
      throw new Error('Scripting API not available. Please reload the extension after adding the "scripting" permission.');
    }
    
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          return {
            url: window.location.href,
            title: document.title,
            html: document.documentElement.outerHTML
          };
        }
      });
    } catch (scriptError) {
      console.error('[Glass Extension] executeScript error:', scriptError);
      throw new Error(`Failed to read tab content: ${scriptError.message}. Make sure you're on a regular webpage (not chrome:// pages).`);
    }

    if (!results || results.length === 0 || !results[0].result) {
      throw new Error('Failed to read tab content');
    }

    const tabData = results[0].result;
    
    // Limit HTML content size to avoid payload too large errors
    // Keep first 10MB of HTML (should be enough for most pages)
    const MAX_HTML_SIZE = 10 * 1024 * 1024; // 10MB
    let htmlContent = tabData.html;
    if (htmlContent.length > MAX_HTML_SIZE) {
      console.warn(`[Glass Extension] HTML content is ${htmlContent.length} bytes, truncating to ${MAX_HTML_SIZE} bytes`);
      htmlContent = htmlContent.substring(0, MAX_HTML_SIZE);
    }
    
    // Try to detect Glass app port if not already set
    let apiPort = currentApiPort;
    if (!apiPort) {
      apiPort = await detectGlassPort();
    }
    
    if (!apiPort) {
      throw new Error('Glass app not detected. Please make sure Glass is running.');
    }
    
    // Send to Electron app
    const response = await fetch(`http://localhost:${apiPort}/api/read-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: tabData.url,
        title: tabData.title,
        htmlContent: htmlContent
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Failed to send to Glass app`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    return {
      url: tabData.url,
      title: tabData.title,
      contentLength: tabData.html.length,
      ...result
    };
  } catch (error) {
    console.error('[Glass Extension] Error reading tab:', error);
    throw error;
  }
}

// Try to detect Glass app port
async function detectGlassPort() {
  // Glass uses fixed port 51173
  const ports = [51173];
  
  // Check up to 20 ports
  for (let i = 0; i < Math.min(ports.length, 20); i++) {
    const port = ports[i];
    try {
      const response = await fetch(`http://localhost:${port}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(500)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.service === 'Glass API' || data.status === 'online') {
          currentApiPort = port;
          console.log(`[Glass Extension] Detected Glass app on port ${port}`);
          return port;
        }
      }
    } catch (e) {
      // Port not available, try next
    }
  }
  console.log('[Glass Extension] Glass app not detected');
  return null;
}

// Poll for read requests from Glass app
let pollingInterval = null;
let isPolling = false;
let lastPollTime = 0;
let aggressivePolling = false; // Flag for aggressive polling when request detected
let isReading = false; // Flag to prevent multiple simultaneous reads

async function pollForReadRequests() {
  try {
    // Detect port if not set
    if (!currentApiPort) {
      await detectGlassPort();
    }
    
    const apiPort = currentApiPort || 51173;
    
    // Log polling activity occasionally to verify service worker is alive
    const now = Date.now();
    if (now - lastPollTime > 30000) { // Log every 30 seconds
      console.log(`[Glass Extension] Polling for read requests (port ${apiPort})...`);
      lastPollTime = now;
    }
    
    const response = await fetch(`http://localhost:${apiPort}/api/extension/read-request`, {
      method: 'GET',
      signal: AbortSignal.timeout(1500)
    });

    if (response.ok) {
      const data = await response.json();
      
      if (data.hasRequest) {
        // Prevent multiple simultaneous reads
        if (isReading) {
          return; // Already reading, skip this poll
        }
        
        console.log('[Glass Extension] Read request received from Glass app');
        isReading = true;
        
        // Switch to aggressive polling (poll every 500ms for faster response)
        if (!aggressivePolling) {
          aggressivePolling = true;
          if (pollingInterval) {
            clearInterval(pollingInterval);
          }
          pollingInterval = setInterval(pollForReadRequests, 500);
          console.log('[Glass Extension] Switched to aggressive polling (500ms)');
        }
        
        // Try to wake up service worker with a notification (if available)
        try {
          chrome.notifications.create({
            type: 'basic',
            title: 'Glass',
            message: 'Reading current tab...',
            silent: true,
            requireInteraction: false
          }, (notificationId) => {
            // Clear notification immediately (we just used it to wake up)
            if (notificationId) {
              setTimeout(() => {
                chrome.notifications.clear(notificationId);
              }, 100);
            }
          });
        } catch (notifError) {
          // Ignore if notifications not available
        }
        
        // Get the active tab and read it
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          console.log('[Glass Extension] Found tabs:', tabs?.length || 0);
          
          if (tabs && tabs.length > 0) {
            const tabId = tabs[0].id;
            const tabUrl = tabs[0].url;
            console.log(`[Glass Extension] Reading tab ${tabId}: ${tabUrl}`);
            
            // Check if it's a chrome:// page
            if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('chrome-extension://') || tabUrl.startsWith('about:')) {
              throw new Error('Cannot read Chrome internal pages. Please navigate to a regular webpage.');
            }
            
            try {
              const result = await readCurrentTab(tabId);
              console.log('[Glass Extension] Read completed successfully:', result);
              
              // Acknowledge the read request
              try {
                await fetch(`http://localhost:${apiPort}/api/extension/read-ack`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({})
                });
                console.log('[Glass Extension] Read completed and acknowledged');
              } catch (ackError) {
                console.error('[Glass Extension] Failed to acknowledge read:', ackError);
              }
            } catch (readError) {
              console.error('[Glass Extension] Failed to read tab:', readError);
              console.error('[Glass Extension] Error details:', readError.message, readError.stack);
            }
            
            // Switch back to normal polling after 3 seconds
            setTimeout(() => {
              aggressivePolling = false;
              isReading = false;
              if (pollingInterval) {
                clearInterval(pollingInterval);
              }
              pollingInterval = setInterval(pollForReadRequests, 1500);
              console.log('[Glass Extension] Switched back to normal polling (1.5s)');
            }, 3000);
          } else {
            console.warn('[Glass Extension] No active tab found');
            isReading = false;
          }
        } catch (queryError) {
          console.error('[Glass Extension] Failed to query tabs:', queryError);
          isReading = false;
        }
      }
    }
  } catch (error) {
    // Only log errors occasionally to avoid console spam
    const now = Date.now();
    if (now - lastPollTime > 10000) { // Log at most once per 10 seconds
      if (error.name !== 'AbortError' && !error.message.includes('Failed to fetch')) {
        console.log('[Glass Extension] Polling error:', error.message);
      }
      lastPollTime = now;
    }
  }
}

function startPollingForReadRequests() {
  if (isPolling) {
    console.log('[Glass Extension] Already polling, skipping...');
    return;
  }
  isPolling = true;
  
  console.log('[Glass Extension] Starting to poll for read requests every 1.5 seconds...');

  // Poll every 1.5 seconds (faster response)
  pollingInterval = setInterval(pollForReadRequests, 1500);
  
  // Also poll immediately
  pollForReadRequests();
}

function stopPollingForReadRequests() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  isPolling = false;
  console.log('[Glass Extension] Stopped polling for read requests');
}

// Initialize immediately when service worker loads
async function initializeExtension() {
  console.log('[Glass Extension] Initializing extension...');
  await detectGlassPort();
  startPollingForReadRequests();
  
  // Create keep-alive alarm immediately (more frequent to keep service worker alive)
  try {
    await chrome.alarms.create('keepAlive', { periodInMinutes: 0.1 }); // Every 6 seconds
    console.log('[Glass Extension] Keep-alive alarm created (every 6 seconds)');
  } catch (error) {
    console.warn('[Glass Extension] Failed to create alarm:', error);
  }
}

// Initialize on extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Glass Extension] Extension installed/updated:', details.reason);
  initializeExtension();
});

// Initialize on browser startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[Glass Extension] Browser startup, initializing...');
  initializeExtension();
});

// Keep service worker alive with alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // Wake up and poll - this is critical to keep service worker alive
    if (!isPolling) {
      console.log('[Glass Extension] Service worker woken by alarm, restarting polling...');
      initializeExtension();
    } else {
      // Just poll to keep active - this prevents service worker from going idle
      pollForReadRequests();
    }
  }
});

// Also listen for any external message to wake up (like from content script)
chrome.runtime.onMessageExternal?.addListener((request, sender, sendResponse) => {
  // Wake up service worker
  if (!isPolling) {
    console.log('[Glass Extension] Woken by external message, restarting...');
    initializeExtension();
  }
  return false;
});

// Keep service worker alive by listening to messages (second listener for ping from content script)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // This keeps the service worker alive
  if (request.action === 'ping') {
    // Restart polling if it stopped (service worker was idle)
    if (!isPolling) {
      console.log('[Glass Extension] Woken by ping from content script, restarting polling...');
      initializeExtension();
    }
    sendResponse({ success: true, message: 'Service worker is alive', isPolling: isPolling });
    return true; // Keep channel open for async response
  }
  return false;
});

// Start immediately when service worker loads (don't wait for events)
// This ensures polling starts even if the extension popup is never opened
console.log('[Glass Extension] Service worker loaded, starting initialization...');
initializeExtension();

// Also set up a periodic wake-up using chrome.storage (alternative keep-alive)
// This ensures the service worker stays active even if alarms don't work
setInterval(() => {
  chrome.storage.local.set({ 
    lastActive: Date.now() 
  }).catch(() => {
    // Ignore errors
  });
}, 10000); // Every 10 seconds

