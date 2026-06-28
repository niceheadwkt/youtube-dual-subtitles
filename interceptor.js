// Runs in MAIN world at document_start.
// Hooks window.fetch AND XMLHttpRequest to cache YouTube timedtext
// responses so the popup can retrieve them without re-fetching.

(function () {
  if (window.__dualSubIntercepted) return;
  window.__dualSubIntercepted = true;
  window.__dualSubCache = {};

  function cacheTimedtext(url, text) {
    if (!url || !text) return;
    try {
      const u = new URL(url, location.href);
      if (!u.pathname.includes('/api/timedtext')) return;
      const tlang = u.searchParams.get('tlang');
      const lang  = u.searchParams.get('lang') || 'unknown';
      const key   = tlang ? `tlang:${tlang}` : `lang:${lang}`;
      window.__dualSubCache[key] = { text, url };
      console.log('[DualSub interceptor] cached', key, 'len:', text.length);
    } catch (_) {}
  }

  // --- Hook fetch ---
  const _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
    const promise = _fetch(input, init);
    if (url.includes('/api/timedtext') || url.includes('timedtext')) {
      promise.then(r => r.clone().text().then(t => cacheTimedtext(url, t)).catch(() => {})).catch(() => {});
    }
    return promise;
  };

  // --- Hook XHR ---
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__dualSubUrl = String(url);
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const url = this.__dualSubUrl || '';
    if (url.includes('/api/timedtext') || url.includes('timedtext')) {
      this.addEventListener('load', function () {
        cacheTimedtext(url, this.responseText);
      });
    }
    return _send.apply(this, arguments);
  };
})();
