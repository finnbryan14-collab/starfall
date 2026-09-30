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

/*
  Notifications.

  The payload is JSON: { title, body, tag, url }. Everything is optional — the
  push protocol allows a message with no body at all, and a worker that throws
  on one shows the browser's own "This site has been updated in the background"
  instead, which is worse than saying nothing useful ourselves.

  `tag` collapses repeats: a second "resin is full" replaces the first rather
  than stacking, because two of them say nothing the first did not.
*/

const DEFAULT_NOTIFICATION = {
  title: 'Starfall',
  body: 'Something you were waiting for is ready.',
  url: '/timers',
};

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A push that is not JSON is still a push worth showing.
    payload = {};
  }

  const title = payload.title || DEFAULT_NOTIFICATION.title;
  const url = payload.url || DEFAULT_NOTIFICATION.url;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || DEFAULT_NOTIFICATION.body,
      tag: payload.tag || 'starfall',
      renotify: Boolean(payload.tag),
      icon: '/icon/192',
      badge: '/icon/192',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || DEFAULT_NOTIFICATION.url;

  event.waitUntil(
    (async () => {
      // Focus a tab that is already open rather than opening a second one.
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ('navigate' in client) await client.navigate(url);
        return;
      }

      await self.clients.openWindow(url);
    })(),
  );
});
