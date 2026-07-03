# Mitgliederverwaltung Senioren Lübars

Webbasierte Mitgliederverwaltung für den Seniorenclub Lübars. Die Anwendung bündelt Stammdaten, Gruppenzugehörigkeiten, Beitragszahlungen, Weihnachtsessen, Gäste, ehemalige Mitglieder und Änderungsprotokolle in einer kompakten Oberfläche.

## Überblick

Die Anwendung besteht aus einem statischen Frontend und einer schlanken PHP-API:

- `index.html`, `app.js`, `styles.css`: Browser-Oberfläche
- `public/vendor/`: lokal ausgelieferte Bibliotheken für Bootstrap, AG Grid und Chart.js
- `php-api/`: Backend-Endpunkte für Login, Mitglieder, Passbilder, Stammdaten und Änderungsprotokolle
- `member-api.config.json`: optionale Frontend-Konfiguration für eine abweichende API-Adresse

Das Frontend kann lokal mit Vite entwickelt werden. Im Hosting-Betrieb werden die gebauten oder statischen Dateien zusammen mit der PHP-API ausgeliefert.

## Funktionen

- Dashboard mit Kennzahlen zu Mitgliedern, Zahlungen, Altersstruktur und Interessengruppen
- Mitgliederübersicht mit Suche, Filtern, Spaltenzustand und Bearbeitungsdialog
- getrennte Ansichten für Gäste, ehemalige Mitglieder, Bezahlungsdaten und Weihnachtsessen
- Beitragsverwaltung für Club- und Computerbeitrag
- Computerclub-Erkennung über angekreuzte Interessengruppen mit Computerkurs-Bezug
- Passbild-Upload pro Mitglied
- Stammdatenverwaltung für berechtigte Benutzer
- Benutzerverwaltung und Passwortänderung
- Änderungsprotokoll pro Mitglied und globale Liste der letzten Änderungen

## Voraussetzungen

Für lokale Entwicklung:

- Node.js mit npm

Für den PHP-Betrieb:

- PHP 8.0 oder neuer
- PDO MySQL
- Apache mit `mod_rewrite` oder direkter Betrieb über `php-api/index.php`
- MySQL/MariaDB-Datenbank mit passendem Schema

## Lokale Entwicklung

Abhängigkeiten installieren:

```bash
npm install
```

Entwicklungsserver starten:

```bash
npm.cmd run dev
```

Produktionsbuild erzeugen:

```bash
npm.cmd run build
```

Unter Windows ist `npm.cmd` in PowerShell robuster als `npm`, wenn die PowerShell Execution Policy das Laden von `npm.ps1` blockiert.

## Lokaler Docker-Betrieb

Für die lokale Entwicklung nutzt die Mitgliederverwaltung denselben Apache/PHP-Container wie der Gratulationsdienst. Dieses Repository bringt deshalb keine eigene Docker-Compose-Datei für den Webserver mit.

Der Frontend-Build wird in den gemeinsamen Webroot geschrieben:

```text
C:\Users\erich\Projects\Gratulationsdienst Reinickendorf\docker\src\mitgliederverwaltung
```

Build ausführen:

```bash
npm.cmd run build
```

Die Anwendung ist danach erreichbar unter:

```text
http://localhost/mitgliederverwaltung/
```

Die Datenbankstruktur liegt im Projekt:

```text
db/schema.mysql.sql
```

Eine ausführlichere Schritt-für-Schritt-Anleitung steht in [INSTALLATIONSANLEITUNG.md](INSTALLATIONSANLEITUNG.md).

## API-Konfiguration

Standardmäßig erwartet das Frontend die API relativ zur Anwendung. Wenn die API an einer anderen Adresse liegt oder ohne `mod_rewrite` betrieben wird, kann eine lokale Konfiguration angelegt werden:

```json
{
  "memberApiBaseUrl": "https://deine-domain.example/mitgliederverwaltung/php-api/index.php"
}
```

Als Vorlage liegt `member-api.config.example.json` im Repository.

## Deployment

Für klassisches Webhosting werden diese Dateien und Ordner hochgeladen:

- `index.html`
- `app.js`
- `styles.css`
- `assets/`
- `vendor/`
- `php-api/`
- optional `member-api.config.json`

Die Details zur PHP-API, Rewrite-Regeln, Benutzeranlage und Schnelltests stehen in [php-api/README.md](php-api/README.md).

## Projektstruktur

```text
.
|-- app.js                         # Hauptlogik der Oberfläche
|-- index.html                     # App-Shell und Modals
|-- styles.css                     # Layout und Design
|-- package.json                   # Vite-Skripte und Frontend-Abhängigkeiten
|-- INSTALLATIONSANLEITUNG.md      # ausführliche Docker-Installationsanleitung
|-- member-api.config.example.json # Beispiel für abweichende API-Adresse
|-- db/schema.mysql.sql            # zusammengefasstes MySQL-Initialschema
|-- public/
|   |-- assets/                    # App-Icon und Bilder
|   `-- vendor/                    # lokal ausgelieferte Frontend-Bibliotheken
`-- php-api/                       # PHP-Backend
```

## Hinweise zur Arbeit am Code

- Die Oberfläche ist bewusst als kompakte Single-Page-App gehalten.
- Stammdaten und Mitgliederfelder werden zentral in `app.js` definiert.
- Zahlungen und Computerclub-Filter hängen an denselben normalisierten Mitgliedsdaten wie Dashboard und Tabellen.
- Änderungen an Mitgliedern werden über die API auditierbar protokolliert.

## Build-Hinweise

Beim Vite-Build können Hinweise erscheinen, dass einige Vendor-Skripte und CSS-Dateien nicht gebundelt werden. Das ist erwartbar, weil diese Dateien im Hosting-Betrieb statisch über `vendor/` ausgeliefert werden.
