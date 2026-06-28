// YouTube Dual Subtitles Content Script

// Settings state
const settings = {
  enabled: true,
  targetLang: 'zh-TW',
  fontSize: 20,
  bgOpacity: 50
};

// Cache for translations (originalText -> translatedText)
const translationCache = new Map();

// Load initial settings
chrome.storage.local.get(settings, (savedSettings) => {
  Object.assign(settings, savedSettings);
  updateAllSubtitles();
});

// Listen to settings changes from Popup
chrome.storage.onChanged.addListener((changes) => {
  let changed = false;
  for (const key in changes) {
    if (key in settings) {
      settings[key] = changes[key].newValue;
      changed = true;
    }
  }
  if (changed) {
    updateAllSubtitles();
  }
});

// Translation function that delegates to background script to bypass CORS
async function translateText(text, targetLang) {
  if (!text || text.trim() === '') return '';
  
  const cacheKey = `${targetLang}:${text}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'TRANSLATE', text, targetLang },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('YouTube Dual Subtitles Error:', chrome.runtime.lastError);
          resolve('');
          return;
        }

        if (response && response.success) {
          const translatedText = response.text;
          
          // Cache the result
          translationCache.set(cacheKey, translatedText);
          
          // Keep cache size reasonable
          if (translationCache.size > 200) {
            const firstKey = translationCache.keys().next().value;
            translationCache.delete(firstKey);
          }
          
          resolve(translatedText);
        } else {
          console.error('YouTube Dual Subtitles API Error:', response ? response.error : 'Unknown error');
          resolve('');
        }
      }
    );
  });
}

// Extract subtitle text from a YouTube caption window
function getCaptionText(captionWindow) {
  const segments = captionWindow.querySelectorAll('.ytp-caption-segment');
  if (!segments || segments.length === 0) return '';
  return Array.from(segments)
    .map(el => el.textContent.trim())
    .filter(text => text.length > 0)
    .join(' ');
}

// Helper to remove custom dual subtitle from a caption window
function removeDualSubtitle(captionWindow) {
  const dualSub = captionWindow.querySelector('.ytp-dual-subtitle-container');
  if (dualSub) {
    dualSub.remove();
  }
}

// Apply styling based on current settings
function applySubtitleStyles(dualSub) {
  dualSub.style.fontSize = `${settings.fontSize}px`;
  dualSub.style.backgroundColor = `rgba(8, 8, 8, ${settings.bgOpacity / 100})`;
  dualSub.style.color = '#ffffff';
  dualSub.style.padding = '4px 8px';
  dualSub.style.borderRadius = '4px';
  dualSub.style.marginTop = '6px';
  dualSub.style.display = 'block';
  dualSub.style.textAlign = 'center';
  dualSub.style.whiteSpace = 'pre-wrap';
  dualSub.style.lineHeight = 'normal';
  dualSub.style.fontFamily = 'inherit'; // Inherit player's font
  // Robust text outline shadow for readability
  dualSub.style.textShadow = 'rgb(0, 0, 0) 0px 0px 2px, rgb(0, 0, 0) 0px 0px 2px, rgb(0, 0, 0) 0px 0px 2px, rgb(0, 0, 0) 0px 0px 2px';
}

// Process and update subtitles for a single caption window
function processCaptionWindow(captionWindow) {
  if (!settings.enabled) {
    removeDualSubtitle(captionWindow);
    return;
  }

  const originalText = getCaptionText(captionWindow);
  if (!originalText) {
    removeDualSubtitle(captionWindow);
    return;
  }

  // Prevent duplicate/infinite mutation triggers by checking if text is already processed
  if (captionWindow.dataset.currentOriginal === originalText) {
    // If settings changed, we might just need to update styles
    const dualSub = captionWindow.querySelector('.ytp-dual-subtitle-container');
    if (dualSub) {
      applySubtitleStyles(dualSub);
    }
    return;
  }

  captionWindow.dataset.currentOriginal = originalText;

  translateText(originalText, settings.targetLang).then((translated) => {
    // Prevent race conditions: check if the original text is still current
    if (captionWindow.dataset.currentOriginal !== originalText) {
      return;
    }

    if (!translated || translated.trim() === '') {
      removeDualSubtitle(captionWindow);
      return;
    }

    let dualSub = captionWindow.querySelector('.ytp-dual-subtitle-container');
    if (!dualSub) {
      dualSub = document.createElement('div');
      dualSub.className = 'ytp-dual-subtitle-container';
      captionWindow.appendChild(dualSub);
    }

    dualSub.textContent = translated;
    applySubtitleStyles(dualSub);
  });
}

// Scan and update all active caption windows
function updateAllSubtitles() {
  const captionWindows = document.querySelectorAll('.caption-window');
  captionWindows.forEach(window => {
    if (!settings.enabled) {
      removeDualSubtitle(window);
    } else {
      processCaptionWindow(window);
    }
  });
}

// Handle mutations in the subtitle container
function handleMutations(mutations) {
  for (const mutation of mutations) {
    // Get the element node if the mutation target is a text node
    const targetElement = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
    if (!targetElement) continue;

    // Skip if mutation is in our custom subtitle elements to prevent infinite loops
    if (
      (targetElement.classList && targetElement.classList.contains('ytp-dual-subtitle-container')) ||
      Array.from(mutation.addedNodes).some(node => node.nodeType === Node.ELEMENT_NODE && node.classList.contains('ytp-dual-subtitle-container'))
    ) {
      continue;
    }

    // Find the caption window associated with the mutation target
    const captionWindow = targetElement.closest('.caption-window');
    if (captionWindow) {
      processCaptionWindow(captionWindow);
    } else {
      // If mutation happened directly in the container (e.g. caption window added or removed)
      updateAllSubtitles();
    }
  }
}

// MutationObserver instance
let observer = null;

// Initialize observer by targeting YouTube's caption container
function initObserver() {
  const container = document.querySelector('.ytp-caption-window-container');
  if (container) {
    if (observer) return; // Already observing
    
    observer = new MutationObserver(handleMutations);
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    // Initial run in case captions are already visible
    updateAllSubtitles();
  } else {
    // If container disappears, cleanup the observer
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }
}

// Start checking for subtitle container
// YouTube navigations happen dynamically, so we check periodically
setInterval(initObserver, 1000);
