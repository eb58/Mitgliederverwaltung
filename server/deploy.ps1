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
$remoteIndexTemp = "${remoteApp}/.index.html.deploying"

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
$currentGeneratedAssets = @(Get-ChildItem -Path "$deployDir\assets" -File |
    Where-Object { $_.Name -match '^index-[\w-]+\.(css|js)$' } |
    ForEach-Object { $_.Name })
if (!$currentGeneratedAssets.Count) {
    throw "Das Deploy-Paket enthaelt keine generierten Frontend-Assets."
}

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

Write-Host "Setze Dateirechte..." -ForegroundColor Cyan
ssh -p $Port $sshOpt "${User}@${Server}" "find '${remoteApp}' -type d -exec chmod 755 {} \; && find '${remoteApp}' -type f -exec chmod 644 {} \;"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Dateirechte konnten nicht gesetzt werden." -ForegroundColor Red
    exit 1
}

Write-Host "Merke bisher verwendete Frontend-Assets..." -ForegroundColor Cyan
$previousGeneratedAssets = @(ssh -p $Port $sshOpt "${User}@${Server}" "if [ -f '${remoteApp}/index.html' ]; then grep -oE 'assets/index-[A-Za-z0-9_-]+\.(css|js)' '${remoteApp}/index.html' | sed 's#^assets/##'; fi")
if ($LASTEXITCODE -ne 0) {
    Write-Host "Bisherige Frontend-Assets konnten nicht ermittelt werden." -ForegroundColor Red
    exit 1
}
$previousGeneratedAssets = @($previousGeneratedAssets | Where-Object { $_ -match '^index-[\w-]+\.(css|js)$' })

Write-Host "Lade neue Startseite vor..." -ForegroundColor Cyan
scp -P $Port $sshOpt "$deployDir\index.html" "${User}@${Server}:${remoteIndexTemp}"
if ($LASTEXITCODE -ne 0) {
    Write-Host "index.html konnte nicht vorgeladen werden; die bisherige Version bleibt aktiv." -ForegroundColor Red
    exit 1
}

# Das Umbenennen innerhalb desselben Verzeichnisses ist atomar: Browser sehen
# dadurch entweder die vollstaendige alte oder die vollstaendige neue index.html.
Write-Host "Aktiviere neues Frontend atomar..." -ForegroundColor Cyan
ssh -p $Port $sshOpt "${User}@${Server}" "chmod 644 '${remoteIndexTemp}' && mv -f '${remoteIndexTemp}' '${remoteApp}/index.html'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Das neue Frontend konnte nicht aktiviert werden; die bisherige Version bleibt aktiv." -ForegroundColor Red
    exit 1
}

# Die Assets des unmittelbar vorherigen Frontends bleiben erhalten, damit
# Browser, die dessen index.html kurz vor dem Wechsel geladen haben, nicht ins Leere laufen.
$protectedGeneratedAssets = @(@($currentGeneratedAssets + $previousGeneratedAssets) | Sort-Object -Unique)
$protectedAssetExpression = ($protectedGeneratedAssets | ForEach-Object { "-name '$_'" }) -join " -o "
Write-Host "Bereinige nicht mehr verwendete Build-Assets..." -ForegroundColor Cyan
ssh -p $Port $sshOpt "${User}@${Server}" "find '${remoteApp}/assets' -maxdepth 1 -type f \( -name 'index-*.js' -o -name 'index-*.css' \) ! \( ${protectedAssetExpression} \) -exec rm -f -- {} \;"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warnung: Alte Build-Assets konnten nicht bereinigt werden; das neue Frontend ist bereits aktiv." -ForegroundColor Yellow
}

Write-Host "Fertig! https://senioren-luebars.berlin/mitgliederverwaltung/" -ForegroundColor Green
