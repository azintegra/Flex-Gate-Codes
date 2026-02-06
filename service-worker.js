/* Basic offline cache for Gate Codes PWA */
const CACHE_NAME = 'gatecodes-v12';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './data.csv',
  './data.json',
  './assets/icon-1024.png',
  './assets/icon-120.png',
  './assets/icon-128.png',
  './assets/icon-144.png',
  './assets/icon-152.png',
  './assets/icon-16.png',
  './assets/icon-167.png',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-256.png',
  './assets/icon-32.png',
  './assets/icon-384.png',
  './assets/icon-48.png',
  './assets/icon-512.png',
  './assets/icon-72.png',
  './assets/icon-96.png',
  './assets/splash-1125x2436.png',
  './assets/splash-1170x2532.png',
  './assets/splash-1179x2556.png',
  './assets/splash-1242x2688.png',
  './assets/splash-1284x2778.png',
  './assets/splash-1290x2796.png',
  './assets/splash-640x1136.png',
  './assets/splash-750x1334.png',
  './assets/splash-828x1792.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if(req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then(cached => {
      if(cached) return cached;

      return fetch(req).then(res => {
        // Cache same-origin successful responses
        try{
          const url = new URL(req.url);
          if(url.origin === self.location.origin && res && res.ok){
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          }
        }catch(_){}
        return res;
      }).catch(() => {
        // fallback to cached index for navigation
        if(req.mode === 'navigate') return caches.match('./index.html');
        return cached;
      });
    })
  );
});
