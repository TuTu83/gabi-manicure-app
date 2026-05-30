
// firebase-messaging-sw.js - Versão com logs detalhada
console.log("[SW] 1. INICIANDO SERVICE WORKER...");
try {
  console.log("[SW] 2. Tentando importar firebase-app-compat.js");
  importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
  console.log("[SW] 3. firebase-app-compat.js carregado");

  console.log("[SW] 4. Tentando importar firebase-messaging-compat.js");
  importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');
  console.log("[SW] 5. firebase-messaging-compat.js carregado");

  const firebaseConfig = {
    apiKey: '__GM_FIREBASE_API_KEY__',
    authDomain: '__GM_FIREBASE_AUTH_DOMAIN__',
    projectId: '__GM_FIREBASE_PROJECT_ID__',
    storageBucket: '__GM_FIREBASE_STORAGE_BUCKET__',
    messagingSenderId: '__GM_FIREBASE_MESSAGING_SENDER_ID__',
    appId: '__GM_FIREBASE_APP_ID__',
  };
  console.log("[SW] 6. firebaseConfig carregado:", JSON.stringify({
    ...firebaseConfig,
    apiKey: '[MASKED]',
    appId: '[MASKED]',
  }, null, 2));

  console.log("[SW] 7. Tentando inicializar firebase.initializeApp()");
  const app = firebase.initializeApp(firebaseConfig);
  console.log("[SW] 8. firebase.initializeApp() finalizado", app.name);

  console.log("[SW] 9. Tentando firebase.messaging()");
  const messaging = firebase.messaging();
  console.log("[SW] 10. firebase.messaging() finalizado com sucesso");

  messaging.onBackgroundMessage((payload) => {
    console.log('[SW] 11. Recebida mensagem em background', payload);
    const notificationTitle = payload.notification?.title || 'Gabi Manicure';
    const notificationOptions = {
      body: payload.notification?.body || 'Nova notificação',
      icon: '/icon.svg',
      badge: '/icon.svg',
      vibrate: [100, 50, 100],
      requireInteraction: true,
      tag: 'gabi_manicure_notification',
      renotify: true,
      data: payload.data || {},
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
  });

  self.addEventListener('notificationclick', (event) => {
    console.log('[SW] 12. Clique na notificação', event);
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(clients.openWindow(url));
  });

  console.log("[SW] 13. Tudo carregado com sucesso!");

} catch (error) {
  console.error("[SW] ERRO CRÍTICO NO SERVICE WORKER!", error);
  console.error("[SW] Stack trace:", error.stack);
}

