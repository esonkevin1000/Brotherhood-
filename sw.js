// Brotherhood service worker. `VERSION` is injected by the server and changes on every deploy,
// so the browser sees a new worker, the app shows an "Update app" button, and one tap loads the new version.
// Network-first: pages and scripts are always fetched fresh; the cache is only an offline fallback. API calls are never cached.
const CACHE = 'brotherhood-' + (typeof VERSION === 'string' ? VERSION : 'dev'), SHELL = ['/pos', '/pos.js', '/update.js', '/logo.png', '/icon-192.png', '/brotherhood', '/member', '/bh.js', '/bh.webmanifest', '/bh-mark.png', '/bh-icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => { })); });   // no skipWaiting: the user decides when to update
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && SHELL.includes(u.pathname)) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then(m => m || new Response('Offline: no internet connection. Please try again.', { status: 503 }))));
});
// Push notifications (booking, reminders, community). The server sends { title, body, url, tag }.
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Brotherhood', { body: d.body || '', icon: '/bh-icon-192.png', badge: '/bh-icon-192.png', tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || '/member' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || '/member';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if (new URL(c.url).origin === location.origin && 'focus' in c) { if ('navigate' in c) c.navigate(url).catch(() => { }); return c.focus(); } }
    return clients.openWindow(url);
  }));
});
