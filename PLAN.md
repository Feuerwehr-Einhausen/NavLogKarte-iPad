# Arbeitsplan NavLog-Karte (Stand 09.08.2026)

Interner Arbeitsstand für die Weiterentwicklung. Veröffentlicht ist **v1.5.0**
(live auf GitHub Pages). Dieses Dokument wird fortgeschrieben und mit
committet.

## Erledigt (v1.3.0, veröffentlicht)

- **Eigener Layer „Waldbrand POI FFEH"**: versionierter Bestand in
  `wwwroot/data/waldbrand-poi-ffeh.geojson` (aktuell leer, wird nach der
  Erkundung befüllt), lokale Entwürfe als localStorage-Overlay, Export/Import
  zur Zusammenführung mehrerer iPads (im ⋮-Menü des Layer-Panels).
- **Erkundungsmodus**: „Punkt bewerten" aus NavLog-Symbolinfo (mit Vorbefüllung
  von Quelle/Name/Beschreibung), aus beliebiger Kartenstelle oder per GPS.
  NavLog-Punkte als transparenter Statusring (zoomabhängige Größe), eigene
  Punkte mit Kategoriesymbol. Fortschrittsanzeige und Filter „Nur offene".
- **Layer „Straßenbezeichnungen"**: Wegweiser-Schilder aus OSM-Daten
  (`wwwroot/data/strassen.geojson`, Neugenerierung über
  `node scripts/generate-strassen.mjs`).
- **Legenden-Overlay** auf der Karte (Knopf unten links), **⋮-Verwaltungsmenü**
  im Layer-Panel, Trefftoleranz bei der Symbolabfrage, Desktop-Zeigefinger,
  „Mit LF anfahrbar", Klartext-Kategorien.

## Erledigt (v1.4.0, veröffentlicht)

- **F4 – Layersets**: benannte Layerauswahlen (NavLog-Layer + OSM + FFEH +
  Straßen) als Chips unter „Alles aus / Startansicht", Speichern über das
  ⋮-Menü, Löschen über den Stift-Knopf; höchstens 12 Sets, Speicherung als
  `layerPresets` im vorhandenen settings-Eintrag, Startansicht bleibt separat.
  Anwenden schaltet nur die Differenz (kein Flackern der Hintergrundkarte).
- **NavLog-Lastproblem entschärft**: Der Dienst weist unter Anfrageschwall
  (Seitenstart, Layerwechsel, mehrere Geräte auf einer Kunden-ID) die teuren
  Hintergrund-Kacheln reihenweise ab → Karte blieb grau. Gemessen am
  09.08.2026: DTK0025 48 Kacheln angefragt, 0 geladen, 144 Ablehnungen;
  DTK0050 28/0/140 — Overlays liefen parallel fehlerfrei. Lösung in app.js:
  gemeinsame **Warteschlange** (max. 6 parallele NavLog-Anfragen,
  `NavlogWmsLayer`), **Wiederholungs-Staffel** 1,5/3/6/12 s bei Kachelfehlern,
  **Ladefortschritt in der Statuszeile** („X von Y Kacheln geladen").
- Smartphone: Zoom/Maßstab lagen über den Werkzeug-Sheets
  (`.leaflet-top/.leaflet-bottom` auf z-index 700 gesetzt).

## Erledigt (v1.5.0, veröffentlicht)

- **F11 – Zeichen- und Messlayer schaltbar**: Taktische Zeichen und
  „Messungen & Absperrungen" waren bisher immer sichtbar. Sie haben jetzt im
  Panel-Abschnitt „Eigene Layer" je einen Schalter (`#signsToggle`,
  `#measureToggle`, Voreinstellung an) und verhalten sich wie der FFEH-Layer:
  Aus nimmt nur die Leaflet-Gruppe von der Karte, die Einträge bleiben
  unangetastet im localStorage. Persistenz als `showSignsLayer` /
  `showMeasureLayer` im settings-Eintrag (Startansicht stellt sie wieder her).
  Werkzeug-Kopplung in beide Richtungen: Öffnen des Zeichen- bzw.
  Messwerkzeugs blendet die zugehörige Ebene selbst ein („man kann nicht
  bearbeiten, was man nicht sieht"), Ausblenden bei offenem Werkzeug schließt
  es vorher sauber (laufende Messung wird dabei gesichert). Layersets merken
  beide Ebenen als `zeichen`/`messungen` mit; ältere Sets ohne diese Felder
  gelten unverändert als eingeschaltet. Ausgeblendete Ebenen erscheinen nicht
  im Druck.

## Offen

### 1. NavLog-Befund melden
Die Messwerte oben eignen sich für eine Meldung an NavLog (Limit
gleichzeitiger Renderings pro Kunden-ID betrifft jeden WMS-Client, besonders
mehrere iPads im Einsatz). Falls NavLog ein dokumentiertes Limit nennt,
`NAVLOG_MAX_PARALLEL` in app.js exakt darauf einstellen.

### 1a. Wissensstand Vollbild auf iOS (gelöst 09.08.2026, v1.4.8)
Ursache des unteren Randstreifens war `apple-mobile-web-app-status-bar-style:
black-translucent`: Auf aktuellem iOS verschiebt dieser Modus die Seite unter
die Statusleiste und legt unten eine deckende Systemfläche über die App
(Fenster 402×812 bei Screen 402×874). Lösung: Stil `default` (wie in der
randlos funktionierenden Referenz-App Fragenkatalog-Trainer) plus App-Hülle
`position:fixed; inset:0`. WICHTIG: iOS brennt den Stil beim Installieren ein
– Änderungen daran wirken erst nach Neuinstallation der Home-Bildschirm-App.
NICHT wieder einführen: black-translucent, 100lvh/100vh für die Hülle
(reicht hinter die Systemfläche und schneidet die Werkzeugleiste ab).

### 2. Praxis-Abnahme am Gerät (nur durch FFEH möglich)
- Kachel-Warteschlange im Alltag beobachten (Karte baut sich stückweise auf;
  Statuszeile zeigt den Fortschritt) — insbesondere mit mehreren iPads
  gleichzeitig.
- Maßstab/Zoom-Reihenfolge am Smartphone gegenprüfen (z-index-Fix).
- **Layersets am Gerät testen**: Chips im Panel (Umbruch bei vielen Sets),
  Speichern/Überschreiben/Löschen, Markierung des aktiven Sets, Umschalten
  während eines Einsatzes am iPad und am Smartphone.
- **Zeichen-/Messlayer am Gerät testen**: Ein-/Ausblenden während eines
  Einsatzes (Daten müssen erhalten bleiben), Öffnen der Werkzeuge bei
  ausgeblendeter Ebene, Verschieben von Zeichen nach dem Wiedereinblenden,
  A3-Druck mit ausgeblendeten Ebenen.
- Klicktoleranz an echten NavLog-Symbolen (auch: keine falschen Nachbarn in
  der Vorbefüllung; ggf. BUFFER/RADIUS/FI_POINT_TOLERANCE in app.js anpassen).
- Wassersymbole Hydrant/Brunnen/Zisterne/Löschteich sind **Eigenzeichnungen**
  (Köritz-Bibliothek enthält keine Löschwasser-Zeichen). Entscheidung: so
  lassen oder DIN-14034-6-Zeichen beschaffen (Lizenz klären).
- iPad/iPhone-Sichtung: Sheets, Ringgrößen je Zoomstufe, GPS im Gelände,
  A3-Druck mit Legende.

### 3. Später / zurückgestellt
- Fotos an Erkundungspunkten (braucht IndexedDB statt localStorage).
- Erkundungsfahrt: vorher Vorerfassung der Rastersymbole am Schreibtisch
  (Status „offen"), danach geprüften Bestand als offizielle
  `waldbrand-poi-ffeh.geojson` ins Repo übernehmen.
- `formatFeatureInfo` nutzt für die Anzeige weiter `layers[index]`-Zuordnung
  (nur der Seed nutzt die robuste Auflösung) – bei Gelegenheit vereinheitlichen.
- Import-Konfliktregel: eingehender Punkt gewinnt gegen lokalen Tombstone;
  falls Löschungen Vorrang haben sollen, Tombstone-Zeit mitvergleichen.

## Arbeitsweise / Technik-Notizen

- Lokaler Test: `cd wwwroot && python3 -m http.server 8080` →
  http://localhost:8080. Service Worker cacht aggressiv: Änderungen erscheinen
  oft erst beim zweiten Laden (oder Cmd+Shift+R).
- Vor Veröffentlichung: `APP_VERSION`/`APP_BUILD` in app.js, `?v=`-Tags in
  index.html **und** sw.js (inkl. Fallbacks), `CACHE_NAME` anheben; neue
  Dateien in `APP_SHELL` eintragen (fehlende Pfade brechen die Installation).
- Push auf `main` veröffentlicht automatisch (GitHub Pages). Schreibrechte hat
  nur das gh-Konto `Feuerwehr-Einhausen` (`gh auth switch`).
- Testharness (jsdom, außerhalb des Repos im Session-Scratchpad):
  `dom.mjs`, `test-f5.mjs` … `test-f11.mjs`, `fuzz.mjs`, `audit.mjs`,
  `run-all.mjs` (führt alles aus) —
  Scratchpad ist sitzungsgebunden und kann verschwinden; bei Bedarf neu
  aufbauen (echtes index.html + Leaflet in jsdom booten).
