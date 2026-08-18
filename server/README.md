# Server der Mitgliederverwaltung

Diese API stellt die Backend-Endpunkte der Mitgliederverwaltung bereit:

```text
POST   /api/session
GET    /api/session
DELETE /api/session
POST   /api/session/password
PUT    /api/session/password
PATCH  /api/session/password
GET    /api/members
POST   /api/members
GET    /api/member-changes
GET    /api/members/{id}
PUT    /api/members/{id}
DELETE /api/members/{id}
GET    /api/members/{id}/changes
GET    /api/members/{id}/photo
PUT    /api/members/{id}/photo
DELETE /api/members/{id}/photo
GET    /api/users
POST   /api/users
PUT    /api/users/{id}
PATCH  /api/users/{id}
DELETE /api/users/{id}
GET    /api/reference-data
GET    /api/reference-data/{type}
POST   /api/reference-data/{type}
PUT    /api/reference-data/{type}/{id}
PATCH  /api/reference-data/{type}/{id}
DELETE /api/reference-data/{type}/{id}
GET    /health
```

## Installation auf Webhosting

Voraussetzungen: PHP 8.0 oder neuer, PDO MySQL und Apache `mod_rewrite`.

1. Das Frontend mit `npm.cmd run build` bauen und anschließend `index.html`, `assets/` sowie die PHP-Laufzeitdateien aus `server/` in den Zielordner `mitgliederverwaltung/php-api/` hochladen. Alternativ kann dafür `server/deploy.ps1` verwendet werden.
2. Den Inhalt von `server/apache-root.htaccess` in die `.htaccess` im Webroot uebernehmen.
3. `server/config.local.example.php` als `mitgliederverwaltung/php-api/config.local.php` kopieren und DB-Zugangsdaten eintragen.
4. Die Datei `server/db/schema.mysql.sql` aus dem Repository auf der Webhoster-Datenbank einspielen.
5. PHP-kompatiblen Login-User anlegen:

```bash
php mitgliederverwaltung/php-api/create-user.php admin dein-passwort
```

Die PHP-API verwendet `password_hash()`/`password_verify()`.

Wenn die Datenbank bereits existiert, muss sie dem Schema in `server/db/schema.mysql.sql` entsprechen. Fehlende Schemaerweiterungen sind vor dem Betrieb manuell einzuspielen, zum Beispiel über phpMyAdmin.

## Betrieb ohne mod_rewrite

Dafuer ist nichts einzurichten: Das Frontend spricht `php-api/index.php` von vornherein direkt an,
die Rewrite-Regeln sind nur Komfort fuer huebschere URLs.

## Authorization-Header beim Hoster

Login funktioniert, aber jeder weitere Aufruf antwortet mit `401 Anmeldung erforderlich`?
Dann reicht der Hoster den `Authorization`-Header nicht an PHP durch (typisch fuer
FastCGI/CGI, sobald die `.htaccess` im API-Ordner fehlt oder nicht ausgewertet wird).

Abhilfe, in dieser Reihenfolge:

1. `server/.htaccess` muss im Ordner `mitgliederverwaltung/php-api/` liegen - sie setzt
   `HTTP_AUTHORIZATION` per `SetEnvIf` und `RewriteRule`.
2. Der Client sendet das Token zusaetzlich als `X-Auth-Token`; dieser Header kommt auch
   ohne `.htaccess` an. Dafuer muss das Frontend neu gebaut und hochgeladen sein.
3. Erlaubt der Hoster `AllowOverride FileInfo`, ist `CGIPassAuth On` die sauberste Loesung
   (in `server/.htaccess` auskommentiert vorbereitet).

Pruefen laesst sich das ueber `/health`: Der Endpunkt meldet `tokenReceived`, also ob das
mitgeschickte Token den PHP-Prozess erreicht hat.

```bash
curl -H "Authorization: Bearer testtoken" https://deine-domain.example/mitgliederverwaltung/php-api/index.php/health
# {"status":"ok","sapi":"...","tokenReceived":true}
```

## Schnelltest

```bash
curl https://deine-domain.example/mitgliederverwaltung/health
curl -X POST https://deine-domain.example/mitgliederverwaltung/api/session \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"dein-passwort"}'
```

Ohne `mod_rewrite` entsprechend:

```bash
curl https://deine-domain.example/mitgliederverwaltung/php-api/index.php/health
curl -X POST https://deine-domain.example/mitgliederverwaltung/php-api/index.php/api/session \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"dein-passwort"}'
```
