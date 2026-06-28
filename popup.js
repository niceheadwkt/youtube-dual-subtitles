document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const enableToggle = document.getElementById('enable-toggle');
  const targetLanguage = document.getElementById('target-language');
  const fontSizeSlider = document.getElementById('font-size');
  const fontSizeVal = document.getElementById('font-size-val');
  const bgOpacitySlider = document.getElementById('bg-opacity');
  const bgOpacityVal = document.getElementById('bg-opacity-val');
  const statusBadge = document.getElementById('status-badge');

  // Default settings
  const defaultSettings = {
    enabled: true,
    targetLang: 'zh-TW',
    fontSize: 20,
    bgOpacity: 50
  };

  // Load saved settings
  chrome.storage.local.get(defaultSettings, (settings) => {
    enableToggle.checked = settings.enabled;
    targetLanguage.value = settings.targetLang;
    fontSizeSlider.value = settings.fontSize;
    fontSizeVal.textContent = `${settings.fontSize}px`;
    bgOpacitySlider.value = settings.bgOpacity;
    bgOpacityVal.textContent = `${settings.bgOpacity}%`;

    updateStatusBadge(settings.enabled);
  });

  // Event Listeners
  enableToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.storage.local.set({ enabled });
    updateStatusBadge(enabled);
  });

  targetLanguage.addEventListener('change', (e) => {
    chrome.storage.local.set({ targetLang: e.target.value });
  });

  fontSizeSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    fontSizeVal.textContent = `${val}px`;
  });

  fontSizeSlider.addEventListener('change', (e) => {
    chrome.storage.local.set({ fontSize: parseInt(e.target.value, 10) });
  });

  bgOpacitySlider.addEventListener('input', (e) => {
    const val = e.target.value;
    bgOpacityVal.textContent = `${val}%`;
  });

  bgOpacitySlider.addEventListener('change', (e) => {
    chrome.storage.local.set({ bgOpacity: parseInt(e.target.value, 10) });
  });

  // Query active tab for caption track information using chrome.scripting.executeScript
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab && activeTab.url && activeTab.url.includes('youtube.com/watch')) {
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        world: 'MAIN',
        func: () => {
          const player = document.getElementById('movie_player');
          const data = player && typeof player.getPlayerResponse === 'function' 
            ? player.getPlayerResponse() 
            : window.ytInitialPlayerResponse;
          return {
            tracks: data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [],
            videoTitle: data?.videoDetails?.title || document.title || 'youtube_subtitle'
          };
        }
      }, (results) => {
        if (chrome.runtime.lastError || !results || !results[0]) {
          document.getElementById('download-desc').textContent = '未偵測到影片播放或字幕';
          console.error('Execute script error:', chrome.runtime.lastError);
          return;
        }

        const { tracks, videoTitle } = results[0].result;
        if (!tracks || tracks.length === 0) {
          document.getElementById('download-desc').textContent = '此影片無可用 CC 字幕';
          return;
        }

        // Show controls
        document.getElementById('download-desc').textContent = `已偵測到 ${tracks.length} 個字幕軌`;
        const select = document.getElementById('download-source-lang');
        select.innerHTML = '';
        tracks.forEach(track => {
          const opt = document.createElement('option');
          opt.value = track.baseUrl;
          opt.textContent = track.name.simpleText || track.languageCode;
          select.appendChild(opt);
        });
        document.getElementById('download-controls').style.display = 'block';

        // Add button listener
        document.getElementById('download-srt').onclick = () => {
          triggerDownload('srt', select.value, videoTitle);
        };
        document.getElementById('download-txt').onclick = () => {
          triggerDownload('txt', select.value, videoTitle);
        };
      });
    } else {
      document.getElementById('download-desc').textContent = '請在 YouTube 影片播放頁面使用';
    }
  });

  function triggerDownload(format, baseUrl, videoTitle) {
    const targetLang = targetLanguage.value; // e.g. zh-TW
    let ythLang = targetLang;
    if (targetLang === 'zh-TW') ythLang = 'zh-Hant';
    else if (targetLang === 'zh-CN') ythLang = 'zh-Hans';

    // Replace &amp; to & in base URL to avoid parameter parsing issues
    const cleanBaseUrl = baseUrl.replace(/&amp;/g, '&');
    
    // We fetch raw timedtext XML (without fmt=json3) which is highly compatible and bypasses new JSON token validation
    const sourceUrl = cleanBaseUrl;
    const targetUrl = `${cleanBaseUrl}&tlang=${ythLang}`;

    // Show loading state
    const descEl = document.getElementById('download-desc');
    const originalDesc = descEl.textContent;
    descEl.textContent = '正在下載與翻譯字幕...';

    chrome.runtime.sendMessage({
      type: 'FETCH_SUBTITLES',
      sourceUrl,
      targetUrl
    }, (response) => {
      descEl.textContent = originalDesc; // restore status text

      if (chrome.runtime.lastError || !response || !response.success) {
        const errMsg = response ? response.error : (chrome.runtime.lastError ? chrome.runtime.lastError.message : '連線逾時');
        alert('下載失敗: ' + errMsg);
        return;
      }

      const { sourceXml, targetXml } = response;
      
      const sourceEvents = parseXmlSubtitles(sourceXml);
      const translatedEvents = targetXml ? parseXmlSubtitles(targetXml) : [];

      if (sourceEvents.length === 0) {
        alert('下載失敗: 剖析字幕資料後無內容');
        return;
      }

      let fileContent = '';
      const sanitizedTitle = videoTitle.replace(/[\\/:*?"<>|]/g, '_');

      if (format === 'srt') {
        fileContent = generateSrtFromXml(sourceEvents, translatedEvents);
        downloadFile(fileContent, `${sanitizedTitle}.srt`, 'text/srt');
      } else {
        fileContent = generateTxtFromXml(sourceEvents, translatedEvents);
        downloadFile(fileContent, `${sanitizedTitle}.txt`, 'text/plain');
      }
    });
  }

  // Parse YouTube timedtext XML format
  function parseXmlSubtitles(xmlText) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      const textEls = xmlDoc.getElementsByTagName('text');
      const events = [];
      
      for (let i = 0; i < textEls.length; i++) {
        const el = textEls[i];
        const start = parseFloat(el.getAttribute('start') || '0') * 1000;
        const dur = parseFloat(el.getAttribute('dur') || '0') * 1000;
        const text = el.textContent || '';
        events.push({
          tStartMs: Math.round(start),
          dDurationMs: Math.round(dur),
          text: decodeHtmlEntities(text)
        });
      }
      return events;
    } catch (e) {
      console.error('XML parsing error:', e);
      return [];
    }
  }

  // Decode XML/HTML entities like &amp; &quot; &#39;
  function decodeHtmlEntities(str) {
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
  }

  // Generate SRT dual subtitle content from XML events
  function generateSrtFromXml(sourceEvents, translatedEvents) {
    let srt = '';
    let index = 1;

    for (let i = 0; i < sourceEvents.length; i++) {
      const sEvt = sourceEvents[i];
      const text1 = sEvt.text;
      if (!text1) continue;

      const startMs = sEvt.tStartMs;
      const endMs = startMs + sEvt.dDurationMs;

      // Find translated text
      let text2 = '';
      if (translatedEvents && translatedEvents.length > 0) {
        let tEvt = translatedEvents.find(t => Math.abs(t.tStartMs - startMs) < 100);
        if (!tEvt && i < translatedEvents.length) {
          tEvt = translatedEvents[i];
        }
        if (tEvt) {
          text2 = tEvt.text;
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

  // Generate TXT transcript content from XML events
  function generateTxtFromXml(sourceEvents, translatedEvents) {
    let txt = '';
    for (let i = 0; i < sourceEvents.length; i++) {
      const sEvt = sourceEvents[i];
      const text1 = sEvt.text;
      if (!text1) continue;

      const startMs = sEvt.tStartMs;

      // Find translated text
      let text2 = '';
      if (translatedEvents && translatedEvents.length > 0) {
        let tEvt = translatedEvents.find(t => Math.abs(t.tStartMs - startMs) < 100);
        if (!tEvt && i < translatedEvents.length) {
          tEvt = translatedEvents[i];
        }
        if (tEvt) {
          text2 = tEvt.text;
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


  // Helper to update status badge UI
  function updateStatusBadge(enabled) {
    if (enabled) {
      statusBadge.textContent = '已啟用';
      statusBadge.classList.remove('disabled');
    } else {
      statusBadge.textContent = '已關閉';
      statusBadge.classList.add('disabled');
    }
  }
});
