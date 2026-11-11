/* Robin VA · service worker — funciona con o sin internet
   Para publicar una versión nueva: cambie VERSION y suba index.html + sw.js. */
const VERSION = 'robin-va-v1.0.0';
const CORE = ['./', './index.html'];
const FONT_CACHE = 'robin-va-fonts';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(CORE.map((u) =>
        fetch(u, { cache: 'reload' }).then((r) => { if (r.ok) return c.put(u, r); }).catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Navegación: red primero (3 s) para recibir actualizaciones; si no hay red, la copia guardada.
  if (req.mode === 'navigate' || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname))) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const net = await Promise.race([fetch(req), timeout(3000)]);
        if (net && net.ok) { cache.put('./index.html', net.clone()); return net; }
        throw new Error('bad');
      } catch (e) {
        return (await cache.match('./index.html')) || (await cache.match('./')) ||
          (await caches.match(req, { ignoreSearch: true })) ||
          new Response('<h1>Sin conexión</h1><p>Abra la app una vez con internet para guardarla.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // Tipografías de Google: caché primero, se guardan la primera vez que hay red.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }
      catch (e) { return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } }); }
    })());
    return;
  }

  // Resto del mismo origen: caché primero, luego red.
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => {
        if (r && r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return r;
      }).catch(() => new Response('', { status: 504 })))
    );
  }
});
