param(
    [string] $Server = "56759440.ssh.w1.strato.hosting",
    [string] $User = "stu512072182",
    [int] $Port = 22,
    [string] $Webroot = "Seniorenclub",
    [string] $AppPath = "mitgliederverwaltung",
    # config.local.php auf dem Server waehlt die Prod-Datenbank anhand dieses Hostnamens.
    [string] $ProdHost = "senioren-luebars.berlin",
    [string] $DbContainer = "gradi-db",
    [string] $DbName = "mitgliederverwaltung",
    [string] $DbRootPassword = "changeme!!",
    [string] $AppDbUser = "mitglieder",
    # Ohne Sicherung des bisherigen lokalen Stands einspielen.
    [switch] $NoBackup,
    # Ohne Rueckfrage einspielen.
    [switch] $Force
)

# Holt die Prod-Datenbank (Strato) in den lokalen Docker-Container. Auf dem Server wird nur
# gelesen: mysqldump --single-transaction sperrt keine Tabellen. Die lokale Datenbank wird
# komplett ersetzt - danach gelten auch die Prod-Benutzer und -Passwoerter.

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $projectRoot ".db-backups"
$sshOpt = "-o UpdateHostKeys=no"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$localDump = Join-Path $env:TEMP "mv-prod-$timestamp.sql.gz"
$containerDump = "/tmp/mv-prod-$timestamp.sql.gz"
$remoteDump = $null
$remoteStarted = $false

# Laeuft auf dem Server. Das DB-Passwort steht nur in einer Datei mit Rechten 600, nicht auf
# der Kommandozeile. Die Ausgabe ist zeilenweise key=value, damit PowerShell sie lesen kann.
$remoteScript = @'
<?php
$_SERVER['HTTP_HOST'] = '__PROD_HOST__';
$config = require getenv('HOME') . '/__API_PATH__/config.php';
$db = $config['db'];
// Nicht /tmp: PHP sieht auf dem Hoster ein anderes /tmp als scp. Das Home-Verzeichnis ist htdocs,
// deshalb ein Ordner mit Rechten 700 und einer .htaccess, die jeden Webzugriff ablehnt.
$dir = getenv('HOME') . '/.mv-pull';
if (!is_dir($dir)) mkdir($dir, 0700);
chmod($dir, 0700);
file_put_contents("$dir/.htaccess", "Require all denied\n");
$defaults = tempnam($dir, 'client');
chmod($defaults, 0600);
file_put_contents($defaults, "[client]\nhost={$db['host']}\nport={$db['port']}\nuser={$db['user']}\npassword=\"" . addcslashes($db['password'], "\"\\") . "\"\n");
$target = "$dir/mvpull-" . bin2hex(random_bytes(12)) . '.sql.gz';
$command = 'umask 077; mysqldump --defaults-extra-file=' . escapeshellarg($defaults)
    . ' --single-transaction --quick --default-character-set=utf8mb4 --hex-blob --no-tablespaces --skip-lock-tables '
    . escapeshellarg($db['name']) . ' 2>' . escapeshellarg($target . '.err') . ' | gzip > ' . escapeshellarg($target)
    . '; echo ${PIPESTATUS[0]}';
$status = trim((string) shell_exec('bash -c ' . escapeshellarg($command)));
unlink($defaults);
$error = trim((string) @file_get_contents($target . '.err'));
@unlink($target . '.err');
echo "file=$target\n";
echo "exit=$status\n";
echo 'size=' . (int) @filesize($target) . "\n";
echo 'error=' . str_replace("\n", ' ', $error) . "\n";
'@
$remoteScript = $remoteScript.Replace("__PROD_HOST__", $ProdHost).Replace("__API_PATH__", "$Webroot/$AppPath/php-api")

function Invoke-DbContainer([string] $command) {
    docker exec $DbContainer sh -c $command
    if ($LASTEXITCODE -ne 0) { throw "Befehl im Container $DbContainer fehlgeschlagen." }
}

function Get-MemberCount {
    $count = docker exec $DbContainer sh -c "mariadb -uroot -p'$DbRootPassword' -N -e 'SELECT COUNT(*) FROM $DbName.mitglied' 2>/dev/null"
    if ($LASTEXITCODE -ne 0) { return "keine" }
    return "$count".Trim()
}

# Windows PowerShell 5.1 macht stderr eines Programms bei "Stop" zum Abbruch - daher try/catch.
$containerRunning = $false
try {
    docker exec $DbContainer sh -c "true" 2>$null
    $containerRunning = $LASTEXITCODE -eq 0
} catch {
    $containerRunning = $false
}
if (!$containerRunning) {
    Write-Host "Container $DbContainer laeuft nicht - zuerst Docker starten (siehe docs/INSTALLATIONSANLEITUNG.md)." -ForegroundColor Red
    exit 1
}

if (!$Force) {
    Write-Host "Die lokale Datenbank '$DbName' in $DbContainer wird durch den Prod-Stand ersetzt (lokal derzeit $(Get-MemberCount) Mitglieder)." -ForegroundColor Yellow
    $answer = Read-Host "Fortfahren? (j/n)"
    if ($answer -notmatch '^(j|ja|y|yes)$') {
        Write-Host "Abgebrochen." -ForegroundColor Yellow
        exit 0
    }
}

try {
    Write-Host "Erzeuge Dump auf dem Server..." -ForegroundColor Cyan
    $remoteStarted = $true
    $output = @($remoteScript | ssh -p $Port $sshOpt "${User}@${Server}" "php -q")
    if ($LASTEXITCODE -ne 0) { throw "SSH-Verbindung oder PHP auf dem Server fehlgeschlagen." }
    $result = @{}
    foreach ($line in $output) {
        if ("$line" -match '^(\w+)=(.*)$') { $result[$Matches[1]] = $Matches[2] }
    }
    # scp arbeitet per SFTP, und das ist auf Strato ins Home-Verzeichnis eingesperrt: nur relative Pfade.
    if ($result['file'] -match '/(\.mv-pull/mvpull-[0-9a-f]+\.sql\.gz)$') { $remoteDump = $Matches[1] }
    if (!$remoteDump -or $result['exit'] -ne '0' -or [int64] $result['size'] -lt 1000) {
        throw "mysqldump fehlgeschlagen: $($result['error'])"
    }
    Write-Host ("  {0:N1} MB komprimiert" -f ([int64] $result['size'] / 1MB))

    Write-Host "Lade Dump herunter..." -ForegroundColor Cyan
    scp -P $Port $sshOpt "${User}@${Server}:$remoteDump" $localDump
    if ($LASTEXITCODE -ne 0) { throw "Download des Dumps fehlgeschlagen." }
} finally {
    # Der Dump enthaelt Personendaten und bleibt keine Sekunde laenger als noetig auf dem Server.
    if ($remoteStarted) {
        ssh -p $Port $sshOpt "${User}@${Server}" "rm -rf ~/.mv-pull"
        if ($LASTEXITCODE -ne 0) { Write-Host "Warnung: Ordner ~/.mv-pull auf dem Server bitte von Hand loeschen." -ForegroundColor Yellow }
    }
}

try {
    if (!$NoBackup) {
        Write-Host "Sichere bisherigen lokalen Stand..." -ForegroundColor Cyan
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        $backupFile = Join-Path $backupDir "$DbName-lokal-$timestamp.sql.gz"
        # Ueber eine Datei im Container und docker cp: eine Pipe durch PowerShell 5.1 wuerde die Binaerdaten verfaelschen.
        Invoke-DbContainer "mariadb-dump -uroot -p'$DbRootPassword' --single-transaction --default-character-set=utf8mb4 --hex-blob --databases $DbName | gzip > /tmp/mv-backup-$timestamp.sql.gz"
        docker cp "${DbContainer}:/tmp/mv-backup-$timestamp.sql.gz" $backupFile
        if ($LASTEXITCODE -ne 0) { throw "Sicherung konnte nicht aus dem Container kopiert werden." }
        Invoke-DbContainer "rm -f /tmp/mv-backup-$timestamp.sql.gz"
        Write-Host "  $backupFile"
    }

    Write-Host "Spiele Prod-Stand ein..." -ForegroundColor Cyan
    docker cp $localDump "${DbContainer}:$containerDump"
    if ($LASTEXITCODE -ne 0) { throw "Dump konnte nicht in den Container kopiert werden." }
    # Backticks fuer den MariaDB-Benutzernamen; in PowerShell als doppelte Backticks geschrieben.
    Invoke-DbContainer ("mariadb -uroot -p'$DbRootPassword' -e 'DROP DATABASE IF EXISTS $DbName; " +
        "CREATE DATABASE $DbName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; " +
        "GRANT ALL PRIVILEGES ON $DbName.* TO ``$AppDbUser``@``%``;' && " +
        "gzip -dc $containerDump | mariadb --default-character-set=utf8mb4 -uroot -p'$DbRootPassword' $DbName")
} finally {
    docker exec $DbContainer sh -c "rm -f $containerDump"
    if (Test-Path $localDump) { Remove-Item -LiteralPath $localDump -Force }
}

Write-Host "Fertig: lokal jetzt $(Get-MemberCount) Mitglieder aus Prod." -ForegroundColor Green
Write-Host "Anmelden geht ab jetzt mit den Prod-Benutzern und -Passwoertern." -ForegroundColor Green
if (!$NoBackup) {
    Write-Host "Die Sicherung in .db-backups enthaelt Personendaten - nicht mehr benoetigte bitte loeschen." -ForegroundColor Yellow
}
