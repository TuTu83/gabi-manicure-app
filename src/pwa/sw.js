importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

self.GM_PWA_CACHE = 'gm-pwa-v5';

const firebaseConfig = {
  apiKey: 'AIzaSyC7w5V4GQ9fK7o4n2a3l6o9q8w5e7r4t3y2u1i0o9p8a7s6d5f',
  authDomain: 'gabi-manicure.firebaseapp.com',
  projectId: 'gabi-manicure',
  storageBucket: 'gabi-manicure.appspot.com',
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:a1b2c3d4e5f6a7b8c9d0e1f'
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  
  messaging.onBackgroundMessage((payload) => {
    console.log('[SW FCM] Mensagem em background recebida:', payload);
    const notificationTitle = payload.notification?.title || 'Gabi Manicure';
    const notificationOptions = {
      body: payload.notification?.body || 'Nova notificação',
      icon: '/icon.svg',
      badge: '/icon.svg',
      silent: false,
      renotify: true,
      tag: payload.data?.tag || `gm-fcm-${Date.now()}`,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: payload.data || {}
    };
    if (payload.data?.action) {
      notificationOptions.actions = [
        {
          action: payload.data.action,
          title: 'Estou a caminho'
        }
      ];
    }
    self.registration.showNotification(notificationTitle, notificationOptions);
  });

} catch (e) {
  console.warn('[SW FCM] Firebase não configurado, usando service worker básico');
}

self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker v5');
  event.waitUntil(
    caches.open(self.GM_PWA_CACHE).then((cache) => {
      return cache.addAll(['/','/index.html','/manifest.webmanifest','/icon.svg']).catch(() => undefined);
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando Service Worker v5');
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

self.addEventListener('push', (event) => {
  console.log('[SW] Push RECEBIDO!', event);
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
      vibrate: [200, 100, 200],
      data: data.data || {}
    };
    if (data.action) {
      options.actions = [
        {
          action: data.action,
          title: 'Estou a caminho'
        }
      ];
    }
    console.log('[SW] Exibindo notificação via Service Worker', title, options);
    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  }
});