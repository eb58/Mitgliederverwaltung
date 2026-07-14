# Installationsanleitung

Diese Anleitung beschreibt die lokale Entwicklung der Mitgliederverwaltung mit dem gemeinsamen Docker-Container, der auch fuer den Gratulationsdienst genutzt wird.

## Zielbild

Lokal laeuft ein gemeinsamer Apache/PHP-Container mit gemeinsamem Webroot:

```text
C:\Users\erich\Projects\Gratulationsdienst Reinickendorf\docker\src
```

Die Anwendungen liegen darin unter getrennten Pfaden:

```text
http://localhost/gratulationsdienst/
http://localhost/mitgliederverwaltung/
```

Die Mitgliederverwaltung liefert nur ihre App-Artefakte und ihr Datenbankschema:

- Frontend-Build nach `C:\Users\erich\Projects\Gratulationsdienst Reinickendorf\docker\src\mitgliederverwaltung`
- PHP-API aus `php-api/`
- MySQL-Schema aus `db/schema.mysql.sql`

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
C:\Users\erich\Projects\Gratulationsdienst Reinickendorf\docker\src\mitgliederverwaltung
```

Die Anwendung ist danach erreichbar unter:

```text
http://localhost/mitgliederverwaltung/
```

## API einbinden

Der gemeinsame Webserver muss die PHP-API unter diesem Pfad sehen:

```text
C:\Users\erich\Projects\Gratulationsdienst Reinickendorf\docker\src\mitgliederverwaltung\php-api
```

Praktisch gibt es zwei Varianten:

- `php-api/` aus diesem Projekt in den gemeinsamen Webroot kopieren
- oder im gemeinsamen Docker-Setup einen Mount auf diesen Projektordner setzen

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
db/schema.mysql.sql
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
docker exec -i mysql_db mysql --default-character-set=utf8mb4 -u eb -p -e "CREATE DATABASE IF NOT EXISTS mitgliederverwaltung CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Danach das Schema importieren:

```powershell
docker exec -i mysql_db mysql --default-character-set=utf8mb4 -u eb -p mitgliederverwaltung < db/schema.mysql.sql
```

Der Parameter `--default-character-set=utf8mb4` ist unter Windows wichtig, damit Umlaute in Stammdaten nicht falsch kodiert importiert werden.

Das Passwort der lokalen gemeinsamen MySQL-Instanz ist aktuell:

```text
test123456!!
```

## Admin-Benutzer

`db/schema.mysql.sql` enthaelt einen lokalen Entwicklungsbenutzer:

```text
admin / passwd
```

Die Anwendung verlangt bei unsicheren Standardpasswoertern eine Passwortaenderung nach dem Login. Einen Benutzer kannst du auch per PHP-Skript setzen:

```powershell
php php-api/create-user.php admin dein-passwort admin
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

- Dieses Projekt bringt keine eigene Docker-Compose-Datei fuer den Webserver mit.
- Der lokale Webserver ist der gemeinsame Docker-Container.
- Das SQL-Schema bleibt im Projekt, damit Neuinstallationen reproduzierbar sind.
- Nach Frontend-Aenderungen reicht `npm.cmd run build`.
- Nach PHP-Aenderungen muss je nach Mount/Kopie der gemeinsame Webroot aktualisiert werden.
