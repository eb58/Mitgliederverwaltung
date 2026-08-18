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
ssh -p $Port $sshOpt "${User}@${Server}" "mkdir -p '${remoteApi}' && rm -rf '${remoteApp}/assets' '${remoteApp}/vendor' && find '${remoteApi}' -mindepth 1 -maxdepth 1 ! -name 'config.local.php' -exec rm -rf -- {} \;"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Remote-Verzeichnisse konnten nicht vorbereitet werden." -ForegroundColor Red
    exit 1
}

Write-Host "Lade Frontend hoch..." -ForegroundColor Cyan
scp -r -P $Port $sshOpt "$deployDir\assets" "$deployDir\index.html" "${User}@${Server}:${remoteApp}/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend-Upload fehlgeschlagen." -ForegroundColor Red
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

Write-Host "Fertig! https://senioren-luebars.berlin/mitgliederverwaltung/" -ForegroundColor Green
