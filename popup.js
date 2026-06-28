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

    const sourceUrl = `${baseUrl}&fmt=json3`;
    const targetUrl = `${baseUrl}&tlang=${ythLang}&fmt=json3`;

    // Show loading state
    const descEl = document.getElementById('download-desc');
    const originalDesc = descEl.textContent;
    descEl.textContent = '正在下載與翻譯字幕...';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab) {
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          world: 'MAIN',
          func: async (sUrl, tUrl) => {
            try {
              const res1 = await fetch(sUrl);
              if (!res1.ok) throw new Error(`HTTP 錯誤: ${res1.status}`);
              const data1 = await res1.json();
              
              let data2 = null;
              try {
                const res2 = await fetch(tUrl);
                if (res2.ok) {
                  data2 = await res2.json();
                }
              } catch (e) {
                console.warn('Failed to fetch translated subtitles:', e);
              }
              
              return { success: true, sourceData: data1, targetData: data2 };
            } catch (err) {
              return { success: false, error: err.message };
            }
          },
          args: [sourceUrl, targetUrl]
        }, (results) => {
          descEl.textContent = originalDesc; // restore status text

          if (chrome.runtime.lastError || !results || !results[0] || !results[0].result.success) {
            const errMsg = results && results[0] ? results[0].result.error : (chrome.runtime.lastError ? chrome.runtime.lastError.message : '執行失敗');
            alert('下載失敗: ' + errMsg);
            return;
          }

          const { sourceData, targetData } = results[0].result;
          const sourceEvents = sourceData?.events || [];
          const translatedEvents = targetData?.events || [];

          if (sourceEvents.length === 0) {
            alert('下載失敗: 字幕資料為空');
            return;
          }

          let fileContent = '';
          const sanitizedTitle = videoTitle.replace(/[\\/:*?"<>|]/g, '_');

          if (format === 'srt') {
            fileContent = generateSrt(sourceEvents, translatedEvents);
            downloadFile(fileContent, `${sanitizedTitle}.srt`, 'text/srt');
          } else {
            fileContent = generateTxt(sourceEvents, translatedEvents);
            downloadFile(fileContent, `${sanitizedTitle}.txt`, 'text/plain');
          }
        });
      }
    });
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
      if (translatedEvents && translatedEvents.length > 0) {
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
      if (translatedEvents && translatedEvents.length > 0) {
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
