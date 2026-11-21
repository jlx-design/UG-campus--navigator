// UG Campus Navigator service worker.
// Caches only the static app shell (same-origin files) and the pinned Leaflet library.
// API, auth, routing, AI and map-tile requests always go to the network and are never cached here.
const VERSION = '__BUILD_ID__';
const SHELL = `ugnav-shell-${VERSION}`;
// Paths are relative to the SW's own location, so the app works at a domain root or under a sub-path (GitHub Pages).
const BASE = new URL('./', self.location).pathname;
const SHELL_FILES = ['', 'index.html', 'app.js', 'app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'].map(p => BASE + p);
const LIB_HOSTS = ['unpkg.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ugnav-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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
  // Everything else (Data API, auth, server function, tiles): default network behaviour.
});
