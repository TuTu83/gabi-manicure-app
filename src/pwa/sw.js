self.GM_PWA_CACHE = 'gm-pwa-v6';

self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker v6');
  event.waitUntil(
    caches.open(self.GM_PWA_CACHE).then((cache) => {
      return cache.addAll(['/','/index.html','/manifest.webmanifest','/icon.svg']).catch(() => undefined);
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando Service Worker v6');
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
  
  // Allow cross-origin requests for Firebase CDNs, gstatic, etc.
  const ALLOWED_CROSS_ORIGINS = [
    'https://www.gstatic.com',
    'https://firebasestorage.googleapis.com',
    'https://firebaseappcheck.googleapis.com',
    'https://www.googleapis.com'
  ];
  
  if (ALLOWED_CROSS_ORIGINS.some(origin => url.href.startsWith(origin))) {
    return; // Don't intercept these, let browser handle normally
  }
  
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

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Clique na notificação', event);
  event.notification.close();
  const data = event.notification.data || {};
  const appointmentId = data?.appointmentId;
  let url = data?.url || '/';
  if (event.action === 'on_my_way') {
    url = `/?notificationAction=on_my_way&appointmentId=${appointmentId || ''}`;
  }
  const openUrl = new URL(url, self.location.origin).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            return client.navigate ? client.navigate(openUrl) : self.clients.openWindow(openUrl);
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(openUrl);
        }
        return undefined;
      }),
  );
});
