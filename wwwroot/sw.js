const CACHE_NAME = 'navlog-ipad-shell-v8';
const APP_SHELL = [
  './',
  './index.html?v=20260711-8',
  './offline.html',
  './app.css?v=20260711-6',
  './app.js?v=20260711-8',
  './manifest.webmanifest',
  './assets/feuerwehr-einhausen-logo.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/mgrs.js',
  './vendor/qrcode.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) return response;
      return caches.match('./index.html?v=20260711-8').then(cached => cached || caches.match('./offline.html'));
    }).catch(() => caches.match('./index.html?v=20260711-8')).catch(() => caches.match('./offline.html')));
    return;
  }

  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(event.request);
    const refreshed = fetch(event.request).then(response => {
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    }).catch(() => null);

    // Bereits geladene Dateien starten sofort; online wird der Cache im
    // Hintergrund aktualisiert. So kommen Updates ohne Neuinstallation an.
    return cached || refreshed || cache.match('./offline.html');
  }));
});
