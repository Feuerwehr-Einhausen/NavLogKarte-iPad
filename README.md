# NavLog-Karte für iPad

> **Hinweis:** Dies ist **kein offizielles NavLog-Produkt.** Es handelt sich um ein internes Projekt der Feuerwehr Einhausen, das auf den NavLog-Karten aufsetzt.

Installierbare Progressive Web App zur mobilen Darstellung eines zugangsgeschützten NavLog-WMS. Die Anwendung richtet sich insbesondere an Einsatzorganisationen, die Karten, Objektinformationen und Koordinaten auf einem iPad verwenden möchten, ohne eine native App aus dem App Store zu verteilen.

Die Oberfläche kann für eine Organisation mit eigenem Namen, Logo, Startgebiet und einer passenden Layerauswahl eingerichtet werden. Diese Auslieferung ist für die Feuerwehr Einhausen konfiguriert.

## Funktionen

- Installation über Safari auf dem iPad-Home-Bildschirm
- direkte Darstellung der vom NavLog-WMS angebotenen Layer
- getrennte Behandlung von Hintergrundkarten, Punkten und Wegen
- vorkonfigurierte Erstansicht mit DTK0025, Waldbrand-POI, Hydranten und Rettungspunkten
- GPS- sowie MGRS/UTMREF-Anzeige und -Suche
- Adresssuche über OpenStreetMap/Nominatim
- abrufbare Symbol- und Objektinformationen
- QR-Code zur Übergabe eines Ziels an eine Navigations-App
- Messwerkzeuge: Strecken (mit B-Schlauch-Umrechnung), Flächen und Absperrkreise mit Radien-Vorwahl nach FwDV 500; Messungen bleiben lokal gespeichert
- taktische Zeichen für Waldbrandeinsätze (Lage inkl. Ankerpunkt und Lookout, Führung, Kräfte, Wasser) mit Beschriftung, drehbarem Ausbreitungspfeil samt Richtungsvorschau und nachträglicher Bearbeitung; getrennt von den Messwerkzeugen
- Wind- und Wetteranzeige für die Kartenmitte mit Windpfeil auf der Karte, 12-Stunden-Windvorhersage und Hinweis auf angekündigte Winddrehungen (Open-Meteo, ohne API-Schlüssel)
- Maßstabsleiste
- speicherbare Startansicht und Layerauswahl
- Druckansicht mit Legende (inklusive eingezeichneter Messungen und Absperrbereiche)
- touchgerechte Bedienung und Unterstützung der iPad-Safe-Areas
- lokal zwischengespeicherte App-Oberfläche für den Start ohne erreichbaren Webserver

## Sicherheitsmodell

Das Repository und die veröffentlichte Anwendung enthalten **keine NavLog-Kunden-ID**.

Die Kunden-ID wird bei der Ersteinrichtung auf dem jeweiligen iPad eingegeben und ausschließlich im lokalen Webspeicher von Safari abgelegt. Sie wird weder in GitHub noch im Service Worker oder in einer Konfigurationsdatei gespeichert. Beim Löschen der Websitedaten muss sie erneut eingegeben werden.

Da die Anwendung vollständig im Browser läuft, sind ihre ausgelieferten HTML-, CSS- und JavaScript-Dateien während einer öffentlichen Bereitstellung grundsätzlich einsehbar. Zugangsdaten gehören deshalb niemals in den Quellcode.

## Betrieb und Installation

Für Installation, Service Worker und Standortfreigabe wird HTTPS benötigt. Dieses Repository enthält einen GitHub-Pages-Workflow, der Änderungen auf `main` automatisch veröffentlicht. Bereits installierte iPads übernehmen neue App-Dateien beim nächsten Online-Start.

Die vollständige Anleitung steht in [INSTALLATION-IPAD.md](INSTALLATION-IPAD.md).

Installationsadresse:

https://feuerwehr-einhausen.github.io/NavLogKarte-iPad/

## Einschränkungen

- NavLog-WMS, Adresssuche, Wetterdaten und Kartenkacheln benötigen eine Internetverbindung.
- Die Wetteranzeige zeigt Modellwerte für die Kartenmitte; bei Verbindungsabriss wird der letzte gespeicherte Stand mit Zeitstempel angezeigt. Die Beobachtung an der Einsatzstelle bleibt maßgeblich.
- Updates, Neuinstallationen und zusätzliche iPads benötigen die erreichbare HTTPS-Bereitstellung.
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
- Open-Meteo – Wetterdaten (CC BY 4.0), Abruf ohne API-Schlüssel direkt vom Browser
- „Taktische Zeichen“ von Jonas Köritz – Symbolgrafiken (CC BY 4.0); Details in [wwwroot/vendor/taktische-zeichen/LIZENZ.md](wwwroot/vendor/taktische-zeichen/LIZENZ.md)

## Lizenz

Der selbst entwickelte Anwendungscode steht unter einer proprietären Lizenz; siehe [LICENSE](LICENSE). Eine öffentliche Lesbarkeit des Repositories erteilt keine Erlaubnis zur Übernahme, Veränderung oder Weiterverteilung. Eingebundene Drittanbieter-Komponenten bleiben unter ihren jeweiligen Lizenzen.
