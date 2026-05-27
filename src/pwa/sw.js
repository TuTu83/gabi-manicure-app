self.GM_PWA_CACHE = 'gm-pwa-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(self.GM_PWA_CACHE).then((cache) => {
      return cache.addAll(['/','/index.html','/manifest.webmanifest','/icon.svg']).catch(() => undefined);
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gm-pwa-') && k !== self.GM_PWA_CACHE).map((k) => caches.delete(k))))
        .catch(() => undefined),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(self.GM_PWA_CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(self.GM_PWA_CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
        return res;
      });
    }),
  );
});
