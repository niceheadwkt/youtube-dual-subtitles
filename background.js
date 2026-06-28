// YouTube Dual Subtitles Background Script (Service Worker)

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_SUBTITLES') {
    const { sourceUrl, targetUrl } = message;

    const fetchText = (url) =>
      fetch(url, { credentials: 'omit' })
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        });

    Promise.all([
      fetchText(sourceUrl),
      targetUrl ? fetchText(targetUrl).catch(() => null) : Promise.resolve(null)
    ])
      .then(([sourceXml, targetXml]) => {
        sendResponse({ success: true, sourceXml, targetXml });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });

    return true;
  }

  if (message.type === 'TRANSLATE') {
    const { text, targetLang } = message;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        if (data && data[0]) {
          const translatedText = data[0].map(segment => segment[0] || '').join('');
          sendResponse({ success: true, text: translatedText });
        } else {
          sendResponse({ success: false, error: 'Invalid response format' });
        }
      })
      .catch(error => {
        console.error('Background Translation Error:', error);
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate that we will respond asynchronously
    return true;
  }
});
