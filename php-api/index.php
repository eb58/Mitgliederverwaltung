<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

try {
    sendCorsHeaders();
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        noContent();
    }

    $path = requestPath();
    if ($path === '/health') {
        jsonResponse(['status' => 'ok']);
    }

    if ($path === '/api/session') {
        handleSession();
    }

    $user = requireAuth();
    unset($user);

    if ($path === '/api/members') {
        handleMembersCollection();
    }

    if (preg_match('#^/api/members/(\d+)/photo$#', $path, $matches)) {
        handleMemberPhoto((int) $matches[1]);
    }

    if (preg_match('#^/api/members/(\d+)$#', $path, $matches)) {
        handleMemberResource((int) $matches[1]);
    }

    jsonResponse(['error' => 'Route nicht gefunden.'], 404);
} catch (ApiError $error) {
    jsonResponse(['error' => $error->getMessage()], $error->statusCode);
} catch (Throwable $error) {
    error_log((string) $error);
    jsonResponse(['error' => 'Interner Serverfehler.'], 500);
}
