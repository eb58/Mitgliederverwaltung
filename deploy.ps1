param(
    [string] $Server = "56759440.ssh.w1.strato.hosting",
    [string] $User = "stu512072182",
    [int] $Port = 22,
    [string] $Webroot = "Seniorenclub",
    [string] $AppPath = "mitgliederverwaltung",
    [switch] $SkipUpload
)

$ErrorActionPreference = "Stop"

$buildDir = "..\Gratulationsdienst Reinickendorf\docker\src\mitgliederverwaltung"
$deployDir = ".deploy\mitgliederverwaltung"
$apiFiles = @(
    "php-api\.htaccess",
    "php-api\apache-root.htaccess",
    "php-api\config.php",
    "php-api\config.local.example.php",
    "php-api\create-user.php",
    "php-api\index.php",
    "php-api\lib.php",
    "php-api\README.md"
)
$sshOpt = "-o UpdateHostKeys=no"
$remoteApp = "${Webroot}/${AppPath}"
$remoteApi = "${remoteApp}/php-api"

Write-Host "Baue App..." -ForegroundColor Cyan
npm.cmd run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build fehlgeschlagen." -ForegroundColor Red
    exit 1
}

Write-Host "Bereite Deploy-Paket vor..." -ForegroundColor Cyan
if (Test-Path $deployDir) {
    $workspace = (Resolve-Path ".").Path
    $resolvedDeployDir = (Resolve-Path $deployDir).Path
    if (!$resolvedDeployDir.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Deploy-Verzeichnis liegt ausserhalb des Projekts: $resolvedDeployDir"
    }
    Remove-Item -LiteralPath $resolvedDeployDir -Recurse -Force
}

New-Item -ItemType Directory -Path $deployDir | Out-Null
Copy-Item -Path "$buildDir\*" -Destination $deployDir -Recurse -Force

$localApiInBuild = Join-Path $deployDir "php-api"
if (Test-Path $localApiInBuild) {
    Remove-Item -LiteralPath $localApiInBuild -Recurse -Force
}

New-Item -ItemType Directory -Path "$deployDir\php-api" | Out-Null
foreach ($file in $apiFiles) {
    Copy-Item -Path $file -Destination "$deployDir\php-api" -Force
}

if ($SkipUpload) {
    Write-Host "Upload uebersprungen. Paket liegt in $deployDir" -ForegroundColor Yellow
    exit 0
}

Write-Host "Lege Zielverzeichnisse an..." -ForegroundColor Cyan
ssh -p $Port $sshOpt "${User}@${Server}" "mkdir -p '${remoteApi}' && rm -rf '${remoteApp}/assets' '${remoteApp}/vendor'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Remote-Verzeichnis konnte nicht angelegt werden." -ForegroundColor Red
    exit 1
}

Write-Host "Lade Frontend hoch..." -ForegroundColor Cyan
scp -r -P $Port $sshOpt "$deployDir\assets" "$deployDir\vendor" "$deployDir\index.html" "${User}@${Server}:${remoteApp}/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend-Upload fehlgeschlagen." -ForegroundColor Red
    exit 1
}

Write-Host "Lade PHP-API hoch..." -ForegroundColor Cyan
scp -P $Port $sshOpt "$deployDir\php-api\*" "${User}@${Server}:${remoteApi}/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "API-Upload fehlgeschlagen." -ForegroundColor Red
    exit 1
}

Write-Host "Setze Dateirechte..." -ForegroundColor Cyan
ssh -p $Port $sshOpt "${User}@${Server}" "find '${remoteApp}' -type d -exec chmod 755 {} \; && find '${remoteApp}' -type f -exec chmod 644 {} \;"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Dateirechte konnten nicht gesetzt werden." -ForegroundColor Red
    exit 1
}

Write-Host "Fertig! https://senioren-luebars.berlin/mitgliederverwaltung/" -ForegroundColor Green
