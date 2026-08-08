# Mitgliederverwaltung Senioren Lübars

Webbasierte Mitgliederverwaltung für den Seniorenclub Lübars. Die Anwendung bündelt Stammdaten, Gruppenzugehörigkeiten, Beitragszahlungen, Weihnachtsessen, Gäste, ehemalige Mitglieder und Änderungsprotokolle in einer kompakten Oberfläche.

## Überblick

Die Anwendung besteht aus einem statischen Frontend und einer schlanken PHP-API:

- `index.html`, `src/` und `styles.css`: Browser-Oberfläche, von Vite mit den Frontend-Abhängigkeiten gebündelt
- `public/assets/`: statische Bilder und App-Icon
- `server/`: PHP-Backend, Datenbankschema sowie lokale Server- und Deployment-Konfiguration
- `config/member-api.config.example.json`: Vorlage für eine abweichende API-Adresse

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
npm run dev
```

Produktionsbuild erzeugen:

```bash
npm run build
```

Unter Windows ist `npm.cmd` in PowerShell robuster als `npm`, wenn die PowerShell Execution Policy das Laden von `npm.ps1` blockiert.

## Lokaler Docker-Betrieb

Für die lokale Entwicklung nutzt die Mitgliederverwaltung denselben Apache/PHP-Container wie der Gratulationsdienst. Die Datei `server/docker-compose.local.yml` ergänzt dessen Konfiguration um die Mounts, den Apache-Pfad und die Datenbankverbindung der Mitgliederverwaltung.

Der Frontend-Build wird in den gemeinsamen Webroot geschrieben:

```text
C:\Users\erich\Projects\Gratulationsdienst\docker\src\mitgliederverwaltung
```

Build ausführen:

```bash
npm run build
```

Gemeinsamen Webcontainer mit der lokalen Ergänzung starten oder neu erstellen:

```powershell
docker compose -f ..\Gratulationsdienst\docker\docker-compose.yml -f .\server\docker-compose.local.yml up -d --no-deps --force-recreate web
```

Die Anwendung ist danach erreichbar unter:

```text
http://localhost/mitgliederverwaltung/
```

Nach Frontend-Änderungen reicht `npm.cmd run build` und ein Neuladen im Browser. Änderungen unter `server/` sind durch den direkten Mount sofort verfügbar.

Die Datenbankstruktur liegt im Projekt:

```text
server/db/schema.mysql.sql
```

Eine ausführlichere Schritt-für-Schritt-Anleitung steht in [docs/INSTALLATIONSANLEITUNG.md](docs/INSTALLATIONSANLEITUNG.md).

## API-Konfiguration

Standardmäßig erwartet das Frontend die API relativ zur Anwendung. Wenn die API an einer anderen Adresse liegt oder ohne `mod_rewrite` betrieben wird, kann eine lokale Konfiguration angelegt werden:

```json
{
  "memberApiBaseUrl": "https://deine-domain.example/mitgliederverwaltung/php-api/index.php"
}
```

Als Vorlage liegt `config/member-api.config.example.json` im Repository.

## Deployment

Für Strato/Webhosting gibt es ein PowerShell-Skript analog zum Gratulationsdienst:

```powershell
.\server\deploy.ps1
```

Das Skript baut das Frontend, erstellt ein lokales Deploy-Paket unter `.deploy/mitgliederverwaltung`, lädt Frontend und PHP-API per `scp` hoch und setzt danach Dateirechte. Ein lokaler Probelauf ohne Upload ist möglich mit:

```powershell
.\server\deploy.ps1 -SkipUpload
```

Das Skript setzt voraus, dass der gemeinsame Gratulationsdienst neben diesem Projekt liegt, weil Vite den Frontend-Build in dessen Docker-Webroot schreibt. Für einen manuellen Build muss dieser Pfad in `vite.config.js` entsprechend angepasst werden.

Für klassisches Webhosting werden diese Dateien und Ordner ausgeliefert:

- `index.html`
- `assets/`
- PHP-Laufzeitdateien aus `server/` im Zielordner `php-api/`, ohne `config.local.php`
- optional `member-api.config.json`

Vor dem Upload entfernt das Skript alte Frontend-Bundles, das nicht mehr benötigte `vendor/`-Verzeichnis und veraltete API-Dateien vom Ziel. Die Datei `server/config.local.php` enthält lokale Zugangsdaten und wird bewusst nicht deployed. Auf dem Webserver muss `php-api/config.local.php` einmalig aus `server/config.local.example.php` erstellt werden. Die Details zur PHP-API, Rewrite-Regeln, Benutzeranlage und Schnelltests stehen in [server/README.md](server/README.md).

## Projektstruktur

```text
.
|-- index.html                     # App-Shell und Modals
|-- styles.css                     # Layout und Design
|-- package.json                   # Vite-Skripte und Frontend-Abhängigkeiten
|-- config/                        # optionale Frontend-Konfigurationen
|-- docs/                          # Installations- und Betriebsanleitungen
|-- public/
|   `-- assets/                    # App-Icon und Bilder
|-- server/                        # PHP-Backend, Schema und Serverkonfiguration
|-- src/                           # JavaScript der Browser-Anwendung
`-- tests/                         # Tests, Runner-Konfigurationen und Testwerkzeuge
```

## Hinweise zur Arbeit am Code

- Die Oberfläche ist bewusst als kompakte Single-Page-App gehalten.
- Stammdaten und Mitgliederfelder werden zentral in `src/app.js` definiert.
- Zahlungen und Computerclub-Filter hängen an denselben normalisierten Mitgliedsdaten wie Dashboard und Tabellen.
- Änderungen an Mitgliedern werden über die API auditierbar protokolliert.

## Tests

Alle Unit- und E2E-Tests ausführen:

```powershell
npm.cmd test
```

Die Testarten können auch einzeln gestartet werden:

```powershell
npm.cmd run test:unit
npm.cmd run test:php
npm.cmd run test:e2e
npm.cmd run test:coverage
```

Die Unit-Tests unter `tests/unit/` prüfen die Datums-, Währungs-, Alters-, Geschäftsjahres- und URL-Logik. Die PHP-Tests unter `tests/php/` prüfen die reine Logik von `server/lib.php` (Auth-Hilfsfunktionen, Feld-Normalisierung, Änderungsprotokoll) ohne Datenbankzugriff; `npm run test:php` lädt dafür einmalig `tests/tools/phpunit.phar` herunter (nicht Teil des Repos) und benötigt die PHP-Erweiterung `mbstring`. `npm run test:coverage` nutzt Node.js' eingebauten experimentellen Coverage-Reporter und gibt Zeilen-, Branch- und Funktionsabdeckung für die JavaScript-Unit-Tests aus. Die Playwright-Tests unter `tests/e2e/` starten automatisch einen Vite-Server und simulieren die API im Browser. Sie verändern deshalb weder die lokale noch die produktive Mitgliederdatenbank.

Der versionierte Pre-Commit-Hook führt vor jedem Commit die vollständige Test-Suite aus und bricht den Commit bei einem Fehler ab. Er wird einmalig aktiviert mit:

```powershell
npm.cmd run hooks:install
```

Unter Windows verwendet Playwright den installierten Microsoft Edge. In einer CI- oder Linux-Umgebung muss einmalig der Chromium-Browser installiert werden:

```bash
npx playwright install chromium
```

## Build-Hinweise

Vite bündelt und minifiziert den Anwendungscode sowie Bootstrap, AG Grid und Chart.js. Der Hinweis auf ein großes JavaScript-Bundle ist wegen AG Grid erwartbar; die ausgelieferte Datei ist bereits minifiziert und lässt sich vom Webserver zusätzlich komprimiert übertragen.
