# PHP-API fuer die Mitgliederverwaltung

Diese API stellt dieselben Endpunkte wie der Node-Server bereit:

```text
POST   /api/session
GET    /api/session
DELETE /api/session
GET    /api/members
POST   /api/members
GET    /api/members/{id}
PUT    /api/members/{id}
DELETE /api/members/{id}
GET    /api/members/{id}/photo
PUT    /api/members/{id}/photo
DELETE /api/members/{id}/photo
GET    /health
```

## Installation auf Webhosting

Voraussetzungen: PHP 8.0 oder neuer, PDO MySQL und Apache `mod_rewrite`.

1. `php-api/` neben `index.html`, `app.js`, `styles.css`, `assets/` und `vendor/` hochladen.
2. Den Inhalt von `php-api/apache-root.htaccess` in die `.htaccess` im Webroot uebernehmen.
3. `php-api/config.local.example.php` als `php-api/config.local.php` kopieren und DB-Zugangsdaten eintragen.
4. Liquibase-Schema auf der Webhoster-Datenbank einspielen.
5. PHP-kompatiblen Login-User anlegen:

```bash
php php-api/create-user.php admin dein-passwort
```

Die PHP-API verwendet `password_hash()`/`password_verify()`. Bereits mit dem Node-Server erzeugte `scrypt$...`-Passworthashes funktionieren in PHP nicht. Wenn du spaeter wieder Node verwendest, den User dort erneut mit `npm run user:set -- admin dein-passwort` setzen.

## Betrieb ohne mod_rewrite

Wenn `mod_rewrite` beim Hoster nicht funktioniert, kann die API direkt ueber `index.php` angesprochen werden. Lege im Webroot neben `index.html` eine Datei `member-api.config.json` an:

```json
{
  "memberApiBaseUrl": "https://deine-domain.example/php-api/index.php"
}
```

Die Datei `member-api.config.example.json` ist als Vorlage im Repository enthalten.

## Schnelltest

```bash
curl https://deine-domain.example/health
curl -X POST https://deine-domain.example/api/session \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"dein-passwort"}'
```

Ohne `mod_rewrite` entsprechend:

```bash
curl https://deine-domain.example/php-api/index.php/health
curl -X POST https://deine-domain.example/php-api/index.php/api/session \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"dein-passwort"}'
```
