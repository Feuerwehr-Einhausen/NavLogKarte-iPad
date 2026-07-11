# NavLog-Karte für iPad

Eigenständige, installierbare Progressive Web App für die Feuerwehr Einhausen. Dieses Projekt ist vollständig vom Desktopprojekt `NavLogKarte` getrennt.

**App öffnen:** https://feuerwehr-einhausen.github.io/NavLogKarte-iPad/

## Eigenschaften

- Installation über Safari auf dem iPad-Home-Bildschirm
- direkter NavLog-WMS-Zugriff ohne eigenen Proxy
- NavLog-Kunden-ID ausschließlich im lokalen Safari-Speicher des jeweiligen iPads
- Layer, exklusive Hintergrundkarten und gespeicherte Startansicht
- GPS- und MGRS/UTMREF-Anzeige und -Suche
- Adresssuche, Symbolinformationen und QR-Navigation
- lokale App-Ressourcen mit Service Worker; Kartendaten benötigen weiterhin Internet
- Touchziele von mindestens 44 bis 48 Pixeln und Unterstützung der iPad-Safe-Areas

## Installation

Die vollständige Anleitung steht in [INSTALLATION-IPAD.md](INSTALLATION-IPAD.md).

## Lokaler Test auf dem Mac

```sh
cd wwwroot
python3 -m http.server 8080
```

Danach `http://localhost:8080` im Browser öffnen. Service Worker und Home-Bildschirm-Installation funktionieren im produktiven Betrieb über HTTPS.

## Datenschutz und Zugang

Die `kid` wird nicht in Dateien, GitHub oder den Service Worker geschrieben. Sie liegt nach der Eingabe nur im lokalen Webspeicher des iPads. Beim Löschen der Safari-Websitedaten muss sie erneut eingegeben werden.

## Drittanbieter

- Leaflet 1.9.4
- mgrs 2.1.0
- QRCode.js 1.0.0
- OpenStreetMap/Nominatim für Hintergrundkarte und Adresssuche
