const CACHE_VERSION = 'saomancos-v9';
const BASE_CACHE = CACHE_VERSION + '-base';

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/style.css',
  '/sw.js',
  '/pwa.js',
  '/animation.js',
  '/icon-192.png',
  '/icon-512.png'
];

// ── Install ──────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(BASE_CACHE).then(c => c.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== BASE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ───────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Fonts: Cache First, stale-while-revalidate
  if (url.href.startsWith('https://fonts.googleapis.com') ||
      url.href.startsWith('https://fonts.gstatic.com')) {
    e.respondWith(
      caches.open(BASE_CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        try {
          const response = await fetch(e.request);
          if (response.ok) cache.put(e.request, response.clone());
          return response;
        } catch {
          return new Response('', { status: 503 });
        }
      })
    );
    return;
  }

  // Navigation (HTML): Network First → fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match('/index.html').catch(() =>
          new Response('<html><body><h1>Offline</h1></body></html>',
            { headers: { 'Content-Type': 'text/html' } })
        )
      )
    );
    return;
  }

  // Same-origin static assets: Cache First
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (response.ok) {
            caches.open(BASE_CACHE).then(c => c.put(e.request, response.clone()));
          }
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }
});