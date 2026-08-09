const CACHE_NAME = 'navlog-ipad-shell-v41';
const APP_SHELL = [
  './',
  './index.html?v=20260809-41',
  './offline.html',
  './app.css?v=20260809-41',
  './app.js?v=20260809-41',
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

// ── Kachel-Zwischenspeicher ────────────────────────────────────────────────
// NavLog-WMS-Kacheln und OSM-Kacheln liegen auf fremden Servern und wurden
// bisher bei jedem Schwenk neu geholt. Sie landen jetzt in eigenen Caches, die
// wochenweise rotieren: geschrieben wird nur in die laufende Woche, bedient
// wird aus laufender + voriger Woche. Ältere Wochen fallen damit von selbst
// weg (Verfall nach ein bis zwei Wochen), ohne Zeitstempel je Eintrag.
const KACHEL_PRAEFIX = 'navlog-kacheln-';
const KACHEL_PRAEFIX_OSM = 'navlog-kacheln-osm-';
const KACHEL_MAX_NAVLOG = 600;
const KACHEL_MAX_OSM = 300;
const KACHEL_AUFRAEUM_MENGE = 50;   // so viele älteste Einträge fallen weg
const KACHEL_PRUEF_INTERVALL = 20;  // Größenprüfung nur bei jeder n-ten Ablage
const WOCHE_MS = 7 * 24 * 60 * 60 * 1000;

// ISO-8601-Woche über die Donnerstagsregel: Der Donnerstag einer Woche
// bestimmt, zu welchem Jahr und welcher Wochennummer sie zählt.
function isoDonnerstag(datum) {
  const tag = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const wochentag = (tag.getUTCDay() + 6) % 7; // Montag = 0 … Sonntag = 6
  tag.setUTCDate(tag.getUTCDate() - wochentag + 3);
  return tag;
}

function isoWoche(datum) {
  const donnerstag = isoDonnerstag(datum);
  const jahr = donnerstag.getUTCFullYear();
  const ersterDonnerstag = isoDonnerstag(new Date(jahr, 0, 4));
  const nummer = 1 + Math.round((donnerstag.getTime() - ersterDonnerstag.getTime()) / WOCHE_MS);
  return `${jahr}-${String(nummer).padStart(2, '0')}`;
}

function kachelCacheName(art, datum) {
  return (art === 'osm' ? KACHEL_PRAEFIX_OSM : KACHEL_PRAEFIX) + isoWoche(datum);
}

function vorigeWoche(datum) {
  return new Date(datum.getTime() - WOCHE_MS);
}

// Die vier Namen, die zu einem Zeitpunkt gültig sind (NavLog/OSM × Woche).
function gueltigeKachelCaches(jetzt) {
  const vorher = vorigeWoche(jetzt);
  return [
    kachelCacheName('navlog', jetzt),
    kachelCacheName('navlog', vorher),
    kachelCacheName('osm', jetzt),
    kachelCacheName('osm', vorher)
  ];
}

function istKachelCache(name) {
  return name.startsWith(KACHEL_PRAEFIX);
}

// Welche Anfrage ist eine Kachel? Nur GetMap von NavLog und OSM-Kacheln.
// GetFeatureInfo/GetCapabilities/GetLegendGraphic sind Sachdaten und dürfen
// nicht altern; Adresssuche und Wetter bleiben ebenfalls ungecacht.
function kachelArt(url) {
  if (url.hostname === 'gdw.navlog.de') {
    let getMap = false;
    url.searchParams.forEach((wert, name) => {
      if (name.toLowerCase() === 'request' && String(wert).toLowerCase() === 'getmap') getMap = true;
    });
    return getMap ? 'navlog' : null;
  }
  if (url.hostname === 'tile.openstreetmap.org' || url.hostname.endsWith('.tile.openstreetmap.org')) return 'osm';
  return null;
}

// Der Wiederholungsmechanismus in app.js hängt „&nlretry=N" an die Kachel-URL.
// Für den Cache ist das dieselbe Kachel, deshalb fliegt der Parameter raus.
function kachelSchluessel(adresse) {
  return String(adresse)
    .replace(/([?&])nlretry=[^&]*&/i, '$1')
    .replace(/[?&]nlretry=[^&]*$/i, '');
}

let kachelAblagen = 0;
let kachelAufraeumen = null;

// Laufende Zähler für die Statistikzeile in der App (⋮-Menü): Wie viele
// Kacheln kamen aus dem Speicher, wie viele aus dem Netz, wie oft schlug das
// Ablegen fehl? Gebündelt gemeldet, damit nicht jede Kachel eine Nachricht
// auslöst.
const kachelStatistik = { treffer: 0, netz: 0, ablageFehler: 0 };
let kachelStatistikTimer = null;

function kachelStatistikMelden() {
  if (kachelStatistikTimer || typeof setTimeout !== 'function') return;
  kachelStatistikTimer = setTimeout(() => {
    kachelStatistikTimer = null;
    try {
      self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
        for (const client of clients) client.postMessage({ typ: 'kachelStatistik', ...kachelStatistik });
      }).catch(() => {});
    } catch (fehler) { /* Statistik ist Komfort, nie Pflicht. */ }
  }, 800);
}

// activate läuft nur bei einem Service-Worker-Update. Damit abgelaufene
// Wochen-Caches auch ohne App-Update verschwinden, wird einmal je
// Worker-Laufzeit beim ersten Kachelzugriff aufgeräumt.
function kachelCachesAufraeumen(jetzt) {
  if (!kachelAufraeumen) {
    const gueltig = gueltigeKachelCaches(jetzt);
    kachelAufraeumen = caches.keys()
      .then(namen => Promise.all(namen
        .filter(name => istKachelCache(name) && gueltig.indexOf(name) === -1)
        .map(name => caches.delete(name))))
      .catch(() => {});
  }
  return kachelAufraeumen;
}

async function kachelTreffer(name, schluessel) {
  try {
    if (!(await caches.has(name))) return undefined;
    const cache = await caches.open(name);
    return await cache.match(schluessel);
  } catch (fehler) {
    return undefined;
  }
}

// Größendeckel je Wochen-Cache: Bei Überschreitung fallen die ältesten
// Einträge weg (cache.keys() liefert sie in Ablagereihenfolge).
async function kachelDeckelPruefen(cache, art) {
  const grenze = art === 'osm' ? KACHEL_MAX_OSM : KACHEL_MAX_NAVLOG;
  const eintraege = await cache.keys();
  if (eintraege.length <= grenze) return;
  const menge = Math.max(KACHEL_AUFRAEUM_MENGE, eintraege.length - grenze);
  await Promise.all(eintraege.slice(0, menge).map(eintrag => cache.delete(eintrag)));
}

// Cache-first: Ein Treffer geht sofort raus, sonst holt das Netz nach und die
// Antwort wandert in die laufende Woche.
async function kachelAntwort(request, art) {
  const jetzt = new Date();
  const schluessel = kachelSchluessel(request.url);
  const aktuell = kachelCacheName(art, jetzt);
  const vorher = kachelCacheName(art, vorigeWoche(jetzt));
  const cache = await caches.open(aktuell);
  await kachelCachesAufraeumen(jetzt);

  const treffer = (await cache.match(schluessel)) || (await kachelTreffer(vorher, schluessel));
  if (treffer) {
    kachelStatistik.treffer++;
    kachelStatistikMelden();
    return treffer;
  }

  try {
    const antwort = await fetch(request);
    kachelStatistik.netz++;
    // Fremde Kacheln kommen oft als opake Antwort (no-cors) zurück: type
    // 'opaque' mit status 0 – die ist brauchbar und wird mitgenommen.
    if (antwort && (antwort.ok || antwort.type === 'opaque')) {
      try {
        await cache.put(schluessel, antwort.clone());
        kachelAblagen++;
        if (kachelAblagen % KACHEL_PRUEF_INTERVALL === 0) await kachelDeckelPruefen(cache, art);
      } catch (fehler) {
        // Speicherplatz voll o. Ä.: Die Kachel wird trotzdem angezeigt.
        kachelStatistik.ablageFehler++;
      }
    }
    kachelStatistikMelden();
    return antwort;
  } catch (fehler) {
    const notfall = (await kachelTreffer(aktuell, schluessel)) || (await kachelTreffer(vorher, schluessel));
    if (notfall) return notfall;
    throw fehler;
  }
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  // Die Kachel-Caches der laufenden und der vorigen Woche überleben ein
  // App-Update; alles andere Fremde (alte Shell, abgelaufene Wochen) fliegt.
  const behalten = [CACHE_NAME].concat(gueltigeKachelCaches(new Date()));
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => behalten.indexOf(key) === -1).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  const art = kachelArt(url);
  if (art && event.request.method === 'GET') {
    event.respondWith(kachelAntwort(event.request, art));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) return response;
      return caches.match('./index.html?v=20260809-41').then(cached => cached || caches.match('./offline.html'));
    }).catch(() => caches.match('./index.html?v=20260809-41').then(cached => cached || caches.match('./offline.html'))));
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
