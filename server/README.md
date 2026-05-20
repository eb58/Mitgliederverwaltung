# Mitglieder-API

Startet einen lokalen HTTP-Server fuer CRUD-Operationen auf der MySQL-Datenbank.

## Start

```powershell
npm install
npm run server
```

Der Server liefert auch das Frontend aus. Lokal ist die Anwendung danach unter `http://127.0.0.1:3001/` erreichbar.

Fuer Zugriff von einem anderen Rechner oder per Cloudflare Tunnel muss der Server auf allen Interfaces lauschen:

```powershell
$env:MEMBER_API_HOST="0.0.0.0"
npm run server
```

Cloudflare Tunnel sollte auf denselben Server zeigen:

```powershell
cloudflared tunnel --url http://localhost:3001
```

Dann die Cloudflare-URL direkt oeffnen. Frontend und API laufen dabei unter derselben HTTPS-Origin, dadurch gibt es kein Mixed-Content-Problem.

Standardwerte:

```text
MEMBER_API_HOST=127.0.0.1
MEMBER_API_PORT=3001
MEMBER_DB_HOST=127.0.0.1
MEMBER_DB_PORT=3306
MEMBER_DB_USER=wp_user
MEMBER_DB_PASSWORD=passwd
MEMBER_DB_NAME=mitgliederverwaltung
MEMBER_API_CORS_ORIGIN=*
```

Benutzer liegen in der Tabelle `app_user`. Der Liquibase-ChangeLog legt initial `admin` mit Passwort `passwd` an.

Passwort setzen oder neuen Benutzer anlegen:

```powershell
npm run user:set -- admin neues-passwort
```

## Endpunkte

```text
GET    /health
POST   /api/session
GET    /api/session
DELETE /api/session
GET    /api/members?search=barz&limit=50&offset=0
GET    /api/members/:id
POST   /api/members
PATCH  /api/members/:id
PUT    /api/members/:id
DELETE /api/members/:id
GET    /api/members/:id/photo
PUT    /api/members/:id/photo
DELETE /api/members/:id/photo
```

Beispiel:

```powershell
$session = Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3001/api/session `
  -ContentType application/json `
  -Body '{"username":"admin","password":"passwd"}'

$headers = @{ Authorization = "Bearer $($session.token)" }

Invoke-RestMethod -Headers $headers http://127.0.0.1:3001/api/members?search=Barz
```

```powershell
Invoke-RestMethod `
  -Headers $headers `
  -Method Patch `
  -Uri http://127.0.0.1:3001/api/members/7 `
  -ContentType application/json `
  -Body '{"telefon":"030 123456"}'
```

Passbilder koennen binaer hochgeladen werden:

```powershell
Invoke-RestMethod `
  -Headers ($headers + @{ "X-File-Name" = "Barz Monika.jpg" }) `
  -Method Put `
  -Uri http://127.0.0.1:3001/api/members/7/photo `
  -ContentType image/jpeg `
  -InFile ".\Barz Monika.jpg"
```
