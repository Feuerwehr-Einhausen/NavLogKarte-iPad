# Installation der NavLog-Karte auf dem iPad

## Installation über ein kurzes öffentliches Zeitfenster

GitHub Pages liefert die PWA per HTTPS aus. Das ist für die Installation, den Service Worker und die GPS-Freigabe erforderlich. Der NavLog-Schlüssel wird dabei **nicht** auf GitHub gespeichert.

Das Repository bleibt normalerweise privat. Für Installation oder Updates wird es nur kurz öffentlich geschaltet. Nach der Installation startet die App aus dem lokalen PWA-Cache weiter. NavLog-WMS, Adresssuche und Kartenkacheln werden weiterhin direkt aus dem Internet geladen.

### Installationsfenster selbst öffnen

1. Bei GitHub das Repository `Feuerwehr-Einhausen/NavLogKarte-iPad` öffnen.
2. **Settings → General** öffnen.
3. Ganz unten unter **Danger Zone → Change repository visibility** auf **Change visibility** klicken.
4. **Make public** wählen und die von GitHub verlangte Bestätigung durchführen.
5. **Settings → Pages** öffnen.
6. Unter **Build and deployment → Source** den Eintrag **GitHub Actions** auswählen. Falls Pages durch die Privatstellung entfernt wurde, wird es dadurch neu aktiviert.
7. Den Reiter **Actions** öffnen und links **iPad-PWA auf GitHub Pages bereitstellen** wählen.
8. Den neuesten Lauf öffnen und über **Re-run jobs → Re-run all jobs** erneut starten. Alternativ löst ein neuer Commit auf `main` die Veröffentlichung aus.
9. Warten, bis der Lauf grün abgeschlossen ist.
10. Die App unter `https://feuerwehr-einhausen.github.io/NavLogKarte-iPad/` öffnen. Bei Cache-Problemen einen beliebigen Parameter ergänzen, zum Beispiel `?install=20260711`.

### Auf allen vorgesehenen iPads installieren

1. Die Adresse in **Safari** öffnen.
2. Nur den Wert hinter `kid=` eingeben.
3. Warten, bis die NavLog-Layer geladen wurden.
4. Über **Teilen → Zum Home-Bildschirm → Hinzufügen** installieren.
5. Die App über das neue Symbol öffnen und Karte, Layer und Suche prüfen.
6. Diesen Vorgang auf allen vorgesehenen iPads wiederholen, solange das Installationsfenster offen ist.

### Installationsfenster wieder schließen

1. Erst schließen, wenn die App auf allen iPads einmal erfolgreich vom Home-Bildschirm gestartet wurde.
2. Im Repository **Settings → General → Danger Zone → Change repository visibility** öffnen.
3. **Make private** wählen und bestätigen.
4. Einige Minuten später die Pages-Adresse in einem privaten Browserfenster prüfen. Sie muss `404 – Site not found` liefern.
5. Die bereits installierte App erneut vom Home-Bildschirm öffnen. Die Oberfläche kommt aus dem lokalen Cache; aktuelle Kartendaten benötigen weiterhin Internet.

### Wichtige Grenzen

- Updates, Neuinstallationen und weitere iPads benötigen ein neues öffentliches Zeitfenster.
- Wenn die App oder die Safari-Websitedaten gelöscht werden, ist eine Neuinstallation nötig.
- iPadOS kann lokalen Webspeicher in Ausnahmefällen entfernen. Dieses Verfahren ist daher weniger ausfallsicher als ein dauerhaft erreichbarer privater Webdienst.
- Der Quellcode ist während des Installationsfensters öffentlich lesbar. Der NavLog-Schlüssel ist zu keiner Zeit im Repository oder in den veröffentlichten Dateien enthalten.

### 1. Bereitgestellte App öffnen

Die iPad-App ist bereits unter folgender HTTPS-Adresse veröffentlicht:

```text
https://feuerwehr-einhausen.github.io/NavLogKarte-iPad/
```

Das Repository enthält keinen Zugangsschlüssel. Die Website kann daher öffentlich ausgeliefert werden, ohne den NavLog-Zugang zu veröffentlichen. Erst auf einem eingerichteten iPad ist die Kunden-ID lokal vorhanden.

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
