let debugMode = false;

// Initialize/retrieve debugMode cached state
chrome.storage.local.get({ debug: false }, (data) => {
  debugMode = data.debug;
});

// Watch for changes in debugMode
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.debug) {
    debugMode = changes.debug.newValue;
  }
});

function log(...args) {
  if (debugMode) {
    console.log("[YouTube History Quick Delete]", ...args);
  }
}

// On extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({ enabled: true, deletedCount: 0, debug: false }, () => {
      log("Initialized extension state on install.");
    });
  }
});

// On Chrome startup, reset session deleted count
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({ deletedCount: 0 }, () => {
    log("Reset session counter on startup.");
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "videoDeleted") {
    chrome.storage.local.get({ deletedCount: 0 }, (data) => {
      const newCount = data.deletedCount + 1;
      chrome.storage.local.set({ deletedCount: newCount }, () => {
        log("Incremented deleted count to:", newCount);
      });
    });
  }
});

// Watch for tab updates to dynamically inject the content script on the history page.
// This allows narrowing host permissions strictly to https://www.youtube.com/feed/history*.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;
  if (url && url.includes("youtube.com/feed/history")) {
    // Execute injection on complete or on explicit URL change.
    // The content script has an internal IIFE guard to prevent duplicate click handlers.
    if (changeInfo.status === "complete" || changeInfo.url) {
      log(`Detected history page update in tab ${tabId}. Injecting content script...`);
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"]
      }).then(() => {
        log(`Successfully injected content script into tab ${tabId}`);
      }).catch((err) => {
        log(`Content script injection skipped or deferred: ${err.message}`);
      });
    }
  }
});

