<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Dieses Skript darf nur per CLI ausgefuehrt werden.\n");
    exit(1);
}

[$script, $username, $password] = array_pad($argv, 3, null);
if (!$username || !$password) {
    fwrite(STDERR, "Usage: php php-api/create-user.php <username> <password> [role]\n");
    exit(1);
}

$role = normalizeUserRole($argv[3] ?? 'admin');
$pdo = db();
$hash = password_hash((string) $password, PASSWORD_DEFAULT);
$statement = $pdo->prepare(
    "INSERT INTO app_user (username, password_hash, role, active)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       role = VALUES(role),
       active = VALUES(active)"
);
$statement->execute([(string) $username, $hash, $role]);

echo "User {$username} wurde angelegt/aktualisiert.\n";
