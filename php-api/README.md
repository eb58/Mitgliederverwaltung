# PHP-API fuer die Mitgliederverwaltung

Diese API stellt die Backend-Endpunkte der Mitgliederverwaltung bereit:

```text
POST   /api/session
GET    /api/session
DELETE /api/session
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
GET    /health
```

## Installation auf Webhosting

Voraussetzungen: PHP 8.0 oder neuer, PDO MySQL und Apache `mod_rewrite`.

1. `index.html`, `app.js`, `styles.css`, `assets/`, `vendor/` und `php-api/` in das Verzeichnis `mitgliederverwaltung/` hochladen.
2. Den Inhalt von `php-api/apache-root.htaccess` in die `.htaccess` im Webroot uebernehmen.
3. `php-api/config.local.example.php` als `mitgliederverwaltung/php-api/config.local.php` kopieren und DB-Zugangsdaten eintragen.
4. Liquibase-Schema auf der Webhoster-Datenbank einspielen.
5. PHP-kompatiblen Login-User anlegen:

```bash
php mitgliederverwaltung/php-api/create-user.php admin dein-passwort
```

Die PHP-API verwendet `password_hash()`/`password_verify()`.

Wenn die Datenbank bereits ohne Liquibase beim Hoster existiert, neue Schemaerweiterungen per phpMyAdmin einspielen. Fuer inaktive Stammdaten liegt die Datei `db/005-reference-data-active.phpmyadmin.sql` bereit.

## Betrieb ohne mod_rewrite

Wenn `mod_rewrite` beim Hoster nicht funktioniert, kann die API direkt ueber `index.php` angesprochen werden. Lege neben `index.html` im Verzeichnis `mitgliederverwaltung/` eine Datei `member-api.config.json` an:

```json
{
  "memberApiBaseUrl": "https://deine-domain.example/mitgliederverwaltung/php-api/index.php"
}
```

Die Datei `member-api.config.example.json` ist als Vorlage im Repository enthalten.

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
