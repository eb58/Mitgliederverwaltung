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
        'session_ttl_seconds' => (int) $env('MEMBER_API_SESSION_TTL_SECONDS', "1800" ), // half an hour
    ],
    'cors_origin' => $env('MEMBER_API_CORS_ORIGIN', '*'),
];

$localConfig = __DIR__ . '/config.local.php';
if (is_file($localConfig)) {
    $config = array_replace_recursive($config, require $localConfig);
}

$environmentDbOverrides = [
    'host' => getenv('MEMBER_DB_HOST') !== false ? (string) getenv('MEMBER_DB_HOST') : null,
    'port' => getenv('MEMBER_DB_PORT') !== false ? (int) getenv('MEMBER_DB_PORT') : null,
    'name' => getenv('MEMBER_DB_NAME') !== false ? (string) getenv('MEMBER_DB_NAME') : null,
    'user' => getenv('MEMBER_DB_USER') !== false ? (string) getenv('MEMBER_DB_USER') : null,
    'password' => getenv('MEMBER_DB_PASSWORD') !== false ? (string) getenv('MEMBER_DB_PASSWORD') : null,
];
$environmentDbOverrides = array_filter(
    $environmentDbOverrides,
    static fn($value): bool => $value !== null && $value !== ''
);
if ($environmentDbOverrides) {
    $config['db'] = array_replace($config['db'], $environmentDbOverrides);
}

return $config;
