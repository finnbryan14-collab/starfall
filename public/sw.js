/*
  Starfall's service worker.
  
  Hand-written rather than generated. Starfall is local-first — every screen
  reads from IndexedDB and the engine is pure client-side arithmetic — so
  offline support only needs the shell cached, not a data sync layer. A
  build-time precache manifest would be more machinery than that earns.

  Strategies:
  - Navigations: network first, so a deployed change lands immediately, with
    the cached shell as the fallback when there is no network.
  - Next's build output under /_next/static: cache first. Those filenames are
    content-hashed, so a cached one can never be stale.
  - Everything else, including the Enka and wish-history proxies: network only.
    Cached account data would be worse than no account data.
*/

const VERSION = 'starfall-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

/** The routes worth having available with no network at all. */
const SHELL_ROUTES = ['/plan', '/artifacts', '/timers', '/account'];
const OFFLINE_FALLBACK = '/plan';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one failed route cannot abort the whole install.
      await Promise.all(SHELL_ROUTES.map((route) => cache.add(route).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => !name.startsWith(VERSION)).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never serve a stale answer for account data.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, response.clone());
          return response;
        } catch {
          const cached = await caches.match(request);
          return cached ?? (await caches.match(OFFLINE_FALLBACK)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
  }
});
