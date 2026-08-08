/**
 * Erzeugt die Datenbasis für den Overlay-Layer "Straßenbezeichnungen".
 *
 * Zweck: Auf der NavLog-DTK25 sind Straßennummern (z. B. L 3261, L 3345) grün wie
 * Schneisennamen beschriftet und dadurch im Einsatz schlecht erkennbar. Dieses Skript
 * holt die Straßengeometrien mit ref-/name-Tag aus OpenStreetMap (Overpass-API) und
 * schreibt sie als schlanke GeoJSON-Datei, aus der die App später Nummernschilder und
 * Straßennamen über die Karte legen kann.
 *
 * Aufruf: node scripts/generate-strassen.mjs
 *
 * Die Ausgabedatei wwwroot/data/strassen.geojson wird eingecheckt, damit die PWA auch
 * offline funktioniert. Bei Bedarf (neue Straßen, größerer Ausschnitt) einfach das
 * Skript erneut laufen lassen — es überschreibt nur diese eine Datei.
 *
 * Benötigt Node >= 18 (globales fetch), keine npm-Abhängigkeiten.
 * Datenquelle: OpenStreetMap-Mitwirkende, ODbL 1.0.
 */

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Konfiguration -------------------------------------------------------------------

// Einsatzgebiet der Feuerwehr Einhausen: Zentrum Gemeinde Einhausen, Kante großzügig
// gewählt, damit Wald und Nachbargemeinden (Lorsch, Bensheim, Zwingenberg, Groß-Rohrheim,
// Biblis, Bürstadt) mit abgedeckt sind.
const ZENTRUM_LAT = 49.696849;
const ZENTRUM_LON = 8.531227;
const KANTENLAENGE_KM = 12;

// Straßenklassen, die beschriftet werden sollen (highway-Werte in OSM).
const KLASSEN = [
  'motorway', 'motorway_link',
  'trunk', 'trunk_link',
  'primary', 'secondary', 'tertiary',
  'unclassified', 'residential', 'living_street', 'pedestrian'
];

// Overpass-Endpunkte: erst der offizielle, dann der Spiegel als Fallback.
const OVERPASS_ENDPUNKTE = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

const USER_AGENT = 'NavLogKarte-iPad/1.0 (Feuerwehr Einhausen; https://github.com/SpaceMaster/NavLogKarte-iPad)';

const NACHKOMMASTELLEN = 5;      // ca. 1 m Auflösung — mehr braucht eine Beschriftung nicht
const VEREINFACHUNG_METER = 5;   // Douglas-Peucker-Toleranz für die Stützpunkte

const AUSGABE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'wwwroot', 'data', 'strassen.geojson');

// --- Bounding Box --------------------------------------------------------------------

const GRAD_PRO_KM_LAT = 1 / 110.574;
const halbeKante = KANTENLAENGE_KM / 2;
const dLat = halbeKante * GRAD_PRO_KM_LAT;
const dLon = halbeKante / (111.320 * Math.cos(ZENTRUM_LAT * Math.PI / 180));

const BBOX = {
  sued: runde(ZENTRUM_LAT - dLat, 4),
  west: runde(ZENTRUM_LON - dLon, 4),
  nord: runde(ZENTRUM_LAT + dLat, 4),
  ost: runde(ZENTRUM_LON + dLon, 4)
};

// --- Hilfsfunktionen -----------------------------------------------------------------

function runde(wert, stellen) {
  const faktor = 10 ** stellen;
  return Math.round(wert * faktor) / faktor;
}

/** Abstand eines Punktes von der Strecke a–b in Metern (äquidistante Näherung). */
function abstandZurStrecke(punkt, a, b) {
  const mLat = 111320;
  const mLon = 111320 * Math.cos(ZENTRUM_LAT * Math.PI / 180);
  const px = (punkt.lon - a.lon) * mLon;
  const py = (punkt.lat - a.lat) * mLat;
  const bx = (b.lon - a.lon) * mLon;
  const by = (b.lat - a.lat) * mLat;
  const laenge2 = bx * bx + by * by;
  if (laenge2 === 0) return Math.hypot(px, py);
  let t = (px * bx + py * by) / laenge2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - t * bx, py - t * by);
}

/** Douglas-Peucker: dünnt Stützpunkte aus, ohne den Linienverlauf sichtbar zu verändern. */
function vereinfache(punkte, toleranz) {
  if (punkte.length < 3) return punkte;
  let maxAbstand = 0;
  let index = 0;
  for (let i = 1; i < punkte.length - 1; i += 1) {
    const abstand = abstandZurStrecke(punkte[i], punkte[0], punkte[punkte.length - 1]);
    if (abstand > maxAbstand) {
      maxAbstand = abstand;
      index = i;
    }
  }
  if (maxAbstand <= toleranz) return [punkte[0], punkte[punkte.length - 1]];
  const links = vereinfache(punkte.slice(0, index + 1), toleranz);
  const rechts = vereinfache(punkte.slice(index), toleranz);
  return links.slice(0, -1).concat(rechts);
}

function baueAbfrage() {
  const klassen = KLASSEN.join('|');
  const box = `${BBOX.sued},${BBOX.west},${BBOX.nord},${BBOX.ost}`;
  return [
    '[out:json][timeout:180];',
    '(',
    `  way["highway"~"^(${klassen})$"]["ref"](${box});`,
    `  way["highway"~"^(${klassen})$"]["name"](${box});`,
    ');',
    'out geom;'
  ].join('\n');
}

async function frageOverpass(abfrage) {
  let letzterFehler = null;
  for (const endpunkt of OVERPASS_ENDPUNKTE) {
    try {
      process.stdout.write(`Frage Overpass ab: ${endpunkt} ...\n`);
      const antwort = await fetch(endpunkt, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          Accept: 'application/json'
        },
        body: new URLSearchParams({ data: abfrage })
      });
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status} ${antwort.statusText}`);
      const daten = await antwort.json();
      if (!daten || !Array.isArray(daten.elements)) throw new Error('Unerwartete Antwortstruktur');
      return daten;
    } catch (fehler) {
      letzterFehler = fehler;
      process.stdout.write(`  fehlgeschlagen: ${fehler.message}\n`);
    }
  }
  throw new Error(`Keine Overpass-Instanz erreichbar: ${letzterFehler?.message ?? 'unbekannt'}`);
}

function baueFeature(element) {
  const tags = element.tags || {};
  const geometrie = Array.isArray(element.geometry) ? element.geometry.filter(Boolean) : [];
  if (geometrie.length < 2) return null;

  const vereinfacht = vereinfache(geometrie, VEREINFACHUNG_METER);
  const koordinaten = [];
  for (const punkt of vereinfacht) {
    const lon = runde(punkt.lon, NACHKOMMASTELLEN);
    const lat = runde(punkt.lat, NACHKOMMASTELLEN);
    const letzte = koordinaten[koordinaten.length - 1];
    if (letzte && letzte[0] === lon && letzte[1] === lat) continue;
    koordinaten.push([lon, lat]);
  }
  if (koordinaten.length < 2) return null;

  const properties = {};
  if (tags.ref) properties.ref = tags.ref;
  if (tags.name) properties.name = tags.name;
  properties.klasse = tags.highway;

  return { type: 'Feature', properties, geometry: { type: 'LineString', coordinates: koordinaten } };
}

// --- Hauptlauf -----------------------------------------------------------------------

async function main() {
  process.stdout.write(`Ausschnitt: ${BBOX.sued} / ${BBOX.west} bis ${BBOX.nord} / ${BBOX.ost} (${KANTENLAENGE_KM} km Kante)\n`);

  const daten = await frageOverpass(baueAbfrage());
  const wege = daten.elements.filter((element) => element.type === 'way');

  const features = [];
  for (const weg of wege) {
    const feature = baueFeature(weg);
    if (feature) features.push(feature);
  }

  const sammlung = { type: 'FeatureCollection', features };
  await mkdir(dirname(AUSGABE), { recursive: true });
  await writeFile(AUSGABE, JSON.stringify(sammlung), 'utf8');

  // --- Statistik ---
  const mitRef = features.filter((feature) => feature.properties.ref).length;
  const mitName = features.filter((feature) => feature.properties.name).length;
  const punkte = features.reduce((summe, feature) => summe + feature.geometry.coordinates.length, 0);
  const klassen = new Map();
  for (const feature of features) {
    klassen.set(feature.properties.klasse, (klassen.get(feature.properties.klasse) || 0) + 1);
  }
  const refs = new Set(features.map((feature) => feature.properties.ref).filter(Boolean));
  const groesse = (await stat(AUSGABE)).size;

  process.stdout.write(`\nGeschrieben: ${AUSGABE}\n`);
  process.stdout.write(`Features gesamt: ${features.length}\n`);
  process.stdout.write(`  davon mit ref:  ${mitRef} (${refs.size} verschiedene Nummern)\n`);
  process.stdout.write(`  davon mit name: ${mitName}\n`);
  process.stdout.write(`Stützpunkte:     ${punkte}\n`);
  process.stdout.write(`Dateigröße:      ${(groesse / 1024).toFixed(1)} KiB\n`);
  process.stdout.write('Klassen:\n');
  for (const [klasse, anzahl] of [...klassen.entries()].sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`  ${klasse.padEnd(14)} ${anzahl}\n`);
  }
  process.stdout.write(`Straßennummern: ${[...refs].sort().join(', ')}\n`);
}

main().catch((fehler) => {
  process.stderr.write(`Fehler: ${fehler.message}\n`);
  process.exitCode = 1;
});
