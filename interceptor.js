// Runs in MAIN world at document_start.
// Hooks window.fetch to cache YouTube timedtext responses so the popup
// can retrieve them without making its own authenticated requests.

(function () {
  if (window.__dualSubIntercepted) return;
  window.__dualSubIntercepted = true;
  window.__dualSubCache = {};

  const _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
    const promise = _fetch(input, init);

    if (url && url.includes('/api/timedtext')) {
      promise.then(response => {
        const clone = response.clone();
        clone.text().then(text => {
          if (!text) return;
          try {
            const u = new URL(url);
            const lang = u.searchParams.get('lang') || u.searchParams.get('tlang') || 'unknown';
            const tlang = u.searchParams.get('tlang');
            const key = tlang ? `tlang:${tlang}` : `lang:${lang}`;
            window.__dualSubCache[key] = { text, url };
          } catch (_) {}
        }).catch(() => {});
      }).catch(() => {});
    }

    return promise;
  };
})();
