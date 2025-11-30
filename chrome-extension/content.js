// Content script - runs in the context of web pages
// This script helps keep the background service worker alive by pinging it periodically

console.log('[Glass Extension] Content script loaded');

// Ping background script periodically to keep it alive
// This helps prevent the service worker from going idle
setInterval(() => {
  chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
    if (chrome.runtime.lastError) {
      // Background script might be idle, that's ok - it will wake up when needed
    }
  });
}, 20000); // Every 20 seconds - this keeps the service worker active

