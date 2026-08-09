const CACHE_NAME = 'navlog-ipad-shell-v33';
const APP_SHELL = [
  './',
  './index.html?v=20260809-33',
  './offline.html',
  './app.css?v=20260809-33',
  './app.js?v=20260809-33',
  './manifest.webmanifest',
  './data/waldbrand-poi-ffeh.geojson',
  './data/strassen.geojson',
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
  './vendor/qrcode.min.js',
  './vendor/taktische-zeichen/flaechenbrand.svg',
  './vendor/taktische-zeichen/entstehungsbrand.svg',
  './vendor/taktische-zeichen/vollbrand.svg',
  './vendor/taktische-zeichen/gefahr.svg',
  './vendor/taktische-zeichen/richtung.svg',
  './vendor/taktische-zeichen/einsatzleitung.svg',
  './vendor/taktische-zeichen/einsatzabschnitt.svg',
  './vendor/taktische-zeichen/bereitstellungsraum.svg',
  './vendor/taktische-zeichen/lotsenstelle.svg',
  './vendor/taktische-zeichen/hubschrauberlandeplatz.svg',
  './vendor/taktische-zeichen/tlf.svg',
  './vendor/taktische-zeichen/loeschfahrzeug.svg',
  './vendor/taktische-zeichen/schlauchwagen.svg',
  './vendor/taktische-zeichen/loeschgruppe.svg',
  './vendor/taktische-zeichen/hubschrauber.svg',
  './vendor/taktische-zeichen/wasserentnahme.svg',
  './vendor/taktische-zeichen/hydrant.svg',
  './vendor/taktische-zeichen/loeschbrunnen.svg',
  './vendor/taktische-zeichen/zisterne.svg',
  './vendor/taktische-zeichen/loeschteich.svg',
  './vendor/taktische-zeichen/ankerpunkt.svg',
  './vendor/taktische-zeichen/lookout.svg',
  './vendor/taktische-zeichen/elw1.svg',
  './vendor/taktische-zeichen/elw2.svg',
  './vendor/taktische-zeichen/geraetewagen.svg',
  './vendor/taktische-zeichen/mehrzweckfahrzeug.svg',
  './vendor/taktische-zeichen/sw2000.svg',
  './vendor/taktische-zeichen/wechsellader.svg',
  './vendor/taktische-zeichen/rettungswagen.svg',
  './vendor/taktische-zeichen/drohne.svg'
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
      return caches.match('./index.html?v=20260809-33').then(cached => cached || caches.match('./offline.html'));
    }).catch(() => caches.match('./index.html?v=20260809-33').then(cached => cached || caches.match('./offline.html'))));
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
