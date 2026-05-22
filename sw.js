const CACHE_VERSION = 'saomancos-v8';
const BASE_CACHE = CACHE_VERSION + '-base';
const SHELL_CACHE  = CACHE_VERSION + '-shell';

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

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';

// ── Install: precache shell assets ───────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(BASE_CACHE).then(c =>
      c.addAll(PRECACHE).catch(() => {})
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ──────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== BASE_CACHE && k !== SHELL_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Fonts: Cache First, stale-while-revalidate
  if (url.href.startsWith(FONT_URL)) {
    e.respondWith(
      caches.open(BASE_CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        const fetchPromise = fetch(e.request)
          .then(response => {
            if (response.ok) cache.put(e.request, response.clone());
            return response;
          })
          .catch(() => null);
        return cached || fetchPromise || new Response('', { status: 503 });
      })
    );
    return;
  }

  // Navigation (HTML): Network First → fallback to shell /index.html
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .catch(() => caches.match('/index.html') ||
                    new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/html' } }))
    );
    return;
  }

  // Static assets: Cache First, then network
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(response => {
          if (response.ok) {
            const cache = caches.open(BASE_CACHE);
            cache.then(c => c.put(e.request, response.clone()));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 503 }))
      )
    );
    return;
  }

  // External: network only (let it fail naturally)
});