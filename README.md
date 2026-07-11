# NavLog-Karte für iPad

Installierbare Progressive Web App zur mobilen Darstellung eines zugangsgeschützten NavLog-WMS. Die Anwendung richtet sich insbesondere an Einsatzorganisationen, die Karten, Objektinformationen und Koordinaten auf einem iPad verwenden möchten, ohne eine native App aus dem App Store zu verteilen.

Die Oberfläche kann für eine Organisation mit eigenem Namen, Logo, Startgebiet und einer passenden Layerauswahl eingerichtet werden. Diese Auslieferung ist für die Feuerwehr Einhausen konfiguriert.

## Funktionen

- Installation über Safari auf dem iPad-Home-Bildschirm
- direkte Darstellung der vom NavLog-WMS angebotenen Layer
- getrennte Behandlung von Hintergrundkarten, Punkten und Wegen
- GPS- sowie MGRS/UTMREF-Anzeige und -Suche
- Adresssuche über OpenStreetMap/Nominatim
- abrufbare Symbol- und Objektinformationen
- QR-Code zur Übergabe eines Ziels an eine Navigations-App
- speicherbare Startansicht und Layerauswahl
- Druckansicht mit Legende
- touchgerechte Bedienung und Unterstützung der iPad-Safe-Areas
- lokal zwischengespeicherte App-Oberfläche für den Start ohne erreichbaren Webserver

## Sicherheitsmodell

Das Repository und die veröffentlichte Anwendung enthalten **keine NavLog-Kunden-ID**.

Die Kunden-ID wird bei der Ersteinrichtung auf dem jeweiligen iPad eingegeben und ausschließlich im lokalen Webspeicher von Safari abgelegt. Sie wird weder in GitHub noch im Service Worker oder in einer Konfigurationsdatei gespeichert. Beim Löschen der Websitedaten muss sie erneut eingegeben werden.

Da die Anwendung vollständig im Browser läuft, sind ihre ausgelieferten HTML-, CSS- und JavaScript-Dateien während einer öffentlichen Bereitstellung grundsätzlich einsehbar. Zugangsdaten gehören deshalb niemals in den Quellcode.

## Betrieb und Installation

Für Installation, Service Worker und Standortfreigabe wird HTTPS benötigt. Dieses Repository enthält einen GitHub-Pages-Workflow. Es kann für Installation und Updates kurz öffentlich bereitgestellt und danach wieder privat geschaltet werden. Bereits installierte iPads starten die Oberfläche anschließend aus ihrem lokalen PWA-Cache.

Die vollständige Anleitung steht in [INSTALLATION-IPAD.md](INSTALLATION-IPAD.md).

Aktuelle Installationsadresse während eines geöffneten Installationsfensters:

https://feuerwehr-einhausen.github.io/NavLogKarte-iPad/

## Einschränkungen

- NavLog-WMS, Adresssuche und Kartenkacheln benötigen eine Internetverbindung.
- Updates, Neuinstallationen und zusätzliche iPads benötigen eine erneut erreichbare HTTPS-Bereitstellung.
- iPadOS kann lokale Website- und App-Daten entfernen. Eine installierte PWA ersetzt daher keine zentral administrierte Offline-Kartenlösung.
- Die Anwendung besitzt keinen eigenen WMS-Proxy; der verwendete WMS muss Browseranfragen per CORS erlauben.

## Lokaler Test

```sh
cd wwwroot
python3 -m http.server 8080
```

Danach `http://localhost:8080` im Browser öffnen. Die produktive Installation auf einem iPad erfolgt über HTTPS.

## Drittanbieter

- Leaflet 1.9.4 – BSD-2-Clause
- mgrs 2.1.0 – MIT
- QRCode.js 1.0.0 – MIT
- OpenStreetMap/Nominatim – externe Karten- und Suchdienste mit eigenen Nutzungsbedingungen

## Lizenz

Der selbst entwickelte Anwendungscode steht unter einer proprietären Lizenz; siehe [LICENSE](LICENSE). Eine öffentliche Lesbarkeit des Repositories erteilt keine Erlaubnis zur Übernahme, Veränderung oder Weiterverteilung. Eingebundene Drittanbieter-Komponenten bleiben unter ihren jeweiligen Lizenzen.
