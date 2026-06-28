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
