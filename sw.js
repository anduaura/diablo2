/* Sanctuary service worker — network-first with offline cache fallback.
   The cache is named after SANCTUARY_VERSION (js/version.js), so every
   release gets a fresh cache and old ones are swept on activate. The
   browser re-checks imported scripts for changes, so bumping the version
   is what triggers the update flow (and the in-page update toast). */
importScripts('js/version.js');
const CACHE = 'sanctuary-v' + (typeof SANCTUARY_VERSION === 'string' ? SANCTUARY_VERSION : 'x');
const ASSETS = ['./', 'index.html', 'css/style.css', 'js/game.js', 'js/version.js', 'manifest.json', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
