/* CultureWave Web Push service worker. */
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (_) { payload = {body: event.data ? event.data.text() : ''}; }
  const title = payload.title || 'CultureWave';
  const options = {
    body: payload.body || payload.message || 'You have a new update.',
    data: {url: payload.url || '/customer-dashboard.html'},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/customer-dashboard.html', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(clients => {
    const match = clients.find(client => client.url === target);
    if (match) return match.focus();
    return self.clients.openWindow(target);
  }));
});
