/**
 * Firebase Cloud Messaging Service Worker
 *
 * This file MUST be served from the root path (/firebase-messaging-sw.js).
 * It is automatically discovered by the Firebase JS SDK when calling getToken().
 *
 * Because service workers cannot make authenticated API calls, we cannot fetch
 * the Firebase config here at install time. Instead we receive it via a
 * postMessage from the main page (sent by useFcmTokenSync) and store it in
 * IndexedDB so the service worker can initialize Firebase on the next fetch.
 *
 * The simpler approach used here: we import the Firebase SW compat bundle and
 * wait for the config to be pushed via a INIT_FCM message before initializing.
 */

importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

let messaging = null;

// ─── Listen for config from the main page ────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'INIT_FCM') {
    const config = event.data.config;

    if (!config || !config.apiKey) return;

    try {
      // Avoid double-initialization if SW is reused across navigations.
      let app;
      try {
        app = firebase.app();
      } catch (_) {
        app = firebase.initializeApp(config);
      }

      messaging = firebase.messaging(app);

      // Handle background messages (app is closed / in background).
      messaging.onBackgroundMessage((payload) => {
        const notification = payload.notification || {};
        const data = payload.data || {};

        self.registration.showNotification(
          notification.title || data.title || 'New Notification',
          {
            body: notification.body || data.body || '',
            icon: notification.icon || data.icon || '/favicon.svg',
            data: { url: data.url || '/' },
            badge: '/favicon.svg',
          }
        );
      });
    } catch (err) {
      console.error('[FCM SW] Init error:', err);
    }
  }
});

// ─── Handle notification click — open / focus the target URL ─────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If the app is already open, focus it.
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Otherwise open a new tab.
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
