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

// ==========================================
// Subtitle Downloader & Exporter Feature
// ==========================================

// Inject script to retrieve the YouTube player response in the page context
function getPlayerResponse() {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        const player = document.getElementById('movie_player');
        const data = player && typeof player.getPlayerResponse === 'function' 
          ? player.getPlayerResponse() 
          : window.ytInitialPlayerResponse;
        document.dispatchEvent(new CustomEvent('AntigravityGetPlayerResponse', { detail: data }));
      })();
    `;
    const handler = (e) => {
      document.removeEventListener('AntigravityGetPlayerResponse', handler);
      script.remove();
      resolve(e.detail);
    };
    document.addEventListener('AntigravityGetPlayerResponse', handler);
    document.documentElement.appendChild(script);
  });
}

// Listen to messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_VIDEO_INFO') {
    if (window.location.pathname !== '/watch') {
      sendResponse({ isWatchPage: false });
      return true;
    }
    
    getPlayerResponse().then((playerResponse) => {
      const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      const videoTitle = playerResponse?.videoDetails?.title || document.title || 'youtube_subtitle';
      sendResponse({
        isWatchPage: true,
        tracks: tracks,
        videoTitle: videoTitle
      });
    }).catch(err => {
      console.error('Error fetching player response:', err);
      sendResponse({ isWatchPage: true, tracks: [], videoTitle: document.title });
    });
    
    return true; // async response
  }
  
  if (message.type === 'DOWNLOAD_SUBTITLES') {
    const { format, baseUrl, targetLang, videoTitle } = message;
    
    performDownload(format, baseUrl, targetLang, videoTitle)
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        console.error('Download subtitles error:', err);
        sendResponse({ success: false, error: err.message });
      });
      
    return true; // async response
  }
});

// Fetch source and translated subtitle tracks, merge and trigger download
async function performDownload(format, baseUrl, targetLang, videoTitle) {
  // 1. Fetch source track in JSON3 format
  const sourceUrl = `${baseUrl}&fmt=json3`;
  const sourceRes = await fetch(sourceUrl);
  if (!sourceRes.ok) throw new Error('無法取得原始字幕資料');
  const sourceData = await sourceRes.json();
  const sourceEvents = sourceData.events || [];

  // 2. Fetch translated track if different
  let ythLang = targetLang;
  if (targetLang === 'zh-TW') ythLang = 'zh-Hant';
  else if (targetLang === 'zh-CN') ythLang = 'zh-Hans';

  let translatedEvents = [];
  try {
    const targetUrl = `${baseUrl}&tlang=${ythLang}&fmt=json3`;
    const targetRes = await fetch(targetUrl);
    if (targetRes.ok) {
      const targetData = await targetRes.json();
      translatedEvents = targetData.events || [];
    }
  } catch (err) {
    console.warn('Failed to fetch translated track from YouTube, downloading source only:', err);
  }

  // 3. Merge tracks and generate file
  let fileContent = '';
  const sanitizedTitle = videoTitle.replace(/[\\/:*?"<>|]/g, '_'); // sanitize filename

  if (format === 'srt') {
    fileContent = generateSrt(sourceEvents, translatedEvents);
    downloadFile(fileContent, `${sanitizedTitle}.srt`, 'text/srt');
  } else {
    fileContent = generateTxt(sourceEvents, translatedEvents);
    downloadFile(fileContent, `${sanitizedTitle}.txt`, 'text/plain');
  }
}

// Generate SRT dual subtitle content
function generateSrt(sourceEvents, translatedEvents) {
  let srt = '';
  let index = 1;

  for (let i = 0; i < sourceEvents.length; i++) {
    const sEvt = sourceEvents[i];
    if (!sEvt.segs || sEvt.segs.length === 0) continue;

    const text1 = sEvt.segs.map(s => s.utf8).join('').trim();
    if (!text1) continue;

    const startMs = sEvt.tStartMs;
    const durationMs = sEvt.dDurationMs || 0;
    const endMs = startMs + durationMs;

    // Find translated text
    let text2 = '';
    if (translatedEvents.length > 0) {
      let tEvt = translatedEvents.find(t => Math.abs(t.tStartMs - startMs) < 100);
      if (!tEvt && i < translatedEvents.length) {
        tEvt = translatedEvents[i];
      }
      if (tEvt && tEvt.segs) {
        text2 = tEvt.segs.map(s => s.utf8).join('').trim();
      }
    }

    srt += `${index}\n`;
    srt += `${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}\n`;
    srt += `${text1}\n`;
    if (text2 && text2 !== text1) {
      srt += `${text2}\n`;
    }
    srt += '\n';
    index++;
  }
  return srt;
}

// Generate TXT transcript content
function generateTxt(sourceEvents, translatedEvents) {
  let txt = '';
  for (let i = 0; i < sourceEvents.length; i++) {
    const sEvt = sourceEvents[i];
    if (!sEvt.segs || sEvt.segs.length === 0) continue;

    const text1 = sEvt.segs.map(s => s.utf8).join('').trim();
    if (!text1) continue;

    const startMs = sEvt.tStartMs;

    // Find translated text
    let text2 = '';
    if (translatedEvents.length > 0) {
      let tEvt = translatedEvents.find(t => Math.abs(t.tStartMs - startMs) < 100);
      if (!tEvt && i < translatedEvents.length) {
        tEvt = translatedEvents[i];
      }
      if (tEvt && tEvt.segs) {
        text2 = tEvt.segs.map(s => s.utf8).join('').trim();
      }
    }

    const timeStr = formatTxtTime(startMs);
    txt += `[${timeStr}] ${text1}\n`;
    if (text2 && text2 !== text1) {
      txt += `        ${text2}\n`;
    }
    txt += '\n';
  }
  return txt;
}

// Helper to format milliseconds to HH:MM:SS,mmm
function formatSrtTime(ms) {
  const hr = Math.floor(ms / 3600000);
  const min = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const msec = ms % 1000;

  return `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(msec).padStart(3, '0')}`;
}

// Helper to format milliseconds to MM:SS or HH:MM:SS
function formatTxtTime(ms) {
  const hr = Math.floor(ms / 3600000);
  const min = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);

  if (hr > 0) {
    return `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Helper to download a file in browser
function downloadFile(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
