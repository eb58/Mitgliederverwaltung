<?php
declare(strict_types=1);

$env = static fn(string $name, string $fallback = ''): string => getenv($name) !== false ? (string) getenv($name) : $fallback;

$config = [
    'db' => [
        'host' => $env('MEMBER_DB_HOST', '127.0.0.1'),
        'port' => (int) $env('MEMBER_DB_PORT', '3306'),
        'name' => $env('MEMBER_DB_NAME', 'mitgliederverwaltung'),
        'user' => $env('MEMBER_DB_USER', 'wp_user'),
        'password' => $env('MEMBER_DB_PASSWORD', 'passwd'),
        'charset' => 'utf8mb4',
    ],
    'auth' => [
        'session_ttl_seconds' => (int) $env('MEMBER_API_SESSION_TTL_SECONDS', (string) (12 * 60 * 60)),
    ],
    'cors_origin' => $env('MEMBER_API_CORS_ORIGIN', '*'),
];

$localConfig = __DIR__ . '/config.local.php';
if (is_file($localConfig)) {
    $config = array_replace_recursive($config, require $localConfig);
}

return $config;
