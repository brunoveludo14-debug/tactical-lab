/**
 * sw.js — Service Worker para Tactical Lab
 * Cache-first para assets estáticos, network-first para HTML.
 */

const CACHE_NAME = 'tactical-lab-v2';

const STATIC_ASSETS = [
  './tactical.html',
  './styles.css',
  './app.js',
  './state.js',
  './render.js',
  './animation.js',
  './storage.js',
  './pwa.js',
  './club.js',
  './library.js',
  './player-editor.js',
  './playerfit.js',
  './calendar.js',
  './modules/auth.js',
  './modules/ui.js',
  './modules/export.js',
  './modules/qrcode.min.js',
  './manifest.json'
];

// Instalar — pré-cache dos assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Ativar — limpar caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first para JS/CSS, network-first para HTML
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignorar requests externos (fonts, CDN, etc.)
  if (url.origin !== self.location.origin) return;

  // Network-first para HTML (sempre versão mais recente)
  if (event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first para tudo o resto
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Mensagem SKIP_WAITING do update toast
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
