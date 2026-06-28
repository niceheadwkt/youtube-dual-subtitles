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
});
