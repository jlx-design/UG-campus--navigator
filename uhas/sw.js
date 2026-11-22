// UG Campus Navigator service worker.
// Caches the static app shell, the pinned map library, and campus map tiles (for offline use).
// API, auth, routing and AI requests always go to the network and are never cached.
const VERSION = 'mwregny4';
const SHELL = `ugnav-uhas-shell-${VERSION}`;
// Paths are relative to the SW's own location, so the app works at a domain root or under a sub-path (GitHub Pages).
const BASE = new URL('./', self.location).pathname;
const SHELL_FILES = ['', 'index.html', 'app.js', 'app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'].map(p => BASE + p);
const LIB_HOSTS = ['unpkg.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ugnav-uhas-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Navigation: network first, fall back to cached shell when offline.
  if (req.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith(fetch(req).catch(() => caches.match(BASE + 'index.html')));
    return;
  }
  // Same-origin static assets: stale-while-revalidate.
  if (url.origin === location.origin && url.pathname.startsWith(BASE)) {
    e.respondWith(caches.open(SHELL).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  // Pinned, integrity-checked library files (versioned URLs).
  if (LIB_HOSTS.includes(url.hostname) && url.pathname.includes('@')) {
    e.respondWith(caches.open(SHELL).then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; })));
  }
  // Web fonts: font files are immutable; the CSS is refreshed in the background. Lets the app keep its type offline.
  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(caches.open('ugnav-uhas-fonts-v1').then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return url.hostname === 'fonts.gstatic.com' ? (hit || net) : (hit ? (net, hit) : net);
    }));
    return;
  }
  // Everything else (Data API, auth, server function, tiles): default network behaviour.
});

// ── Offline campus map: OpenFreeMap vector tiles, styles, sprites and fonts are cached as they're used
// (and pre-fetched by "Download campus map"). Cache-first so the map works with no data.
const MAP_CACHE = 'ugnav-uhas-map-v1';
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname !== 'tiles.openfreemap.org') return;
  e.respondWith(caches.open(MAP_CACHE).then(async c => {
    const hit = await c.match(req);
    if (hit) return hit;
    try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; } catch (err) { return hit || Response.error(); }
  }));
});

// ── Push notifications (class & exam reminders, announcements)
self.addEventListener('push', e => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch (_) { m = { title: 'Campus update', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || 'Campus update', {
    body: m.body || '', tag: m.tag, data: { url: m.url || './' }, icon: BASE + 'icons/icon-192.png', badge: BASE + 'icons/icon-192.png', renotify: !!m.tag,
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL(e.notification.data && e.notification.data.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const w of list) if (w.url.startsWith(self.registration.scope)) { w.focus(); return w.navigate(target); }
    return self.clients.openWindow(target);
  }));
});
