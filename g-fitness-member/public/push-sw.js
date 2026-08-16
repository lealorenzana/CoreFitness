/* Web push handlers, imported into the generated service worker.
 *
 * This lives in `public/` and is pulled in via `workbox.importScripts` rather
 * than being written as a custom service worker. vite-plugin-pwa is on the
 * `generateSW` strategy: switching to `injectManifest` to add twelve lines of
 * push handling would mean owning the whole precache/routing setup by hand, and
 * that setup is load-bearing (the SPA navigation fallback and the Supabase
 * denylist below it).
 *
 * Plain JS on purpose — it is served as-is from `public/`, never bundled.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  // The sender controls this payload, but a malformed one must not kill the
  // handler — a thrown error here means the user simply never sees the message.
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Core Fitness', body: event.data.text() };
  }

  const title = payload.title || 'Core Fitness';
  const options = {
    body: payload.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    // Collapses repeats of the same kind rather than stacking six identical
    // banners the way the old in-app toast did.
    tag: payload.tag || 'core-fitness',
    renotify: Boolean(payload.tag),
    data: { url: payload.url || '/member/home' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/member/home';

  // Focus an already-open window instead of opening a second copy of the app.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
