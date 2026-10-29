/*
 * Service worker: shows order updates sent by the store (Web Push) and opens the order when
 * the notification is tapped. Open shop tabs are told too, so they refresh the order at once.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : '' };
  }
  const title = message.title || 'MFMart';
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    tabs.forEach((tab) => tab.postMessage({ type: 'order-update', order_id: message.order_id, status: message.status }));
    await self.registration.showNotification(title, {
      body: message.body || '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: message.tag,
      renotify: Boolean(message.tag),
      data: { url: message.url || '/orders' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.url || '/orders';
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = tabs.find((t) => new URL(t.url).origin === self.location.origin);
    if (tab) {
      await tab.focus();
      tab.postMessage({ type: 'open', url: path });
      return undefined;
    }
    return self.clients.openWindow(new URL(path, self.location.origin).href);
  })());
});
