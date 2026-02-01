/**
 * Gate Codes PWA Service Worker (GH Pages safe)
 * Goals:
 *  - NEVER serve stale data.json (network-only + cache-bust fallback disabled)
 *  - Keep index.html and app.js fresh (network-first)
 *  - Cache CSS + icons for fast load/offline (cache-first)
 */
const VERSION = 'v11';
const CACHE_NAME = `gatecodes-${VERSION}`;

// Static assets that are safe to cache long-ish
const STATIC_ASSETS = [
  './style.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install: pre-cache static assets only
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

// Activate: clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request, { cache: 'no-store' });
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // ✅ Never cache/serve stale data.json — always hit network
  if (url.pathname.endsWith('/data.json')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Keep HTML + JS fresh (prevents "old UI" problems)
  if (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/app.js')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache-first for safe static assets (CSS/icons/manifest)
  if (
    url.pathname.endsWith('/style.css') ||
    url.pathname.endsWith('/manifest.json') ||
    url.pathname.endsWith('/icon-192.png') ||
    url.pathname.endsWith('/icon-512.png')
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Default: try network, fallback to cache
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      return cached || new Response('Offline', { status: 503 });
    })
  );
});
