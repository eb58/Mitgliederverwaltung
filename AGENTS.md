# AGENTS.md

## Arbeitsregeln

- Docker-Container nach Verzeichnis-Umbenennungen im Repo immer mit `--force-recreate` neu erstellen (siehe Befehl unten) - sonst laufen alte Bind-Mounts weiter und die PHP-API liefert einen Apache-404 statt einer echten Antwort.
- Fachliche Begriffe auf Deutsch belassen (Mitglied, Beitrag, Weihnachtsessen, Austrittsgrund, Interessengruppe, Funktion) - keine englischen Namen dafür suchen.
- Neue fachliche Logik ohne DOM-/Netzwerkabhängigkeit möglichst in `member-domain.js` bzw. `member-utils.js` auslagern, damit sie unit-testbar bleibt.
- Nur auf Anforderung committen.

## Projektwissen

- Aufbau: statisches Frontend (`index.html`, `src/`) plus PHP-Backend in `server/`. Der Ordner hiess bis zum Commit "Projektstruktur aufräumen" `php-api/` - in älteren Notizen oder Deploy-Skripten kann der alte Name noch auftauchen.
- `src/app.js` wird schrittweise in Module aufgeteilt: `dashboard.js`, `grid-config.js`, `member-api.js`, `member-config.js`, `member-domain.js`, `state.js`, `ui.js`, `user-admin.js`. Der Umbau ist teils noch nicht committet - vor größeren Änderungen an `app.js` `git status` prüfen.
- Lokale Entwicklung läuft im gemeinsamen Docker-Container mit dem Gratulationsdienst-Projekt (`../Gratulationsdienst/docker`). Start/Neustart:
  ```powershell
  docker compose -f ..\Gratulationsdienst\docker\docker-compose.yml -f .\server\docker-compose.local.yml up -d --no-deps --force-recreate web
  ```
  Danach erreichbar unter `http://localhost/mitgliederverwaltung/`. `vite.config.js` schreibt den Build direkt in den gemeinsamen Docker-Webroot (`../Gratulationsdienst/docker/src/mitgliederverwaltung`).
- Testabdeckung ist ungleich verteilt: `member-utils.js` und `member-domain.js` sind zu 100 % (Zeilen) unit-getestet. `member-api.js` und `app.js` haben keine Unit-Tests und hängen nur an den wenigen Playwright-E2E-Szenarien in `tests/e2e/app.spec.js`. Bei neuer fachlicher Logik dort zuerst Unit-Tests ergänzen statt sich auf E2E zu verlassen.
- `server/lib.php` ist zweistufig getestet: reine Logik in `LibTest.php`/`HandlerLogicTest.php` (laufen immer), die `handle*`-Funktionen in `ApiAuthTest.php`/`ApiMemberTest.php`/`ApiReferenceDataTest.php` gegen eine echte MariaDB.
- Diese Integrationstests brauchen die Wegwerf-DB aus `tests/docker-compose.test.yml` (Port 3307, tmpfs, Schema aus `server/db/schema.mysql.sql`). `npm.cmd run test:php` fährt sie selbst hoch - kein manueller Schritt nötig. Nur wenn Docker ganz fehlt, überspringen sich die Tests, und zwar mit einer auffälligen Warnung. Container stoppen: `npm.cmd run test:php:db:down`.
- Zwei Nähte machen die Handler testbar: `db($pdo)` injiziert die Verbindung, und `jsonResponse()`/`noContent()`/`rawResponse()` werfen eine `ApiResponse` statt zu `exit`en - `server/index.php` fängt sie und gibt sie per `emitResponse()` aus. Neue Handler müssen diesem Muster folgen, sonst sind sie nicht testbar.
- API-Endpunkte, Deployment ohne `mod_rewrite` und Schnelltests: siehe `server/README.md`.

## Prüfen

- Vor Abschluss die betroffenen Tests laufen lassen: `npm.cmd run test:unit`, `npm.cmd run test:php`, bei UI-Änderungen zusätzlich `npm.cmd run test:e2e`.
- Für breitere Änderungen `npm.cmd test` (alle drei) laufen lassen.
- Der versionierte Pre-Commit-Hook führt die volle Suite ohnehin aus; einmalig aktivieren mit `npm.cmd run hooks:install`.
