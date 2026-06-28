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
    console.log('[Background Fetch] sourceUrl:', sourceUrl);
    console.log('[Background Fetch] targetUrl:', targetUrl);
    
    (async () => {
      try {
        const res1 = await fetch(sourceUrl, { credentials: 'omit' });
        console.log('[Background Fetch] res1 status:', res1.status);
        console.log('[Background Fetch] res1 headers:', Object.fromEntries(res1.headers.entries()));
        
        if (!res1.ok) throw new Error(`來源字幕請求失敗 (HTTP ${res1.status})`);
        const text1 = await res1.text();
        console.log('[Background Fetch] res1 text length:', text1 ? text1.length : 0);
        
        if (!text1 || text1.trim() === "") throw new Error('來源字幕資料為空 (0位元組)');
        
        let text2 = null;
        if (targetUrl) {
          try {
            console.log('[Background Fetch] Fetching targetUrl...');
            const res2 = await fetch(targetUrl, { credentials: 'omit' });
            console.log('[Background Fetch] res2 status:', res2.status);
            if (res2.ok) {
              text2 = await res2.text();
              console.log('[Background Fetch] res2 text length:', text2 ? text2.length : 0);
            }
          } catch (e) {
            console.warn('[Background Fetch] Failed to fetch target subtitles:', e);
          }
        }
        sendResponse({ success: true, sourceXml: text1, targetXml: text2 });
      } catch (err) {
        console.error('[Background Fetch] Error:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    
    return true; // async response
  }
});
