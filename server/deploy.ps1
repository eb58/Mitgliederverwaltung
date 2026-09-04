param(
    [string] $Server = "56759440.ssh.w1.strato.hosting",
    [string] $User = "stu512072182",
    [int] $Port = 22,
    [string] $Webroot = "Seniorenclub",
    [string] $AppPath = "mitgliederverwaltung",
    [switch] $SkipUpload
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $projectRoot "..\Gratulationsdienst\docker\src\mitgliederverwaltung"
$deployDir = Join-Path $projectRoot ".deploy\mitgliederverwaltung"
$apiFiles = @(
    ".htaccess",
    "apache-root.htaccess",
    "config.php",
    "config.local.example.php",
    "create-user.php",
    "index.php",
    "lib.php",
    "README.md"
)
$sshOpt = "-o UpdateHostKeys=no"
$remoteApp = "${Webroot}/${AppPath}"
$remoteApi = "${remoteApp}/php-api"

Write-Host "Baue App..." -ForegroundColor Cyan
Push-Location $projectRoot
try {
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build fehlgeschlagen." -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

Write-Host "Bereite Deploy-Paket vor..." -ForegroundColor Cyan
if (Test-Path $deployDir) {
    $resolvedDeployDir = (Resolve-Path $deployDir).Path
    if (!$resolvedDeployDir.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Deploy-Verzeichnis liegt ausserhalb des Projekts: $resolvedDeployDir"
    }
    Remove-Item -LiteralPath $resolvedDeployDir -Recurse -Force
}

New-Item -ItemType Directory -Path $deployDir | Out-Null
Copy-Item -Path "$buildDir\assets" -Destination $deployDir -Recurse -Force
Copy-Item -Path "$buildDir\index.html" -Destination $deployDir -Force

New-Item -ItemType Directory -Path "$deployDir\php-api" | Out-Null
foreach ($file in $apiFiles) {
    Copy-Item -Path (Join-Path $PSScriptRoot $file) -Destination "$deployDir\php-api" -Force
}

if ($SkipUpload) {
    Write-Host "Upload uebersprungen. Paket liegt in $deployDir" -ForegroundColor Yellow
    exit 0
}

Write-Host "Bereinige Zielverzeichnisse..." -ForegroundColor Cyan
# Das bisherige Frontend bleibt bis zum letzten Schritt erreichbar. Insbesondere
# index.html darf nicht vor den neuen, lesbaren Assets ausgetauscht werden.
ssh -p $Port $sshOpt "${User}@${Server}" "mkdir -p '${remoteApi}' '${remoteApp}/assets' && chmod 755 '${remoteApp}' '${remoteApp}/assets' && find '${remoteApp}' -mindepth 1 -maxdepth 1 ! -name 'php-api' ! -name 'assets' ! -name 'index.html' -exec rm -rf -- {} \; && find '${remoteApi}' -mindepth 1 -maxdepth 1 ! -name 'config.local.php' -exec rm -rf -- {} \;"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Remote-Verzeichnisse konnten nicht vorbereitet werden." -ForegroundColor Red
    exit 1
}

Write-Host "Lade Frontend-Assets hoch..." -ForegroundColor Cyan
scp -r -P $Port $sshOpt "$deployDir\assets" "${User}@${Server}:${remoteApp}/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Asset-Upload fehlgeschlagen." -ForegroundColor Red
    exit 1
}

# scp kann Verzeichnisse auf dem Hoster zunaechst mit restriktiven Rechten
# anlegen. Erst nach diesem Schritt darf die neue index.html darauf verweisen.
ssh -p $Port $sshOpt "${User}@${Server}" "find '${remoteApp}/assets' -type d -exec chmod 755 {} \; && find '${remoteApp}/assets' -type f -exec chmod 644 {} \;"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Asset-Rechte konnten nicht gesetzt werden." -ForegroundColor Red
    exit 1
}

Write-Host "Lade PHP-API hoch..." -ForegroundColor Cyan
# Dateien einzeln auflisten statt "*": scp expandiert Wildcards POSIX-artig und
# liesse dabei Punktdateien wie .htaccess aus - dann fehlt der Authorization-Passthrough.
$uploadFiles = $apiFiles | ForEach-Object { Join-Path "$deployDir\php-api" $_ }
scp -P $Port $sshOpt @uploadFiles "${User}@${Server}:${remoteApi}/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "API-Upload fehlgeschlagen." -ForegroundColor Red
    exit 1
}

Write-Host "Aktiviere neues Frontend..." -ForegroundColor Cyan
scp -P $Port $sshOpt "$deployDir\index.html" "${User}@${Server}:${remoteApp}/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "index.html konnte nicht hochgeladen werden." -ForegroundColor Red
    exit 1
}

Write-Host "Setze Dateirechte..." -ForegroundColor Cyan
ssh -p $Port $sshOpt "${User}@${Server}" "find '${remoteApp}' -type d -exec chmod 755 {} \; && find '${remoteApp}' -type f -exec chmod 644 {} \;"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Dateirechte konnten nicht gesetzt werden." -ForegroundColor Red
    exit 1
}

Write-Host "Fertig! https://senioren-luebars.berlin/mitgliederverwaltung/" -ForegroundColor Green
