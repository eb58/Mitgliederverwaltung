# Tischtennis-Doppelturniere

Der Sidebar-Bereich **Turniere** nutzt Anmeldung, Mitgliederliste, Gestaltung und PHP-/MySQL-API der Mitgliederverwaltung.

## Bedienung

1. Turniername und Modus auswählen. Standard ist **Jeder gegen jeden**.
2. Feste Doppelpaare zusammenstellen: je zwei Mitglieder auswählen oder Gastnamen eingeben. Acht Paare sind vorbereitet; für sieben Paaren „Letztes Paar entfernen“ wählen. Möglich sind 5 bis 32 Paare.
3. Turnier anlegen. Paarzusammensetzung und Modus sind danach fest.
4. Ergebnisse satzweise erfassen. Nicht benötigte vierte und fünfte Sätze leer lassen.
5. Vorhandene Turniere über die Turnierauswahl öffnen. „Neu laden“ holt den aktuellen gespeicherten Stand.

**Temporärer Testzustand – nicht mergen:** Unter den Doppelpaaren erscheint **Beispielturnier anlegen (Testhilfe)** derzeit auch im normalen Build (`npm run build` beziehungsweise `npm run watch`), damit an der gewohnten lokalen Docker-/Webserver-Adresse getestet werden kann. Die Testhilfe füllt acht Paare mit 16 erfundenen Gastnamen und wählt „Jeder gegen jeden“. Sie speichert noch nichts; dafür anschließend **Turnier anlegen** wählen. Vereinsmitgliedschaft ist für Teilnehmer nicht erforderlich. Nach Erichs Test muss die Testhilfe wieder aus dem normalen Build entfernt und auf den Entwicklungsbetrieb begrenzt werden, bevor der Pull Request gemergt werden darf.

## Regeln

- **Drei Gewinnsätze**, maximal fünf Sätze; ein Satz endet bei 11 Punkten mit mindestens zwei Punkten Vorsprung, bei Verlängerung genau zwei Punkten Vorsprung. Unentschieden sind ausgeschlossen.
- **Jeder gegen jeden:** Jedes Paar spielt einmal gegen jedes andere Paar. Sieben Paare ergeben 21 Spiele in sieben Runden mit je einem pausierenden Paar. Acht Paare ergeben 28 Spiele in sieben Runden ohne Pausen.
- **Tabelle:** Siege, dann Satzdifferenz, dann direkter Vergleich unter den danach gleichstehenden Paaren. Der direkte Vergleich wird erst berücksichtigt, wenn alle Begegnungen dieser Gruppe abgeschlossen sind. Weiterhin gleiche Werte teilen einen Rang; Namen ordnen nur die Anzeige.
- **K.-o.:** Nur Sieger kommen weiter. Nötige Freilose gehen an die ersten Paare in der eingegebenen Reihenfolge. Eine Zufallsauslosung gehört noch nicht zu dieser Version.
- **Ergebniskorrekturen:** Tabelle und Weiterkommen werden aktualisiert. Ändert sich ein K.-o.-Sieger oder wird dessen Ergebnis gelöscht, werden betroffene Folgeergebnisse zurückgesetzt; andere Begegnungen bleiben bestehen.

Die Tischanzahl darf offen bleiben und später gespeichert werden. Mit bekannter Anzahl zeigt jede Runde Tische und Durchgänge. Die nächste Runde beginnt nach Abschluss der vorherigen. Tischbezeichnungen dienen der organisatorischen Zuordnung; es gibt keine Uhrzeiten, Live-Tischbelegung oder automatische Spielaufrufe.

Ein Mitglied darf nur in einem Paar teilnehmen. Gleichnamige Gäste müssen unterscheidbar benannt werden. Die Mitgliedsnamen werden beim Anlegen aus der Datenbank übernommen und als Momentaufnahme im Turnier gespeichert. Spätere Änderungen an Mitgliederdaten verändern bestehende Turniere nicht.

## Installation

Das normale Frontend-Build und Deployment verwenden. Das Deployment-Skript liefert `server/turnier.php` mit aus. Beim ersten API-Zugriff wird die Tabelle `turnier` automatisch angelegt. Ohne CREATE-Berechtigung vorher `server/db/turnier.mysql.sql` einspielen. Das vollständige Schema enthält ebenfalls die Tabelle.

Alle angemeldeten Benutzer mit abgeschlossenem Passwortwechsel können Turniere bearbeiten, analog zur Eventverwaltung. Die API schützt Änderungen mit einer Versionsprüfung. Bei gleichzeitiger Bearbeitung wird eine veraltete Änderung abgewiesen; dann „Neu laden“ wählen.

## API

- `GET /api/turniere`: gespeicherte Turniere mit Paaren, Runden und Versionsnummer.
- `POST /api/turniere`: `{titel, modus, sport: "tischtennis-doppel", teilnehmer: [{spieler: [{name, mitgliedId}, {name, mitgliedId}]}], anzahlTische: null}`. Modus: `jeder-gegen-jeden` oder `ko`; Mitgliedsnummer optional/null.
- `PUT /api/turniere/{id}/ergebnisse/{spielId}`: `{version, saetze: [{a: 11, b: 8}, ...]}`. Leere Satzliste setzt ein Ergebnis zurück.
- `PUT /api/turniere/{id}/tische`: `{version, anzahlTische}`. Tischanzahl null oder 1 bis 32.

Spielpläne, Satzvalidierung und Weiterkommen berechnet die API. Generische Turniere ohne Sportkennung bleiben auf API-Ebene lesbar und bearbeitbar.
