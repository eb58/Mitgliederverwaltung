# Installationsanleitung

Diese Anleitung beschreibt die lokale Entwicklung der Mitgliederverwaltung mit dem gemeinsamen Docker-Container, der auch fuer den Gratulationsdienst genutzt wird.

## Zielbild

Lokal laeuft ein gemeinsamer Apache/PHP-Container mit gemeinsamem Webroot:

```text
C:\Users\erich\Projects\Gratulationsdienst\docker\src
```

Die Anwendungen liegen darin unter getrennten Pfaden:

```text
http://localhost/gratulationsdienst/
http://localhost/mitgliederverwaltung/
```

Die Mitgliederverwaltung liefert nur ihre App-Artefakte und ihr Datenbankschema:

- Frontend-Build nach `C:\Users\erich\Projects\Gratulationsdienst\docker\src\mitgliederverwaltung`
- PHP-API aus `server/`
- MySQL-Schema aus `server/db/schema.mysql.sql`

## Voraussetzungen

- gemeinsamer lokaler Docker-Container ist gestartet
- Node.js mit npm
- MySQL-Datenbank `mitgliederverwaltung` in der gemeinsamen MySQL-Instanz
- PHP-API ist im gemeinsamen Webroot unter `mitgliederverwaltung/php-api` erreichbar

## Frontend bauen

Abhaengigkeiten installieren:

```powershell
npm install
```

Frontend in den gemeinsamen Docker-Webroot bauen:

```powershell
npm.cmd run build
```

Der Build landet in:

```text
C:\Users\erich\Projects\Gratulationsdienst\docker\src\mitgliederverwaltung
```

Gemeinsamen Webcontainer mit der lokalen Ergaenzung starten oder neu erstellen:

```powershell
docker compose -f ..\Gratulationsdienst\docker\docker-compose.yml -f .\server\docker-compose.local.yml up -d --no-deps --force-recreate web
```

Die Anwendung ist danach erreichbar unter:

```text
http://localhost/mitgliederverwaltung/
```

## API einbinden

Der gemeinsame Webserver muss die PHP-API unter diesem Pfad sehen:

```text
C:\Users\erich\Projects\Gratulationsdienst\docker\src\mitgliederverwaltung\php-api
```

`server/docker-compose.local.yml` bindet `server/` direkt an dieser Stelle ein. Aenderungen am Backend sind deshalb ohne Kopieren und ohne Container-Neustart verfuegbar.

Die API liest ihre Datenbankkonfiguration aus Umgebungsvariablen:

```text
MEMBER_DB_HOST
MEMBER_DB_PORT
MEMBER_DB_NAME
MEMBER_DB_USER
MEMBER_DB_PASSWORD
MEMBER_API_SESSION_TTL_SECONDS
MEMBER_API_CORS_ORIGIN
```

Fuer lokale Entwicklung mit derselben MySQL-Instanz wie der Gratulationsdienst ist nur wichtig, dass `MEMBER_DB_NAME` auf eine eigene Datenbank zeigt, z. B.:

```text
mitgliederverwaltung
```

## Datenbank einrichten

Das zusammengefasste Initialschema liegt im Projekt:

```text
server/db/schema.mysql.sql
```

Es erstellt:

- Stammdatentabellen
- Mitgliedertabellen
- Join-Tabellen fuer Interessengruppen und Funktionen
- Passbildtabelle
- Benutzer- und Sessiontabellen
- Aenderungsprotokoll
- initiale Stammdaten

Falls die Datenbank noch nicht existiert, einmal anlegen:

```powershell
docker exec gradi-db mariadb -uroot -pchangeme!! -e "CREATE DATABASE IF NOT EXISTS mitgliederverwaltung CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Danach das Schema zuerst unveraendert in den Container kopieren und dort importieren:

```powershell
docker cp .\server\db\schema.mysql.sql gradi-db:/tmp/mitgliederverwaltung-schema.sql
docker exec gradi-db sh -c "mariadb --default-character-set=utf8mb4 -uroot -pchangeme!! mitgliederverwaltung < /tmp/mitgliederverwaltung-schema.sql"
```

Die SQL-Datei nicht mit `Get-Content | docker exec` weiterreichen: Windows PowerShell kann dabei nicht-ASCII-Zeichen durch `?` ersetzen. `docker cp` erhaelt die UTF-8-Bytes unveraendert; `--default-character-set=utf8mb4` stellt die passende MariaDB-Verbindungskodierung sicher.

Das Passwort der lokalen gemeinsamen MySQL-Instanz ist aktuell:

```text
changeme!!
```

## Admin-Benutzer

`server/db/schema.mysql.sql` enthaelt einen lokalen Entwicklungsbenutzer:

```text
admin / passwd
```

Die Anwendung verlangt bei unsicheren Standardpasswoertern eine Passwortaenderung nach dem Login. Einen Benutzer kannst du auch per PHP-Skript setzen:

```powershell
php server/create-user.php admin dein-passwort admin
```

Im Container entsprechend:

```powershell
docker exec -it php_webserver php /var/www/html/mitgliederverwaltung/php-api/create-user.php admin dein-passwort admin
```

## Pruefen

Healthcheck:

```text
http://localhost/mitgliederverwaltung/php-api/index.php/health
```

Erwartete Antwort:

```json
{"status":"ok"}
```

App:

```text
http://localhost/mitgliederverwaltung/
```

## Hinweise

- `server/docker-compose.local.yml` erweitert die Compose-Datei des Gratulationsdienstes; sie startet keinen zweiten Webserver.
- Der lokale Webserver ist der gemeinsame Docker-Container.
- Das SQL-Schema bleibt im Projekt, damit Neuinstallationen reproduzierbar sind.
- Nach Frontend-Aenderungen reicht `npm.cmd run build`.
- Nach PHP-Aenderungen muss je nach Mount/Kopie der gemeinsame Webroot aktualisiert werden.
