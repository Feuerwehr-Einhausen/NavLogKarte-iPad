# Installation der NavLog-Karte auf dem iPad

## Bereitstellung über GitHub Pages

GitHub Pages liefert die PWA per HTTPS aus. Das ist für die Installation, den Service Worker und die GPS-Freigabe erforderlich. Der NavLog-Schlüssel wird dabei **nicht** auf GitHub gespeichert.

### 1. App öffnen

Die iPad-App ist bereits unter folgender HTTPS-Adresse veröffentlicht:

```text
https://feuerwehr-einhausen.github.io/NavLogKarte-iPad/
```

Das Repository enthält keinen Zugangsschlüssel. Erst nach der Eingabe auf einem eingerichteten iPad ist die Kunden-ID lokal auf diesem Gerät vorhanden.

## 2. App auf dem iPad installieren

1. Die GitHub-Pages-Adresse ausdrücklich in **Safari** öffnen.
2. Beim ersten Öffnen den Wert hinter `kid=` aus dem NavLog-Link eingeben – nicht die vollständige URL.
3. Prüfen, ob Karte und NavLog-Layer erscheinen.
4. In Safari auf **Teilen** tippen (Quadrat mit Pfeil nach oben).
5. In der Liste **Zum Home-Bildschirm** auswählen.
6. Als Namen beispielsweise `NavLog Karte` verwenden und **Hinzufügen** wählen.
7. Safari schließen und die App über das neue Feuerwehr-Symbol auf dem Home-Bildschirm starten.

## 3. Ersteinrichtung

1. Unter **Layer** die gewünschte Hintergrundkarte auswählen. Es kann immer nur eine Hintergrundkarte aktiv sein.
2. Die benötigten Einsatz-, POI- und Symbol-Layer aktivieren.
3. Die Karte auf Einhausen beziehungsweise das gewünschte Einsatzgebiet einstellen.
4. Unter **Startansicht bearbeiten** auf **Aktuelle Ansicht speichern** tippen.
5. Beim ersten Tippen auf **Standort** den Standortzugriff erlauben.

## Updates installieren

Neue Versionen werden nach einem Push auf `main` automatisch veröffentlicht. Die installierte App aktualisiert ihre App-Dateien beim nächsten Online-Start. Falls eine Änderung nicht sofort erscheint:

1. App vollständig schließen.
2. Die GitHub-Pages-Adresse einmal in Safari öffnen und neu laden.
3. App erneut vom Home-Bildschirm starten.

## Zugang ändern oder iPad weitergeben

Unter **Layer → Startansicht bearbeiten → NavLog-Zugang ändern** kann die lokal gespeicherte Kunden-ID gelöscht werden. Vor der Weitergabe des iPads außerdem die Web-App entfernen und bei Bedarf unter **Einstellungen → Safari → Erweitert → Websitedaten** die Daten der GitHub-Pages-Adresse löschen.

## Einschränkungen

- NavLog, Adresssuche und Hintergrundkarten benötigen Internet.
- Die App-Shell startet auch ohne Verbindung, zeigt dann aber keine aktuellen Karten.
- Wenn Safari-Verlauf und Websitedaten gelöscht werden, müssen Zugang und Startansicht erneut eingerichtet werden.
- Der direkte Browserzugriff wurde gegen den NavLog-WMS getestet; der Dienst erlaubt CORS-Anfragen.
