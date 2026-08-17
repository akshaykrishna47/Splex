/**
 * Splex service worker.
 *
 * Scope is deliberately narrow: cache the app shell and static bundle so the
 * app opens without a network, and get out of the way for everything else.
 *
 * It never caches Supabase requests. Ledger data going stale silently would be
 * far worse than a spinner — someone acting on a cached balance from three
 * days ago is exactly the failure this app exists to prevent.
 */

const VERSION = 'splex-v1';
const SHELL_CACHE = `${VERSION}-shell`;

const SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-1024.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept API traffic — always hit the network for ledger data.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) return;

  // Navigations: network first, fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached ?? caches.match('/'))),
    );
    return;
  }

  // Static assets: cache first. The bundle filename is content-hashed, so a
  // stale entry can never shadow a new build.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
