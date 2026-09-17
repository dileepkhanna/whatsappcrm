/* ============================================================
   WhatsCRM Service Worker — Web Push Notifications
   Handles background push events and notification clicks.
   ============================================================ */

const CACHE_NAME = 'whatscrm-sw-v1';

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// ── Push received ─────────────────────────────────────────────
self.addEventListener('push', (e) => {
  let data = { title: 'WhatsCRM', body: 'You have a new notification', icon: '/favicon.svg', url: '/' };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch (_) {
    if (e.data) data.body = e.data.text();
  }

  const options = {
    body:    data.body,
    icon:    data.icon || '/favicon.svg',
    badge:   '/favicon.svg',
    tag:     data.tag || 'whatscrm-push',
    renotify: true,
    vibrate: [200, 100, 200],
    data:    { url: data.url || '/' },
    actions: [
      { action: 'open',    title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  e.waitUntil(self.registration.showNotification(data.title, options));
});

// ── Notification click ────────────────────────────────────────
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  if (e.action === 'dismiss') return;

  const targetUrl = e.notification.data?.url || '/';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a tab is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open a new tab
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// ── Push subscription change ──────────────────────────────────
self.addEventListener('pushsubscriptionchange', (e) => {
  // Re-subscribe and update the server
  e.waitUntil(
    self.registration.pushManager.subscribe(e.oldSubscription.options)
      .then((newSub) => {
        // Notify all clients so they can POST the new subscription to the server
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => client.postMessage({
            type: 'PUSH_SUBSCRIPTION_CHANGED',
            subscription: JSON.parse(JSON.stringify(newSub)),
          }));
        });
      })
  );
});
