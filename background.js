// YouTube Dual Subtitles Background Script (Service Worker)

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  if (message.type === 'FETCH_SUBTITLES') {
    const { sourceUrl, targetUrl } = message;
    
    (async () => {
      try {
        const res1 = await fetch(sourceUrl, { credentials: 'omit' });
        if (!res1.ok) throw new Error(`來源字幕請求失敗 (HTTP ${res1.status})`);
        const text1 = await res1.text();
        if (!text1 || text1.trim() === "") throw new Error('來源字幕資料為空 (0位元組)');
        
        let text2 = null;
        if (targetUrl) {
          try {
            const res2 = await fetch(targetUrl, { credentials: 'omit' });
            if (res2.ok) {
              text2 = await res2.text();
            }
          } catch (e) {
            console.warn('Failed to fetch target subtitles:', e);
          }
        }
        sendResponse({ success: true, sourceXml: text1, targetXml: text2 });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    
    return true; // async response
  }
});
