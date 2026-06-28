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
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab) {
        // Send message to content script to perform the download
        chrome.tabs.sendMessage(activeTab.id, {
          type: 'DOWNLOAD_SUBTITLES',
          format,
          baseUrl,
          targetLang,
          videoTitle
        }, (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            alert('下載失敗: ' + (response ? response.error : '與頁面失去連線'));
          }
        });
      }
    });
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
