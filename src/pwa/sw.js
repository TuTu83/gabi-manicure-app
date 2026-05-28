self.GM_PWA_CACHE = 'gm-pwa-v3';

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

self.addEventListener('notificationclick', (event) => {
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

self.addEventListener('push', (event) => {
  console.log('[SW] Push recebido', event);
  if (event.data) {
    const data = event.data.json();
    const title = data.title || 'Gabi Manicure';
    const options = {
      body: data.body || 'Nova notificação',
      icon: '/icon.svg',
      badge: '/icon.svg',
      silent: false,
      renotify: true,
      tag: data.tag || `gm-push-${Date.now()}`,
      requireInteraction: true,
      vibrate: [250, 100, 250],
      data: data.data || {}
    };
    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  }
});
