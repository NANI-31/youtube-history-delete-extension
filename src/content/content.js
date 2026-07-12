// content.js

(() => {
  if (window.hasYTHistoryQuickDeleteInjected) {
    return;
  }
  window.hasYTHistoryQuickDeleteInjected = true;

  let debugMode = false;

function log(...args) {
  if (debugMode) {
    console.log("[YouTube History Quick Delete]", ...args);
  }
}

function warn(...args) {
  if (debugMode) {
    console.warn("[YouTube History Quick Delete]", ...args);
  }
}

// Global cached state to allow synchronous checking inside events (preventing navigation async failures)
let extensionEnabled = true;

if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get({ enabled: true, debug: false }, (data) => {
    extensionEnabled = data.enabled;
    debugMode = data.debug;
    log("Synchronous state initialized. Extension enabled:", extensionEnabled, "Debug mode:", debugMode);
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local") {
      if (changes.enabled) {
        extensionEnabled = changes.enabled.newValue;
        log("Synchronous state updated. Extension enabled:", extensionEnabled);
      }
      if (changes.debug) {
        debugMode = changes.debug.newValue;
        log("Synchronous state updated. Debug mode:", debugMode);
      }
    }
  });
}
// Helper to cleanup temporary styles hiding YouTube's popup menu
function cleanupStyles() {
  const el = document.getElementById("yt-history-quick-delete-hide-menu");
  if (el) {
    el.remove();
    log("Removed popup hiding stylesheet.");
  }
}

// Helper to find the closest ancestor matching a selector, crossing Shadow DOM boundaries
function findClosest(el, selector) {
  if (!el) return null;
  
  // Try standard closest first
  try {
    const match = el.closest(selector);
    if (match) return match;
  } catch (e) {}

  // If not found, traverse up including Shadow DOM hosts
  let current = el;
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      if (current.matches && current.matches(selector)) {
        return current;
      }
    }
    // Cross Shadow DOM boundary
    current = current.parentNode || (current.getRootNode && current.getRootNode().host);
  }
  return null;
}

// Helper to query selector deep inside elements, including traversing Shadow Roots
function queryShadow(parent, selector) {
  if (!parent) return null;
  
  try {
    let match = parent.querySelector(selector);
    if (match) return match;
  } catch (e) {}
  
  // Check direct shadow root
  if (parent.shadowRoot) {
    try {
      const match = parent.shadowRoot.querySelector(selector);
      if (match) return match;
    } catch (e) {}
  }
  
  // Recursive check for nested shadow roots
  const children = parent.querySelectorAll("*");
  for (const child of children) {
    if (child.shadowRoot) {
      const result = queryShadow(child.shadowRoot, selector);
      if (result) return result;
    }
  }
  return null;
}

// Helper to query all elements matching a selector deep inside shadow roots
function queryShadowAll(parent, selector, results = []) {
  if (!parent) return results;
  
  try {
    const matches = parent.querySelectorAll(selector);
    matches.forEach(m => results.push(m));
  } catch (e) {}

  if (parent.shadowRoot) {
    try {
      queryShadowAll(parent.shadowRoot, selector, results);
    } catch (e) {}
  }

  const children = parent.querySelectorAll("*");
  for (const child of children) {
    if (child.shadowRoot) {
      queryShadowAll(child.shadowRoot, selector, results);
    }
  }
  return results;
}

// Find the three-dot menu button in a video card
function findMenuButton(videoItem) {
  // Try a list of CSS selectors first (ordered by specificity and likelihood)
  const selectors = [
    // Modern YouTube view model class names
    ".yt-lockup-metadata-view-model__menu-button button",
    ".yt-lockup-metadata-view-model__menu-button",
    ".ytLockupMetadataViewModelMenuButton button",
    ".ytLockupMetadataViewModelMenuButton",
    
    // Explicit aria-label selectors for menu/actions
    'button[aria-label*="menu" i]',
    'button[aria-label*="action" i]',
    'button[aria-label*="option" i]',
    '[aria-label*="Action menu" i]',
    '[aria-label*="options menu" i]',
    
    // General menu renderer buttons
    "ytd-menu-renderer button",
    "ytd-menu-renderer yt-icon-button",
    "ytd-menu-renderer #button",
    
    // Web Component button shapes
    'yt-icon-button[aria-label*="menu" i]',
    'yt-icon-button[aria-label*="action" i]',
    'yt-icon-button[aria-label*="option" i]',
    
    // Any button with "menu", "option", "action", "more" in class or attributes
    'button[class*="menu" i]',
    '[class*="menu-button" i] button',
    '[class*="MenuButton" i] button',
    
    // General fallback button tags
    "yt-icon-button",
    "button#button",
    ".yt-icon-button",
    "button"
  ];

  for (const selector of selectors) {
    try {
      const el = queryShadow(videoItem, selector);
      if (el) {
        log(`Found menu button matching selector: ${selector}`);
        return el;
      }
    } catch (e) {
      warn(`Selector error for "${selector}":`, e.message);
    }
  }

  // Fallback: search all buttons (including in Shadow DOM) and find one whose attributes suggest it is a menu
  const allButtons = queryShadowAll(videoItem, "button, [role='button'], yt-icon-button");
  log(`Found ${allButtons.length} total buttons inside videoItem during fallback search.`);
  for (const btn of allButtons) {
    const classList = Array.from(btn.classList).join(" ").toLowerCase();
    const id = btn.id.toLowerCase();
    const ariaLabel = (btn.getAttribute("aria-label") || "").toLowerCase();
    
    log(`Button tag: ${btn.tagName}, ID: ${id}, classList: ${classList}, ariaLabel: ${ariaLabel}`);
    
    if (
      ariaLabel.includes("menu") ||
      ariaLabel.includes("action") ||
      ariaLabel.includes("option") ||
      ariaLabel.includes("more") ||
      classList.includes("menu") ||
      classList.includes("button-shape") ||
      id.includes("button")
    ) {
      log("Selected fallback button based on attributes:", btn);
      return btn;
    }
  }

  // If we still found nothing, return the very first button we can find
  if (allButtons.length > 0) {
    log("Selected first available button:", allButtons[0]);
    return allButtons[0];
  }

  return null;
}

// Find the menu item with "Remove from watch history" in the page
function findRemoveMenuItem() {
  const elements = document.querySelectorAll("ytd-menu-service-item-renderer, tp-yt-paper-item, yt-formatted-string, span, a, [role='menuitem'], button");
  for (const el of elements) {
    const text = el.textContent || "";
    if (text.toLowerCase().includes("remove from watch history")) {
      return el;
    }
  }
  return null;
}

// Trigger the removal sequence
// Helper to remove any leftover highlight classes from the cards
function removeHighlightClasses() {
  document.querySelectorAll(".quick-delete-highlight").forEach((el) => {
    el.classList.remove("quick-delete-highlight");
  });
}

let deleteQueue = [];
let isProcessingQueue = false;

// Helper to inject styles to hide the popup/dropdown menu and animate the deleting card
function injectHideStyles() {
  if (document.getElementById("yt-history-quick-delete-hide-menu")) return;
  const hideStyles = document.createElement("style");
  hideStyles.id = "yt-history-quick-delete-hide-menu";
  hideStyles.textContent = `
    ytd-popup-container, tp-yt-iron-dropdown, yt-dropdown-menu, .ytd-popup-container {
      opacity: 0 !important;
      pointer-events: none !important;
      visibility: hidden !important;
    }
    @keyframes quickDeleteGlow {
      0% {
        box-shadow: 0 0 0px rgba(239, 68, 68, 0);
        background-color: rgba(239, 68, 68, 0);
        transform: scale(1);
      }
      30% {
        box-shadow: 0 0 20px rgba(239, 68, 68, 0.6);
        background-color: rgba(239, 68, 68, 0.1);
        transform: scale(0.99);
      }
      100% {
        box-shadow: 0 0 35px rgba(239, 68, 68, 0.8);
        background-color: rgba(239, 68, 68, 0.2);
        transform: scale(0.96);
        opacity: 0.1;
      }
    }
    .quick-delete-highlight {
      animation: quickDeleteGlow 0.4s cubic-bezier(0.25, 1, 0.5, 1) forwards !important;
      transition: all 0.4s ease !important;
      z-index: 10 !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(hideStyles);
  log("Injected stylesheet to hide dropdown popup menu and define glow keyframes.");
}

// Deletes a single video item by opening its menu and clicking the remove option
function deleteSingleVideo(videoItem) {
  return new Promise((resolve) => {
    const menuButton = findMenuButton(videoItem);
    if (!menuButton) {
      warn("Could not find three-dot menu button for history item.");
      videoItem.classList.remove("quick-delete-highlight");
      resolve(false);
      return;
    }

    log("Clicking three-dot menu button in queue:", menuButton);
    menuButton.click();

    let observer = null;
    let watchdogTimeoutId = null;
    let clickTimeoutId = null;

    const cleanup = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (watchdogTimeoutId) {
        clearTimeout(watchdogTimeoutId);
        watchdogTimeoutId = null;
      }
      if (clickTimeoutId) {
        clearTimeout(clickTimeoutId);
        clickTimeoutId = null;
      }
    };

    const attemptClickRemove = () => {
      const item = findRemoveMenuItem();
      if (item) {
        cleanup();

        // Find the closest clickable parent to make sure we trigger the component's click handler
        const clickable = item.closest(
          "ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, " +
          "tp-yt-paper-item, yt-dropdown-menu-item, yt-dropdown-item, " +
          "button, [role='menuitem'], [role='option'], a"
        ) || item;
        
        log("Found 'Remove from watch history' item. Scheduling click on clickable wrapper:", clickable);
        
        clickTimeoutId = setTimeout(() => {
          log("Performing programmatic click on wrapper:", clickable);
          clickable.click();
          
          // Notify background script
          chrome.runtime.sendMessage({ action: "videoDeleted" }).catch((err) => {
            log("Failed to send deletion message to background (could be expected if extension context invalidated):", err.message);
          });

          // Delay resolving slightly to let YouTube process the deletion animation
          setTimeout(() => {
            videoItem.classList.remove("quick-delete-highlight");
            resolve(true);
          }, 150);
        }, 50);

        return true;
      }
      return false;
    };

    // Try immediately
    if (attemptClickRemove()) {
      return;
    }

    // Observe document.body for the menu appearing
    observer = new MutationObserver(() => {
      attemptClickRemove();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Watchdog timeout after 1.5 seconds
    watchdogTimeoutId = setTimeout(() => {
      log("Timeout waiting for 'Remove from watch history' menu item to appear.");
      cleanup();
      videoItem.classList.remove("quick-delete-highlight");
      resolve(false);
    }, 1500);
  });
}

// Processes the deletion queue one by one
async function processQueue() {
  if (isProcessingQueue) return;
  if (deleteQueue.length === 0) return;

  isProcessingQueue = true;
  injectHideStyles();

  while (deleteQueue.length > 0) {
    const currentItem = deleteQueue[0];
    
    const success = await deleteSingleVideo(currentItem);
    if (success) {
      log("Successfully deleted item from queue.");
    } else {
      warn("Failed to delete item from queue.");
    }
    
    deleteQueue.shift();
    
    // Wait a short cooldown before processing the next item to let YouTube's DOM settle
    if (deleteQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 80));
    }
  }

  isProcessingQueue = false;
  cleanupStyles();
}

function addToQueue(videoItem) {
  if (!deleteQueue.includes(videoItem)) {
    deleteQueue.push(videoItem);
    videoItem.classList.add("quick-delete-highlight");
    log("Added video to queue. Queue size:", deleteQueue.length);
    processQueue();
  }
}

// Find the video card container starting from the click target
function findVideoItem(target) {
  // Debug: trace all ancestors to see the exact tag names and classes
  try {
    let curr = target;
    const path = [];
    while (curr && curr !== document.body) {
      const tag = curr.tagName ? curr.tagName.toLowerCase() : "unknown";
      const cls = curr.className && typeof curr.className === "string" ? `.${Array.from(curr.classList).join(".")}` : "";
      path.push(`${tag}${cls}`);
      curr = curr.parentNode || (curr.getRootNode && curr.getRootNode().host);
    }
    log("DEBUG: Target ancestor path:", path.join(" -> "));
  } catch (e) {
    warn("DEBUG: Error tracing ancestors:", e.message);
  }

  // Option 1: Try finding closest element by known container selectors (including Shorts renderers)
  const containerSelectors = [
    "ytm-shorts-lockup-view-model-v2",
    "ytm-shorts-lockup-view-model",
    "ytd-reel-item-renderer",
    "yt-reel-item-view-model",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-rich-item-renderer",
    "ytd-playlist-video-renderer",
    "yt-lockup-view-model",
    "ytd-lockup-view-model"
  ];
  
  for (const selector of containerSelectors) {
    const card = findClosest(target, selector);
    if (card) return card;
  }

  // Option 2: Fallback traversal based on link target (supporting both standard videos and Shorts)
  const watchLink = findClosest(target, "a[href*='watch?v='], a[href*='/shorts/']");
  if (watchLink) {
    let parent = watchLink.parentElement;
    while (parent && parent !== document.body) {
      if (queryShadow(parent, "ytd-menu-renderer, button[aria-label*='menu' i], [aria-label*='Action menu' i], [aria-label*='menu']")) {
        return parent;
      }
      parent = parent.parentElement;
    }
  }

  return null;
}

// Intercept click event
window.addEventListener("click", (event) => {
  const target = event.target;
  log("Click event captured. Pathname:", window.location.pathname, "Target:", target);

  // 1. Only activate on YouTube History page
  if (window.location.pathname !== "/feed/history") {
    log("Skipping: Not on YouTube Watch History page (/feed/history).");
    return;
  }

  // 2. Check if extension is enabled (using synchronous cache)
  if (!extensionEnabled) {
    log("Skipping: Extension is disabled in settings.");
    return;
  }

  // 3. Make sure we don't intercept clicks on buttons, menus, dropdowns, or popups
  const exclusionSelector = 
    "ytd-menu-renderer, tp-yt-iron-dropdown, ytd-popup-container, .ytd-menu-renderer, " +
    "button, [role='button'], yt-icon-button, yt-button-shape, " +
    ".yt-lockup-metadata-view-model__menu-button, .ytLockupMetadataViewModelMenuButton, " +
    "yt-dropdown-menu, tp-yt-paper-dialog, ytd-menu-service-item-renderer, tp-yt-paper-item, [role='menuitem']";
  
  const closestExclusion = findClosest(target, exclusionSelector);
  if (closestExclusion) {
    log("Skipping: Clicked element or its parent is part of an excluded menu/button/popup:", closestExclusion);
    return;
  }

  // 4. Find if they clicked on/inside a watch link (standard or Shorts link)
  const watchLink = findClosest(target, "a[href*='watch?v='], a[href*='/shorts/']");
  log("Watch/Shorts link check. Found link:", watchLink ? watchLink.getAttribute("href") : "none");

  // 5. Find the video item container
  const videoItem = findVideoItem(target);
  log("Video/Shorts item container check. Found container:", videoItem);

  if (!videoItem) {
    log("Skipping: No video/Shorts item container found for clicked target.");
    return;
  }

  // If they didn't click inside a watch/shorts link and didn't click a known card container, skip.
  // This ensures we only intercept clicks that lead to navigation.
  const isVideoCard = findClosest(target, "ytd-video-renderer, yt-lockup-view-model, ytd-reel-item-renderer, yt-reel-item-view-model, ytm-shorts-lockup-view-model-v2, ytm-shorts-lockup-view-model");
  if (!watchLink && !isVideoCard) {
    log("Skipping: Click target is neither a watch/shorts link nor inside a known video/shorts card.");
    return;
  }

  // 6. Intercept navigation completely (SYNCHRONOUSLY - this must happen immediately)
  log("--- INTERCEPTING CLICK & PREVENTING NAVIGATION ---");
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  log("Synchronously called preventDefault(), stopPropagation(), stopImmediatePropagation().");

  // 7. Add to queue for processing
  addToQueue(videoItem);
}, true); // Use capture phase to intercept at window level before YouTube's own SPA navigation handlers!

// Startup confirmation log
log("Content script loaded and active. Current path:", window.location.pathname);

})();

