// Retires the service worker of the old single-campus app that used to live at this address.
// Apps now live under /ug/, /knust/ and /ucc/, each with its own service worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) c.navigate(c.url).catch(() => {});
  })());
});
