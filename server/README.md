# Mitglieder-API

Startet einen lokalen HTTP-Server fuer CRUD-Operationen auf der MySQL-Datenbank.

## Start

```powershell
npm install
npm run server
```

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

## Endpunkte

```text
GET    /health
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
Invoke-RestMethod http://127.0.0.1:3001/api/members?search=Barz
```

```powershell
Invoke-RestMethod `
  -Method Patch `
  -Uri http://127.0.0.1:3001/api/members/7 `
  -ContentType application/json `
  -Body '{"telefon":"030 123456"}'
```

Passbilder koennen binaer hochgeladen werden:

```powershell
Invoke-RestMethod `
  -Method Put `
  -Uri http://127.0.0.1:3001/api/members/7/photo `
  -ContentType image/jpeg `
  -Headers @{ "X-File-Name" = "Barz Monika.jpg" } `
  -InFile ".\Barz Monika.jpg"
```
