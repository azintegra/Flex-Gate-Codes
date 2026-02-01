/**
 * Flex Gate Codes SW (bulletproof)
 * - Never cache index.html, app.js, data.json (prevents stale grouping/names)
 * - Cache style/icons/manifest for speed/offline
 */
const VERSION = "v1";
const CACHE = `flex-gate-codes-static-${VERSION}`;

const STATIC = [
  "./style.css",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./.nojekyll"
];

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache critical files
  if (
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/data.json")
  ) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  // Cache-first safe assets
  if (
    url.pathname.endsWith("/style.css") ||
    url.pathname.endsWith("/manifest.json") ||
    url.pathname.endsWith("/icon-192.png") ||
    url.pathname.endsWith("/icon-512.png") ||
    url.pathname.endsWith("/.nojekyll")
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Default network fallback
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(event.request, { ignoreSearch: true })) ||
        new Response("Offline", { status: 503 });
    })
  );
});
