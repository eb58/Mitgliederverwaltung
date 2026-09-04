<?php
declare(strict_types=1);

final class ApiError extends RuntimeException
{
    public function __construct(string $message, public int $statusCode = 400)
    {
        parent::__construct($message);
    }
}

function config(): array
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }
    return $config;
}

/** Ohne Argument die gemeinsame Verbindung, mit Argument setzen (fuer Tests). */
function db(?PDO $override = null): PDO
{
    static $pdo = null;
    if ($override instanceof PDO) return $pdo = $override;
    if ($pdo instanceof PDO) return $pdo;

    $db = config()['db'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $db['host'],
        $db['port'],
        $db['name'],
        $db['charset']
    );
    $pdo = new PDO($dsn, $db['user'], $db['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function &schemaCache(): array
{
    static $cache = [];
    return $cache;
}

/** Nach einem Schemawechsel noetig, in Tests auch zum Erzwingen eines Neulesens. */
function clearSchemaCache(): void
{
    $cache = &schemaCache();
    $cache = [];
}

function tableHasColumn(string $table, string $column): bool
{
    $cache = &schemaCache();
    $key = 'column:' . $table . '.' . $column;
    if (array_key_exists($key, $cache)) return $cache[$key];

    $statement = db()->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $statement->execute([$table, $column]);
    $cache[$key] = (int) $statement->fetchColumn() > 0;
    return $cache[$key];
}

function tableExists(string $table): bool
{
    $cache = &schemaCache();
    $key = 'table:' . $table;
    if (array_key_exists($key, $cache)) return $cache[$key];

    $statement = db()->prepare(
        'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
    );
    $statement->execute([$table]);
    $cache[$key] = (int) $statement->fetchColumn() > 0;
    return $cache[$key];
}

function sendCorsHeaders(): void
{
    // Leer heisst: nur gleiche Origin. Fremde Origins muss der Betreiber ausdruecklich freigeben.
    $origin = (string) config()['cors_origin'];
    if ($origin !== '') header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS');
    header('Access-Control-Allow-Headers: Authorization,Content-Type,X-Auth-Token,X-File-Name');
}

/**
 * Fertige Antwort eines Handlers. Wird geworfen statt direkt gesendet, damit
 * der Einstiegspunkt sie ausgibt und Tests sie abfangen koennen.
 */
final class ApiResponse extends RuntimeException
{
    public function __construct(
        public mixed $payload = null,
        public int $statusCode = 200,
        public array $headers = [],
        public ?string $rawBody = null
    ) {
        parent::__construct('');
    }
}

function jsonResponse(mixed $payload, int $status = 200): void
{
    throw new ApiResponse($payload, $status, ['Content-Type' => 'application/json; charset=utf-8']);
}

function noContent(): void
{
    throw new ApiResponse(null, 204);
}

function rawResponse(string $body, int $status, array $headers): void
{
    throw new ApiResponse(null, $status, $headers, $body);
}

function errorResponse(string $message, int $status): ApiResponse
{
    return new ApiResponse(['error' => $message], $status, ['Content-Type' => 'application/json; charset=utf-8']);
}

function emitResponse(ApiResponse $response): void
{
    http_response_code($response->statusCode);
    foreach ($response->headers as $name => $value) {
        header($name . ': ' . $value);
    }
    if ($response->rawBody !== null) {
        echo $response->rawBody;
        return;
    }
    if ($response->statusCode !== 204) {
        echo json_encode($response->payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}

function requestPath(): string
{
    if (!empty($_SERVER['PATH_INFO'])) {
        return '/' . ltrim((string) $_SERVER['PATH_INFO'], '/');
    }

    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
    if ($scriptName && str_starts_with($path, $scriptName . '/')) {
        return '/' . ltrim(substr($path, strlen($scriptName)), '/');
    }

    $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    if ($base && $base !== '/' && str_starts_with($path, $base . '/')) {
        $path = substr($path, strlen($base));
    }
    return '/' . ltrim($path, '/');
}

function assertMethodAllowed(string $method, array $allowed): void
{
    if (!in_array($method, $allowed, true)) {
        throw new ApiError('Methode nicht erlaubt.', 405);
    }
}

/**
 * Jeder Handler wirft seine Antwort. Kehrt einer zurueck, fehlt der Zweig fuer eine
 * Methode, die assertMethodAllowed durchgelassen hat - ohne diesen Abschluss fiele
 * die Anfrage still bis zum 404 des Einstiegspunkts durch.
 */
function unhandledMethod(): void
{
    throw new ApiError('Methode wird von diesem Endpunkt nicht behandelt.', 500);
}

function decodeJsonBody(string $raw): array
{
    if ($raw === '') return [];
    $payload = json_decode($raw, true);
    if (!is_array($payload)) {
        throw new ApiError('Ungueltiger JSON-Body.', 400);
    }
    return $payload;
}

/** Ohne Argument der Rohkoerper der Anfrage, mit Argument setzen (fuer Tests, null setzt zurueck). */
function requestBody(?string $override = null): string
{
    static $body = null;
    if (func_num_args() > 0) $body = $override;
    return $body ?? (file_get_contents('php://input') ?: '');
}

function readJsonBody(): array
{
    return decodeJsonBody(requestBody());
}

function clampListLimit(mixed $value, int $default, int $max): int
{
    return min(max((int) ($value ?? $default), 1), $max);
}

function authorizationHeader(): string
{
    foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION', 'REDIRECT_REDIRECT_HTTP_AUTHORIZATION'] as $key) {
        if (!empty($_SERVER[$key])) return (string) $_SERVER[$key];
    }
    if (function_exists('apache_request_headers')) {
        $headers = array_change_key_case(apache_request_headers());
        return (string) ($headers['authorization'] ?? '');
    }
    return '';
}

/**
 * Etliche Hoster reichen den Authorization-Header nicht an PHP durch (FastCGI/CGI
 * entfernt ihn, wenn .htaccess ihn nicht explizit weiterreicht). Der Client sendet
 * das Token deshalb zusaetzlich als X-Auth-Token - der Header kommt immer an.
 */
function bearerToken(): string
{
    return preg_match('/^Bearer\s+(.+)$/i', authorizationHeader(), $matches)
        ? trim($matches[1])
        : trim((string) ($_SERVER['HTTP_X_AUTH_TOKEN'] ?? ''));
}

function base64UrlEncode(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function tokenHash(string $token): string
{
    return hash('sha256', $token);
}

/**
 * Ablaufzeit in SQL berechnen: Bei unterschiedlichen Zeitzonen von PHP und
 * Datenbank waere eine in PHP berechnete Zeit gegenueber NOW() sofort abgelaufen.
 */
function sessionExpiresAtSql(): string
{
    return 'DATE_ADD(NOW(), INTERVAL ' . (int) config()['auth']['session_ttl_seconds'] . ' SECOND)';
}

function createSession(array $user): string
{
    // Der Login ist der einzige regelmaessige Zeitpunkt, an dem ohne Cronjob
    // aufgeraeumt werden kann - sonst waechst die Tabelle unbegrenzt.
    db()->exec('DELETE FROM app_session WHERE expires_at < NOW()');
    $token = base64UrlEncode(random_bytes(32));
    if (tableHasColumn('app_session', 'password_change_required')) {
        $statement = db()->prepare(
            'INSERT INTO app_session (token_hash, user_id, password_change_required, expires_at) VALUES (?, ?, ?, ' . sessionExpiresAtSql() . ')'
        );
        $statement->execute([tokenHash($token), $user['id'], !empty($user['passwordChangeRequired']) ? 1 : 0]);
        return $token;
    }

    $statement = db()->prepare('INSERT INTO app_session (token_hash, user_id, expires_at) VALUES (?, ?, ' . sessionExpiresAtSql() . ')');
    $statement->execute([tokenHash($token), $user['id']]);
    return $token;
}

function requireAuth(): array
{
    $token = bearerToken();
    if ($token === '') {
        throw new ApiError('Anmeldung erforderlich.', 401);
    }

    $hasSessionPasswordChangeFlag = tableHasColumn('app_session', 'password_change_required');
    $sessionFlagSelect = $hasSessionPasswordChangeFlag ? ', s.password_change_required' : '';
    $statement = db()->prepare(
        "SELECT u.id, u.username, u.password_hash, u.role{$sessionFlagSelect}
         FROM app_session s
         JOIN app_user u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.active = 1"
    );
    $statement->execute([tokenHash($token)]);
    $user = $statement->fetch();
    if (!$user) {
        throw new ApiError('Anmeldung erforderlich.', 401);
    }

    db()->prepare('UPDATE app_session SET expires_at = ' . sessionExpiresAtSql() . ' WHERE token_hash = ?')
        ->execute([tokenHash($token)]);
    return [
        'id' => (int) $user['id'],
        'username' => $user['username'],
        'role' => $user['role'],
        // Bcrypt-Prüfung pro Request vermeiden: Flag wurde beim Login gesetzt,
        // nur ein zwischenzeitlich geleertes Passwort muss noch erkannt werden.
        'passwordChangeRequired' => $hasSessionPasswordChangeFlag
            ? ((bool) $user['password_change_required'] || isPasswordUnset($user['password_hash']))
            : isPasswordChangeRequiredForUser($user),
    ];
}

function requireAdmin(array $user): void
{
    if (($user['role'] ?? '') !== 'admin') {
        throw new ApiError('Administratorrechte erforderlich.', 403);
    }
}

/** Ohne ausdrueckliche Angabe die schwaechere Rolle - Admin muss man wollen. */
function normalizeUserRole(mixed $role, string $fallback = 'user'): string
{
    $value = trim((string) ($role ?: $fallback)) ?: $fallback;
    if (!in_array($value, ['admin', 'user'], true)) {
        throw new ApiError('Ungueltige Benutzerrolle.', 400);
    }
    return $value;
}

function isPasswordUnset(mixed $passwordHash): bool
{
    return trim((string) $passwordHash) === '';
}

function valuesMatchIgnoringCase(mixed $left, mixed $right): bool
{
    $leftValue = (string) $left;
    $rightValue = (string) $right;
    if (function_exists('mb_strtolower')) {
        return mb_strtolower($leftValue, 'UTF-8') === mb_strtolower($rightValue, 'UTF-8');
    }
    return strtolower($leftValue) === strtolower($rightValue);
}

function stringCaseVariants(string $value): array
{
    $variants = [$value, strtolower($value), strtoupper($value)];
    if (function_exists('mb_strtolower')) {
        $variants[] = mb_strtolower($value, 'UTF-8');
        $variants[] = mb_strtoupper($value, 'UTF-8');
    }
    return array_values(array_unique($variants));
}

function isPasswordChangeRequiredForUser(array $user, ?string $password = null): bool
{
    $passwordHash = (string) ($user['password_hash'] ?? '');
    if (isPasswordUnset($passwordHash)) {
        return true;
    }

    $username = (string) ($user['username'] ?? '');
    if ($password !== null) {
        return valuesMatchIgnoringCase($username, $password);
    }

    foreach (stringCaseVariants($username) as $candidate) {
        if ($candidate !== '' && password_verify($candidate, $passwordHash)) {
            return true;
        }
    }
    return false;
}

const LOGIN_ATTEMPT_WINDOW_SECONDS = 900;
const LOGIN_ATTEMPT_LIMIT_USERNAME = 10;
// Hoeher als je Benutzer: hinter einem gemeinsamen Anschluss melden sich mehrere Leute an.
const LOGIN_ATTEMPT_LIMIT_IP = 30;

/**
 * Vergleichswert fuer unbekannte Benutzer. Ohne ihn verriete die Antwortzeit, welche
 * Benutzernamen existieren - nur bei denen liefe ueberhaupt ein password_verify.
 */
const DUMMY_PASSWORD_HASH = '$2y$12$vBbLwCGvEkOGafHfuipgEeJMY.Qno4b7ifC9pwULufHJks1kVVxle';

function clientIp(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

/** Ohne die Tabelle laeuft der Login ungedrosselt weiter - eine fehlende Migration darf niemanden aussperren. */
function loginThrottlingAvailable(): bool
{
    return tableExists('app_login_attempt');
}

function assertLoginAllowed(string $username, string $ip): void
{
    if (!loginThrottlingAvailable()) return;
    $statement = db()->prepare(
        "SELECT COALESCE(SUM(username = ?), 0) AS by_username, COALESCE(SUM(ip = ? AND ip <> ''), 0) AS by_ip
         FROM app_login_attempt
         WHERE attempted_at > DATE_SUB(NOW(), INTERVAL " . LOGIN_ATTEMPT_WINDOW_SECONDS . " SECOND)"
    );
    $statement->execute([$username, $ip]);
    $failures = $statement->fetch();
    if ((int) $failures['by_username'] >= LOGIN_ATTEMPT_LIMIT_USERNAME || (int) $failures['by_ip'] >= LOGIN_ATTEMPT_LIMIT_IP) {
        throw new ApiError('Zu viele Fehlversuche. Bitte in einigen Minuten erneut versuchen.', 429);
    }
}

function recordLoginFailure(string $username, string $ip): void
{
    if (!loginThrottlingAvailable()) return;
    db()->prepare('INSERT INTO app_login_attempt (username, ip) VALUES (?, ?)')->execute([$username, $ip]);
}

/** Raeumt nebenbei die abgelaufenen Versuche weg - ein erfolgreicher Login ist der passende Anlass. */
function clearLoginFailures(string $username, string $ip): void
{
    if (!loginThrottlingAvailable()) return;
    db()->prepare(
        "DELETE FROM app_login_attempt
         WHERE username = ? OR (ip = ? AND ip <> '')
            OR attempted_at <= DATE_SUB(NOW(), INTERVAL " . LOGIN_ATTEMPT_WINDOW_SECONDS . " SECOND)"
    )->execute([$username, $ip]);
}

function verifyLoginPassword(mixed $user, string $password): bool
{
    if (!is_array($user)) {
        password_verify($password, DUMMY_PASSWORD_HASH);
        return false;
    }
    $passwordHash = (string) ($user['password_hash'] ?? '');
    return isPasswordUnset($passwordHash) ? $password === '' : password_verify($password, $passwordHash);
}

function handleSession(): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['POST', 'GET', 'DELETE']);
    if ($method === 'POST') {
        $body = readJsonBody();
        $username = (string) ($body['username'] ?? '');
        $password = (string) ($body['password'] ?? '');
        $ip = clientIp();
        assertLoginAllowed($username, $ip);
        $statement = db()->prepare('SELECT id, username, password_hash, role, active FROM app_user WHERE username = ?');
        $statement->execute([$username]);
        $user = $statement->fetch();
        if (!verifyLoginPassword($user, $password) || !(bool) $user['active']) {
            recordLoginFailure($username, $ip);
            throw new ApiError('Benutzername oder Passwort ist falsch.', 401);
        }
        clearLoginFailures($username, $ip);
        $publicUser = [
            'id' => (int) $user['id'],
            'username' => $user['username'],
            'role' => $user['role'],
            'passwordChangeRequired' => isPasswordChangeRequiredForUser($user, $password),
        ];
        jsonResponse(['token' => createSession($publicUser), 'user' => $publicUser]);
    }

    if ($method === 'GET') {
        jsonResponse(['user' => requireAuth()]);
    }

    if ($method === 'DELETE') {
        $token = bearerToken();
        if ($token !== '') {
            db()->prepare('DELETE FROM app_session WHERE token_hash = ?')->execute([tokenHash($token)]);
        }
        noContent();
    }
    unhandledMethod();
}

/**
 * Ein erzwungener Wechsel hat kein gueltiges altes Passwort, das man abfragen koennte.
 * Sonst schuetzt die Abfrage davor, dass ein entwendetes Token das Konto dauerhaft
 * uebernimmt - das blosse Token reicht dann nicht mehr aus.
 */
function assertCurrentPassword(int $userId, string $password): void
{
    $statement = db()->prepare('SELECT password_hash FROM app_user WHERE id = ?');
    $statement->execute([$userId]);
    $passwordHash = (string) $statement->fetchColumn();
    if (isPasswordUnset($passwordHash) ? $password !== '' : !password_verify($password, $passwordHash)) {
        throw new ApiError('Das aktuelle Passwort ist falsch.', 403);
    }
}

function handleSessionPassword(array $currentUser): void
{
    assertMethodAllowed($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'PATCH']);

    $body = readJsonBody();
    $password = (string) ($body['password'] ?? $body['newPassword'] ?? '');
    if ($password === '') {
        throw new ApiError('Passwort ist erforderlich.', 400);
    }
    if (valuesMatchIgnoringCase($currentUser['username'] ?? '', $password)) {
        throw new ApiError('Das neue Passwort darf nicht dem Benutzernamen entsprechen.', 400);
    }
    $userId = (int) $currentUser['id'];
    if (!($currentUser['passwordChangeRequired'] ?? false)) {
        assertCurrentPassword($userId, (string) ($body['currentPassword'] ?? $body['oldPassword'] ?? ''));
    }

    $statement = db()->prepare('UPDATE app_user SET password_hash = ? WHERE id = ?');
    $statement->execute([password_hash($password, PASSWORD_DEFAULT), $userId]);
    $token = bearerToken();
    // Ein gestohlenes Token soll den Wechsel nicht ueberleben.
    db()->prepare('DELETE FROM app_session WHERE user_id = ? AND token_hash <> ?')->execute([$userId, tokenHash($token)]);
    if ($token !== '' && tableHasColumn('app_session', 'password_change_required')) {
        db()->prepare('UPDATE app_session SET password_change_required = 0 WHERE token_hash = ?')->execute([tokenHash($token)]);
    }
    jsonResponse([
        'user' => [
            'id' => (int) $currentUser['id'],
            'username' => $currentUser['username'],
            'role' => $currentUser['role'],
            'passwordChangeRequired' => false,
        ],
    ]);
}

function publicUser(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'username' => $user['username'],
        'role' => $user['role'],
        'active' => (bool) $user['active'],
    ];
}

function handleUsersCollection(array $currentUser): void
{
    requireAdmin($currentUser);
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'POST']);

    if ($method === 'GET') {
        $rows = db()->query('SELECT id, username, role, active FROM app_user ORDER BY username')->fetchAll();
        jsonResponse(['users' => array_map('publicUser', $rows)]);
    }

    if ($method === 'POST') {
        $body = readJsonBody();
        $username = trim((string) ($body['username'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        $role = normalizeUserRole($body['role'] ?? null);
        $active = array_key_exists('active', $body) ? (bool) $body['active'] : true;
        if ($username === '' || $password === '') {
            throw new ApiError('Benutzername und Passwort sind erforderlich.', 400);
        }
        $statement = db()->prepare(
            "INSERT INTO app_user (username, password_hash, role, active)
             VALUES (?, ?, ?, ?)"
        );
        $statement->execute([$username, password_hash($password, PASSWORD_DEFAULT), $role, $active ? 1 : 0]);
        $id = (int) db()->lastInsertId();
        jsonResponse(['user' => findUserById($id)], 201);
    }
    unhandledMethod();
}

function findUserById(int $id): ?array
{
    $statement = db()->prepare('SELECT id, username, role, active FROM app_user WHERE id = ?');
    $statement->execute([$id]);
    $user = $statement->fetch();
    return $user ? publicUser($user) : null;
}

function assertUserStaysUsable(array $currentUser, int $id, string $role, bool $active): void
{
    if ($id !== (int) $currentUser['id']) return;
    if (!$active) {
        throw new ApiError('Der eigene Benutzer kann nicht deaktiviert werden.', 400);
    }
    if ($role !== 'admin') {
        throw new ApiError('Der eigene Benutzer muss Admin bleiben.', 400);
    }
}

function handleUserResource(array $currentUser, int $id): void
{
    requireAdmin($currentUser);
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['PUT', 'PATCH', 'DELETE']);

    if ($method === 'PUT' || $method === 'PATCH') {
        $existing = findUserById($id);
        if (!$existing) throw new ApiError('Benutzer nicht gefunden.', 404);
        $body = readJsonBody();
        $role = normalizeUserRole($body['role'] ?? $existing['role']);
        $active = array_key_exists('active', $body) ? (bool) $body['active'] : (bool) $existing['active'];
        assertUserStaysUsable($currentUser, $id, $role, $active);

        $password = (string) ($body['password'] ?? '');
        if ($password !== '') {
            $statement = db()->prepare('UPDATE app_user SET role = ?, active = ?, password_hash = ? WHERE id = ?');
            $statement->execute([$role, $active ? 1 : 0, password_hash($password, PASSWORD_DEFAULT), $id]);
        } else {
            $statement = db()->prepare('UPDATE app_user SET role = ?, active = ? WHERE id = ?');
            $statement->execute([$role, $active ? 1 : 0, $id]);
        }
        jsonResponse(['user' => findUserById($id)]);
    }

    if ($method === 'DELETE') {
        if ($id === (int) $currentUser['id']) {
            throw new ApiError('Der eigene Benutzer kann nicht deaktiviert werden.', 400);
        }
        $statement = db()->prepare('UPDATE app_user SET active = 0 WHERE id = ?');
        $statement->execute([$id]);
        if ($statement->rowCount() === 0) throw new ApiError('Benutzer nicht gefunden.', 404);
        noContent();
    }
    unhandledMethod();
}

function referenceDefinitions(): array
{
    return [
        'interest-groups' => ['table' => 'interessengruppe', 'column' => 'bezeichnung', 'listKey' => 'interestGroups', 'labelKey' => 'label'],
        'functions' => ['table' => 'funktion', 'column' => 'bezeichnung', 'listKey' => 'functions', 'labelKey' => 'label'],
        'exit-reasons' => ['table' => 'austrittsgrund', 'column' => 'bezeichnung', 'listKey' => 'exitReasons', 'labelKey' => 'label'],
        'senior-clubs' => ['table' => 'seniorenclub', 'column' => 'name', 'listKey' => 'seniorClubs', 'labelKey' => 'name'],
    ];
}

function referenceDefinition(string $type): array
{
    $definitions = referenceDefinitions();
    if (!isset($definitions[$type])) {
        throw new ApiError('Unbekannte Stammdatenart.', 404);
    }
    return $definitions[$type];
}

function listReferenceItems(string $type, bool $includeInactive = false): array
{
    $definition = referenceDefinition($type);
    $hasActiveColumn = tableHasColumn($definition['table'], 'active');
    $activeSelect = $hasActiveColumn ? 'active' : '1 AS active';
    $where = $includeInactive || !$hasActiveColumn ? '' : ' WHERE active = 1';
    $statement = db()->query("SELECT id, {$definition['column']} AS label, {$activeSelect} FROM {$definition['table']}{$where} ORDER BY id");
    return array_map(static fn(array $row): array => [
        'id' => (int) $row['id'],
        $definition['labelKey'] => $row['label'],
        'label' => $row['label'],
        'active' => (bool) $row['active'],
    ], $statement->fetchAll());
}

function handleReferenceDataOverview(): void
{
    assertMethodAllowed($_SERVER['REQUEST_METHOD'], ['GET']);
    $payload = [];
    foreach (referenceDefinitions() as $type => $definition) {
        $payload[$definition['listKey']] = listReferenceItems($type);
    }
    jsonResponse($payload);
}

function parseReferenceItemPayload(array $body): array
{
    $id = (int) ($body['id'] ?? 0);
    $label = trim((string) ($body['label'] ?? $body['name'] ?? ''));
    if ($id <= 0 || $label === '') {
        throw new ApiError('ID und Bezeichnung sind erforderlich.', 400);
    }
    return ['id' => $id, 'label' => $label];
}

function readReferenceItemPayload(): array
{
    return parseReferenceItemPayload(readJsonBody());
}

function parseReferenceLabel(array $body): string
{
    $label = trim((string) ($body['label'] ?? $body['name'] ?? ''));
    if ($label === '') {
        throw new ApiError('Bezeichnung ist erforderlich.', 400);
    }
    return $label;
}

function handleReferenceDataCollection(array $currentUser, string $type): void
{
    $definition = referenceDefinition($type);
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'POST']);
    if ($method === 'GET') {
        requireAdmin($currentUser);
        jsonResponse(['items' => listReferenceItems($type, true)]);
    }
    if ($method === 'POST') {
        requireAdmin($currentUser);
        $item = readReferenceItemPayload();
        $hasActiveColumn = tableHasColumn($definition['table'], 'active');
        $statement = db()->prepare($hasActiveColumn
            ? "INSERT INTO {$definition['table']} (id, {$definition['column']}, active)
               VALUES (?, ?, 1)
               ON DUPLICATE KEY UPDATE {$definition['column']} = VALUES({$definition['column']}), active = 1"
            : "INSERT INTO {$definition['table']} (id, {$definition['column']})
               VALUES (?, ?)
               ON DUPLICATE KEY UPDATE {$definition['column']} = VALUES({$definition['column']})"
        );
        $statement->execute([$item['id'], $item['label']]);
        jsonResponse(['item' => $item + ['active' => true]], 201);
    }
    unhandledMethod();
}

function handleReferenceDataResource(array $currentUser, string $type, int $id): void
{
    $definition = referenceDefinition($type);
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['PUT', 'PATCH', 'DELETE']);
    if ($method === 'PUT' || $method === 'PATCH') {
        requireAdmin($currentUser);
        $hasActiveColumn = tableHasColumn($definition['table'], 'active');
        $body = readJsonBody();
        $label = parseReferenceLabel($body);
        $activeSelect = $hasActiveColumn ? 'active' : '1 AS active';
        $exists = db()->prepare("SELECT id, {$activeSelect} FROM {$definition['table']} WHERE id = ?");
        $exists->execute([$id]);
        $existing = $exists->fetch();
        if (!$existing) {
            throw new ApiError('Stammdatensatz nicht gefunden.', 404);
        }
        $hasActive = $hasActiveColumn && array_key_exists('active', $body);
        $statement = db()->prepare("UPDATE {$definition['table']} SET {$definition['column']} = ?" . ($hasActive ? ', active = ?' : '') . " WHERE id = ?");
        $values = $hasActive ? [$label, (bool) $body['active'] ? 1 : 0, $id] : [$label, $id];
        $statement->execute($values);
        jsonResponse(['item' => ['id' => $id, 'label' => $label, 'active' => $hasActive ? (bool) $body['active'] : (bool) $existing['active']]]);
    }
    if ($method === 'DELETE') {
        requireAdmin($currentUser);
        if (!tableHasColumn($definition['table'], 'active')) {
            throw new ApiError('Stammdaten koennen erst deaktiviert werden, wenn die active-Spalten importiert wurden.', 409);
        }
        $statement = db()->prepare("UPDATE {$definition['table']} SET active = 0 WHERE id = ?");
        $statement->execute([$id]);
        if ($statement->rowCount() === 0) {
            throw new ApiError('Stammdatensatz nicht gefunden.', 404);
        }
        noContent();
    }
    unhandledMethod();
}

function mainMemberFields(): array
{
    return [
        'id' => 'id',
        'name' => 'name',
        'vorname' => 'vorname',
        'geschlecht' => 'geschlecht',
        'passbild' => 'passbild',
        'strasse' => 'strasse',
        'plz' => 'plz',
        'ort' => 'ort',
        'telefon' => 'telefon',
        'handy' => 'handy',
        'email' => 'email',
        'geburtstag' => 'geburtstag',
        'eintrittsdatum' => 'eintrittsdatum',
        'austrittsdatum' => 'austrittsdatum',
        'austrittsgrund' => 'austrittsgrund_id',
        'gruppenwahl' => 'gruppenwahl',
        'funktion' => 'funktion_rohdaten',
        'auswahl' => 'auswahl',
        'ausweisErteilt' => 'ausweis_erteilt',
        'clubzugehoerigkeit' => 'clubzugehoerigkeit_id',
        'beitragClubBezahlt' => 'beitrag_club_bezahlt',
        'betragClubBar' => 'betrag_club_bar',
        'beitragComputerBezahlt' => 'beitrag_computer_bezahlt',
        'betragComputerBar' => 'betrag_computer_bar',
        'gezahlterBetragClub' => 'gezahlter_betrag_club',
        'einzahlungClubAm' => 'einzahlung_club_am',
        'gezahlterBetragComputer' => 'gezahlter_betrag_computer',
        'einzahlungComputerAm' => 'einzahlung_computer_am',
        'bemerkung' => 'bemerkung',
    ];
}

function weihnachtsessenFields(): array
{
    return [
        'weihnachtsessen' => 'weihnachtsessen',
        'wnEssenBezahlt' => 'wn_essen_bezahlt',
        'gezahlterBetragWeihnachten' => 'gezahlter_betrag_weihnachten',
        'tischnummer' => 'tischnummer',
    ];
}

/** Gemeinsame API-Sicht auf die Haupt- und Weihnachtsessen-Tabelle. */
function memberApiFields(): array
{
    return array_merge(mainMemberFields(), weihnachtsessenFields());
}

function booleanFields(): array
{
    return ['auswahl', 'ausweisErteilt', 'wnEssenBezahlt', 'beitragClubBezahlt', 'beitragComputerBezahlt'];
}

function dateFields(): array
{
    return ['geburtstag', 'eintrittsdatum', 'austrittsdatum', 'einzahlungClubAm', 'einzahlungComputerAm'];
}

function numberFields(): array
{
    return [
        'id',
        'austrittsgrund',
        'clubzugehoerigkeit',
        'weihnachtsessen',
        'betragClubBar',
        'betragComputerBar',
        'gezahlterBetragClub',
        'gezahlterBetragComputer',
        'gezahlterBetragWeihnachten',
        'tischnummer',
    ];
}

function normalizeIds(mixed $values): array
{
    if (!is_array($values)) return [];
    $ids = array_values(array_unique(array_map('intval', $values)));
    return array_values(array_filter($ids, static fn(int $id): bool => $id > 0));
}

function normalizeFunctionIds(mixed $value): array
{
    return array_values(array_filter(array_map('intval', array_map('trim', explode(';', (string) $value))), static fn(int $id): bool => $id > 0));
}

function normalizeMemberInput(array $payload, bool $partial = false): array
{
    $member = [];
    $nullableNumbers = ['austrittsgrund' => true, 'clubzugehoerigkeit' => true];
    foreach (memberApiFields() as $jsonKey => $_column) {
        if ($partial && !array_key_exists($jsonKey, $payload)) continue;
        $value = $payload[$jsonKey] ?? null;
        if (in_array($jsonKey, booleanFields(), true)) {
            $member[$jsonKey] = in_array($value, [true, 1, '1'], true) ? 1 : 0;
        } elseif (in_array($jsonKey, dateFields(), true)) {
            $member[$jsonKey] = $value === '' || $value === null ? null : substr((string) $value, 0, 10);
        } elseif (in_array($jsonKey, numberFields(), true)) {
            $number = $value === '' || $value === null ? null : (float) $value;
            $member[$jsonKey] = isset($nullableNumbers[$jsonKey])
                ? ($number && $number > 0 ? $number : null)
                : ($number ?: 0);
        } else {
            $member[$jsonKey] = $value === null ? '' : (string) $value;
        }
    }

    if (!$partial || array_key_exists('interessengruppen', $payload)) {
        $member['interessengruppen'] = normalizeIds($payload['interessengruppen'] ?? []);
    }
    if (!$partial || array_key_exists('funktionen', $payload) || array_key_exists('funktion', $payload)) {
        $member['funktionen'] = array_key_exists('funktionen', $payload)
            ? normalizeIds($payload['funktionen'])
            : normalizeFunctionIds($payload['funktion'] ?? '');
    }
    return $member;
}

function assertKnownFields(array $payload): void
{
    $allowed = array_fill_keys(array_merge(array_keys(memberApiFields()), ['interessengruppen', 'funktionen']), true);
    $unknown = array_values(array_filter(array_keys($payload), static fn(string $key): bool => !isset($allowed[$key])));
    if ($unknown) {
        throw new ApiError('Unbekannte Felder: ' . implode(', ', $unknown), 400);
    }
}

function assertValidMember(array $member): void
{
    if (($member['name'] ?? '') === '' || ($member['vorname'] ?? '') === '') {
        throw new ApiError('name und vorname sind Pflichtfelder.', 400);
    }
    if (!in_array($member['geschlecht'] ?? '', ['m', 'w'], true)) {
        throw new ApiError("geschlecht muss 'm' oder 'w' sein.", 400);
    }
}

function baseSelect(): string
{
    return "SELECT m.*,
      COALESCE(mw.weihnachtsessen, 0) AS weihnachtsessen,
      COALESCE(mw.wn_essen_bezahlt, 0) AS wn_essen_bezahlt,
      COALESCE(mw.gezahlter_betrag_weihnachten, 0.00) AS gezahlter_betrag_weihnachten,
      COALESCE(mw.tischnummer, 0) AS tischnummer,
      (SELECT GROUP_CONCAT(mi.interessengruppe_id ORDER BY mi.interessengruppe_id)
       FROM mitglied_interessengruppe mi WHERE mi.mitglied_id = m.id) AS interessengruppen,
      (SELECT GROUP_CONCAT(mf.funktion_id ORDER BY mf.funktion_id)
       FROM mitglied_funktion mf WHERE mf.mitglied_id = m.id) AS funktionen,
      EXISTS (SELECT 1 FROM mitglied_passbild mp WHERE mp.mitglied_id = m.id) AS has_passbild_in_db
      FROM mitglied m
      LEFT JOIN mitglied_weihnachtsessen mw ON mw.mitglied_id = m.id";
}

function rowToMember(array $row): array
{
    $member = [];
    foreach (memberApiFields() as $jsonKey => $column) {
        $value = $row[$column] ?? null;
        if (in_array($jsonKey, booleanFields(), true)) {
            $member[$jsonKey] = (bool) $value;
        } elseif (in_array($jsonKey, dateFields(), true)) {
            $member[$jsonKey] = $value ? substr((string) $value, 0, 10) : null;
        } elseif (in_array($jsonKey, numberFields(), true)) {
            $member[$jsonKey] = $value === null ? null : (float) $value;
        } else {
            $member[$jsonKey] = $value === null ? '' : $value;
        }
    }
    $member['interessengruppen'] = ($row['interessengruppen'] ?? '') !== '' ? array_map('intval', explode(',', (string) $row['interessengruppen'])) : [];
    $member['funktionen'] = ($row['funktionen'] ?? '') !== '' ? array_map('intval', explode(',', (string) $row['funktionen'])) : [];
    $member['hasPassbildInDb'] = (bool) ($row['has_passbild_in_db'] ?? false);
    return $member;
}

function findMemberById(int $id): ?array
{
    $statement = db()->prepare(baseSelect() . ' WHERE m.id = ?');
    $statement->execute([$id]);
    $row = $statement->fetch();
    return $row ? rowToMember($row) : null;
}

function memberAuditLabels(): array
{
    return [
        'name' => 'Name',
        'vorname' => 'Vorname',
        'geschlecht' => 'Geschlecht',
        'strasse' => 'Strasse',
        'plz' => 'PLZ',
        'ort' => 'Ort',
        'telefon' => 'Telefon',
        'handy' => 'Handy',
        'email' => 'Email',
        'geburtstag' => 'Geburtstag',
        'eintrittsdatum' => 'Eintrittsdatum',
        'austrittsdatum' => 'Austrittsdatum',
        'austrittsgrund' => 'Austrittsgrund',
        'gruppenwahl' => 'Gruppenwahl',
        'funktion' => 'Funktion',
        'auswahl' => 'Auswahl',
        'ausweisErteilt' => 'Ausweis erteilt',
        'clubzugehoerigkeit' => 'Clubzugehoerigkeit',
        'weihnachtsessen' => 'Weihnachtsessen',
        'wnEssenBezahlt' => 'Weihnachtsessen bezahlt',
        'beitragClubBezahlt' => 'Beitrag Club bezahlt',
        'betragClubBar' => 'Betrag Club bar',
        'beitragComputerBezahlt' => 'Beitrag Computer bezahlt',
        'betragComputerBar' => 'Beitrag Computer bar',
        'gezahlterBetragClub' => 'Gezahlter Betrag Club',
        'einzahlungClubAm' => 'Einzahlung Club am',
        'gezahlterBetragComputer' => 'Gezahlter Betrag Computer',
        'einzahlungComputerAm' => 'Einzahlung Computer am',
        'gezahlterBetragWeihnachten' => 'Gezahlter Betrag Weihnachten',
        'bemerkung' => 'Bemerkung',
        'tischnummer' => 'Tischnummer',
        'interessengruppen' => 'Interessengruppen',
        'funktionen' => 'Funktionen',
        'passbild' => 'Passbild',
    ];
}

function referenceNameMap(string $table): array
{
    $labelColumn = $table === 'seniorenclub' ? 'name' : 'bezeichnung';
    $statement = db()->query("SELECT id, {$labelColumn} AS label FROM {$table}");
    $rows = $statement->fetchAll();
    $map = [];
    foreach ($rows as $row) {
        $map[(int) $row['id']] = (string) $row['label'];
    }
    return $map;
}

function formatReferenceValue(mixed $value, array $map): string
{
    $id = (int) $value;
    return $id > 0 ? ($map[$id] ?? (string) $id) : '';
}

function formatReferenceListValue(mixed $value, array $map): string
{
    $ids = is_array($value) ? $value : [];
    $labels = array_map(static fn(mixed $id): string => $map[(int) $id] ?? (string) $id, $ids);
    return implode(', ', $labels);
}

function formatAuditValue(string $field, mixed $value): string
{
    if ($value === null || $value === '') return '';
    if (in_array($field, booleanFields(), true)) return $value ? 'Ja' : 'Nein';
    if ($field === 'geschlecht') return $value === 'm' ? 'maennlich' : ($value === 'w' ? 'weiblich' : (string) $value);
    if ($field === 'austrittsgrund') return formatReferenceValue($value, referenceNameMap('austrittsgrund'));
    if ($field === 'clubzugehoerigkeit') return formatReferenceValue($value, referenceNameMap('seniorenclub'));
    if ($field === 'weihnachtsessen') {
        $labels = [0 => 'Nein', 1 => 'Ja', 2 => 'Ja + Gast'];
        return $labels[(int) $value] ?? (string) $value;
    }
    if ($field === 'interessengruppen') return formatReferenceListValue($value, referenceNameMap('interessengruppe'));
    if ($field === 'funktionen') return formatReferenceListValue($value, referenceNameMap('funktion'));
    return (string) $value;
}

function normalizedAuditValue(string $field, mixed $value): mixed
{
    if (is_array($value)) {
        $ids = array_map('intval', $value);
        sort($ids);
        return $ids;
    }
    if (in_array($field, booleanFields(), true)) return (bool) $value;
    if (in_array($field, ['austrittsgrund', 'clubzugehoerigkeit'], true)) {
        $id = (int) $value;
        return $id > 0 ? $id : null;
    }
    if (in_array($field, numberFields(), true)) return $value === null || $value === '' ? null : (float) $value;
    return $value === null ? '' : (string) $value;
}

function buildMemberAuditChanges(array $before, array $after): array
{
    $labels = memberAuditLabels();
    $fields = array_merge(array_keys(memberApiFields()), ['interessengruppen', 'funktionen']);
    $changes = [];
    foreach ($fields as $field) {
        if (in_array($field, ['id', 'funktion', 'passbild'], true)) continue;
        $oldRaw = $before[$field] ?? null;
        $newRaw = $after[$field] ?? null;
        if (normalizedAuditValue($field, $oldRaw) === normalizedAuditValue($field, $newRaw)) continue;
        $old = formatAuditValue($field, $oldRaw);
        $new = formatAuditValue($field, $newRaw);
        if ($old === $new) continue;
        $changes[] = [
            'field' => $field,
            'label' => $labels[$field] ?? $field,
            'old' => $old,
            'new' => $new,
        ];
    }
    return $changes;
}

function auditMemberChange(int $memberId, string $action, array $changes, array $user): void
{
    if (!tableExists('mitglied_aenderung')) return;
    $statement = db()->prepare(
        'INSERT INTO mitglied_aenderung (mitglied_id, aktion, geaendert_von_user_id, geaendert_von_name, aenderungen_json)
         VALUES (?, ?, ?, ?, ?)'
    );
    $statement->execute([
        $memberId,
        $action,
        (int) ($user['id'] ?? 0) ?: null,
        (string) ($user['username'] ?? ''),
        json_encode($changes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);
}

function handleMemberChanges(int $id): void
{
    assertMethodAllowed($_SERVER['REQUEST_METHOD'], ['GET']);
    if (!findMemberById($id)) throw new ApiError('Mitglied nicht gefunden.', 404);
    if (!tableExists('mitglied_aenderung')) {
        jsonResponse(['changes' => []]);
    }

    $statement = db()->prepare(
        'SELECT id, mitglied_id, aktion, geaendert_am, geaendert_von_user_id, geaendert_von_name, aenderungen_json
         FROM mitglied_aenderung
         WHERE mitglied_id = ?
         ORDER BY geaendert_am DESC, id DESC
         LIMIT 100'
    );
    $statement->execute([$id]);
    $changes = array_map(static function (array $row): array {
        return [
            'id' => (int) $row['id'],
            'memberId' => (int) $row['mitglied_id'],
            'action' => $row['aktion'],
            'changedAt' => $row['geaendert_am'],
            'changedByUserId' => $row['geaendert_von_user_id'] === null ? null : (int) $row['geaendert_von_user_id'],
            'changedByName' => $row['geaendert_von_name'],
            'changes' => json_decode((string) $row['aenderungen_json'], true) ?: [],
        ];
    }, $statement->fetchAll());
    jsonResponse(['changes' => $changes]);
}

function memberChangeRowToApi(array $row): array
{
    $memberName = trim((string) ($row['vorname'] ?? '') . ' ' . (string) ($row['name'] ?? ''));
    return [
        'id' => (int) $row['id'],
        'memberId' => (int) $row['mitglied_id'],
        'memberName' => $memberName,
        'memberExists' => $row['mitglied_existiert'] !== null,
        'action' => $row['aktion'],
        'changedAt' => $row['geaendert_am'],
        'changedByUserId' => $row['geaendert_von_user_id'] === null ? null : (int) $row['geaendert_von_user_id'],
        'changedByName' => $row['geaendert_von_name'],
        'changes' => json_decode((string) $row['aenderungen_json'], true) ?: [],
    ];
}

function handleRecentMemberChanges(): void
{
    assertMethodAllowed($_SERVER['REQUEST_METHOD'], ['GET']);
    if (!tableExists('mitglied_aenderung')) {
        jsonResponse(['changes' => []]);
    }

    $limit = clampListLimit($_GET['limit'] ?? null, 100, 200);
    $statement = db()->prepare(
        'SELECT a.id, a.mitglied_id, a.aktion, a.geaendert_am, a.geaendert_von_user_id, a.geaendert_von_name,
                a.aenderungen_json, m.id AS mitglied_existiert, m.name, m.vorname
         FROM mitglied_aenderung a
         LEFT JOIN mitglied m ON m.id = a.mitglied_id
         ORDER BY a.geaendert_am DESC, a.id DESC
         LIMIT ?'
    );
    $statement->bindValue(1, $limit, PDO::PARAM_INT);
    $statement->execute();
    jsonResponse(['changes' => array_map('memberChangeRowToApi', $statement->fetchAll())]);
}

function buildMemberSearchFilter(mixed $search): array
{
    $term = trim((string) ($search ?? ''));
    if ($term === '') return ['where' => '', 'params' => []];
    $value = '%' . $term . '%';
    return [
        'where' => ' WHERE (m.name LIKE ? OR m.vorname LIKE ? OR m.email LIKE ? OR m.telefon LIKE ? OR m.handy LIKE ?)',
        'params' => array_fill(0, 5, $value),
    ];
}

/** mitglied.id ist keine AUTO_INCREMENT-Spalte, die naechste freie ID muss also gesucht werden. */
function nextFreeMemberId(): int
{
    return (int) db()->query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM mitglied')->fetch()['next_id'];
}

/** 1062 ist ER_DUP_ENTRY - SQLSTATE 23000 allein traefe auch Fremdschluesselverletzungen. */
function isDuplicateKeyError(Throwable $error): bool
{
    return $error instanceof PDOException && (int) ($error->errorInfo[1] ?? 0) === 1062;
}

function insertMemberInTransaction(array $member, array $currentUser): void
{
    $id = (int) $member['id'];
    db()->beginTransaction();
    try {
        insertMember($member);
        syncJoinTable('mitglied_interessengruppe', 'interessengruppe_id', $id, $member['interessengruppen']);
        syncJoinTable('mitglied_funktion', 'funktion_id', $id, $member['funktionen']);
        auditMemberChange($id, 'created', [], $currentUser);
        db()->commit();
    } catch (Throwable $error) {
        if (db()->inTransaction()) db()->rollBack();
        throw $error;
    }
}

const MEMBER_ID_ATTEMPTS = 5;

/**
 * Zwei gleichzeitige Anlagen koennen dieselbe naechste ID sehen; die zweite laeuft dann in den
 * Primaerschluessel. Eine selbst vergebene ID wird beim Wiederholen nicht frei, deshalb bekommt
 * der Aufrufer dafuer einen lesbaren Konflikt statt eines stillen Serverfehlers.
 */
function createMemberRecord(array $member, array $currentUser): int
{
    $chosenId = (int) ($member['id'] ?? 0);
    for ($attempt = 1; $attempt <= MEMBER_ID_ATTEMPTS; $attempt++) {
        $member['id'] = $chosenId > 0 ? $chosenId : nextFreeMemberId();
        try {
            insertMemberInTransaction($member, $currentUser);
            return (int) $member['id'];
        } catch (Throwable $error) {
            if (!isDuplicateKeyError($error)) throw $error;
            if ($chosenId > 0) throw new ApiError('Die ID ' . $chosenId . ' ist bereits vergeben.', 409);
        }
    }
    throw new ApiError('Es konnte keine freie ID vergeben werden. Bitte erneut versuchen.', 409);
}

function handleMembersCollection(array $currentUser): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'POST']);
    if ($method === 'GET') {
        $limit = clampListLimit($_GET['limit'] ?? null, 50, 500);
        $offset = max((int) ($_GET['offset'] ?? 0), 0);
        ['where' => $where, 'params' => $params] = buildMemberSearchFilter($_GET['search'] ?? '');
        $statement = db()->prepare(baseSelect() . $where . ' ORDER BY m.name, m.vorname, m.id LIMIT ? OFFSET ?');
        $statement->execute([...$params, $limit, $offset]);
        jsonResponse(['members' => array_map('rowToMember', $statement->fetchAll())]);
    }

    if ($method === 'POST') {
        $payload = readJsonBody();
        assertKnownFields($payload);
        $member = normalizeMemberInput($payload);
        assertValidMember($member);
        jsonResponse(['member' => findMemberById(createMemberRecord($member, $currentUser))], 201);
    }
    unhandledMethod();
}

function handleMemberResource(int $id, array $currentUser): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'PUT', 'PATCH', 'DELETE']);
    if ($method === 'GET') {
        $member = findMemberById($id);
        if (!$member) throw new ApiError('Mitglied nicht gefunden.', 404);
        jsonResponse(['member' => $member]);
    }

    if ($method === 'PUT' || $method === 'PATCH') {
        $existing = findMemberById($id);
        if (!$existing) throw new ApiError('Mitglied nicht gefunden.', 404);
        $payload = readJsonBody();
        assertKnownFields($payload);
        $patch = normalizeMemberInput($payload, true);
        $member = array_replace($existing, $patch, ['id' => $id]);
        assertValidMember($member);
        db()->beginTransaction();
        try {
            updateMemberColumns($id, $patch);
            if (array_key_exists('interessengruppen', $patch)) {
                syncJoinTable('mitglied_interessengruppe', 'interessengruppe_id', $id, $patch['interessengruppen']);
            }
            if (array_key_exists('funktionen', $patch)) {
                syncJoinTable('mitglied_funktion', 'funktion_id', $id, $patch['funktionen']);
            }
            $updated = findMemberById($id);
            $changes = $updated ? buildMemberAuditChanges($existing, $updated) : [];
            if ($changes) {
                auditMemberChange($id, 'updated', $changes, $currentUser);
            }
            db()->commit();
        } catch (Throwable $error) {
            db()->rollBack();
            throw $error;
        }
        jsonResponse(['member' => findMemberById($id)]);
    }

    if ($method === 'DELETE') {
        $existing = findMemberById($id);
        if (!$existing) throw new ApiError('Mitglied nicht gefunden.', 404);
        db()->beginTransaction();
        try {
            auditMemberChange($id, 'deleted', [], $currentUser);
            $statement = db()->prepare('DELETE FROM mitglied WHERE id = ?');
            $statement->execute([$id]);
            db()->commit();
        } catch (Throwable $error) {
            db()->rollBack();
            throw $error;
        }
        noContent();
    }
    unhandledMethod();
}

function insertMember(array $member): void
{
    $fields = mainMemberFields();
    unset($fields['id']);
    $columns = array_merge(['id'], array_values($fields));
    $keys = array_merge(['id'], array_keys($fields));
    $placeholders = implode(', ', array_fill(0, count($columns), '?'));
    $statement = db()->prepare('INSERT INTO mitglied (' . implode(', ', $columns) . ') VALUES (' . $placeholders . ')');
    $statement->execute(array_map(static fn(string $key): mixed => $member[$key] ?? null, $keys));
    updateMemberWeihnachtsessen((int) $member['id'], $member);
}

function updateMemberColumns(int $id, array $patch): void
{
    $fields = mainMemberFields();
    $assignments = [];
    $values = [];
    foreach ($patch as $key => $value) {
        if ($key === 'id' || !isset($fields[$key])) continue;
        $assignments[] = $fields[$key] . ' = ?';
        $values[] = $value;
    }
    if ($assignments) {
        $values[] = $id;
        db()->prepare('UPDATE mitglied SET ' . implode(', ', $assignments) . ' WHERE id = ?')->execute($values);
    }
    updateMemberWeihnachtsessen($id, $patch);
}

function updateMemberWeihnachtsessen(int $memberId, array $values): void
{
    $fields = array_intersect_key(weihnachtsessenFields(), $values);
    if (!$fields) return;
    $columns = array_values($fields);
    $placeholders = implode(', ', array_fill(0, count($columns) + 1, '?'));
    $updates = implode(', ', array_map(static fn(string $column): string => $column . ' = VALUES(' . $column . ')', $columns));
    db()->prepare(
        'INSERT INTO mitglied_weihnachtsessen (mitglied_id, ' . implode(', ', $columns) . ') '
        . 'VALUES (' . $placeholders . ') ON DUPLICATE KEY UPDATE ' . $updates
    )->execute([$memberId, ...array_map(static fn(string $key): mixed => $values[$key], array_keys($fields))]);
}

function syncJoinTable(string $table, string $idColumn, int $memberId, array $ids): void
{
    db()->prepare("DELETE FROM {$table} WHERE mitglied_id = ?")->execute([$memberId]);
    if (!$ids) return;
    $placeholders = implode(', ', array_fill(0, count($ids), '(?, ?)'));
    $values = [];
    foreach ($ids as $id) {
        $values[] = $memberId;
        $values[] = $id;
    }
    db()->prepare("INSERT INTO {$table} (mitglied_id, {$idColumn}) VALUES {$placeholders}")->execute($values);
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function parsePhotoJsonPayload(array $body): array
{
    $content = base64_decode((string) ($body['base64'] ?? ''), true);
    if ($content === false || $content === '') {
        throw new ApiError('base64 ist erforderlich.', 400);
    }
    return [
        'fileName' => (string) ($body['fileName'] ?? 'passbild.jpg'),
        'content' => $content,
    ];
}

function assertPhotoSize(string $content): void
{
    if (strlen($content) > MAX_PHOTO_BYTES) {
        throw new ApiError('Passbild darf maximal 5 MB gross sein.', 400);
    }
}

const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Der vom Client gemeldete Content-Type ist nur eine Behauptung. Massgeblich ist der
 * am Inhalt erkannte Typ - sonst laesst sich HTML als Passbild ablegen und spaeter
 * unter derselben Origin wie die App ausliefern (gespeichertes XSS).
 */
function detectPhotoMimeType(string $content): string
{
    $info = @getimagesizefromstring($content);
    $mimeType = is_array($info) ? (string) ($info['mime'] ?? '') : '';
    if (!in_array($mimeType, ALLOWED_PHOTO_MIME_TYPES, true)) {
        throw new ApiError('Passbild muss ein JPG-, PNG- oder WebP-Bild sein.', 400);
    }
    return $mimeType;
}

/** Altbestand kann beliebige Typen tragen - beim Ausliefern nochmals absichern. */
function safePhotoMimeType(mixed $mimeType): string
{
    $value = (string) $mimeType;
    return in_array($value, ALLOWED_PHOTO_MIME_TYPES, true) ? $value : 'application/octet-stream';
}

function handleMemberPhoto(int $id, array $currentUser): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'PUT', 'DELETE']);
    if ($method === 'GET') {
        $statement = db()->prepare('SELECT dateiname, mime_type, sha256, inhalt FROM mitglied_passbild WHERE mitglied_id = ?');
        $statement->execute([$id]);
        $photo = $statement->fetch();
        if (!$photo) throw new ApiError('Passbild nicht gefunden.', 404);
        $etag = '"' . $photo['sha256'] . '"';
        $headers = [
            'Content-Type' => safePhotoMimeType($photo['mime_type']),
            'X-Content-Type-Options' => 'nosniff',
            'Content-Disposition' => 'inline; filename="' . addslashes($photo['dateiname']) . '"',
            'Cache-Control' => 'private, max-age=3600',
            'ETag' => $etag,
        ];
        if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
            rawResponse('', 304, $headers);
        }
        rawResponse((string) $photo['inhalt'], 200, $headers);
    }

    if ($method === 'PUT') {
        if (!findMemberById($id)) throw new ApiError('Mitglied nicht gefunden.', 404);
        $photoStatement = db()->prepare('SELECT 1 FROM mitglied_passbild WHERE mitglied_id = ?');
        $photoStatement->execute([$id]);
        $hadPhoto = (bool) $photoStatement->fetchColumn();
        $contentType = $_SERVER['CONTENT_TYPE'] ?? 'application/octet-stream';
        if (str_starts_with($contentType, 'application/json')) {
            ['fileName' => $fileName, 'content' => $content] = parsePhotoJsonPayload(readJsonBody());
        } else {
            $fileName = rawurldecode((string) ($_SERVER['HTTP_X_FILE_NAME'] ?? 'passbild.jpg')) ?: 'passbild.jpg';
            $content = requestBody();
        }
        assertPhotoSize($content);
        $mimeType = detectPhotoMimeType($content);
        $sha = hash('sha256', $content);
        db()->prepare(
            "INSERT INTO mitglied_passbild (mitglied_id, dateiname, mime_type, groesse_bytes, sha256, inhalt)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               dateiname = VALUES(dateiname),
               mime_type = VALUES(mime_type),
               groesse_bytes = VALUES(groesse_bytes),
               sha256 = VALUES(sha256),
               inhalt = VALUES(inhalt)"
        )->execute([$id, $fileName, $mimeType, strlen($content), $sha, $content]);
        db()->prepare('UPDATE mitglied SET passbild = ? WHERE id = ?')->execute([$fileName, $id]);
        auditMemberChange($id, 'photo_updated', [[
            'field' => 'passbild',
            'label' => memberAuditLabels()['passbild'],
            'old' => $hadPhoto ? 'vorhanden' : '',
            'new' => 'aktualisiert',
        ]], $currentUser);
        jsonResponse(['photo' => ['id' => $id, 'fileName' => $fileName, 'mimeType' => $mimeType, 'size' => strlen($content), 'sha256' => $sha]]);
    }

    if ($method === 'DELETE') {
        $statement = db()->prepare('DELETE FROM mitglied_passbild WHERE mitglied_id = ?');
        $statement->execute([$id]);
        if ($statement->rowCount() === 0) throw new ApiError('Passbild nicht gefunden.', 404);
        auditMemberChange($id, 'photo_deleted', [[
            'field' => 'passbild',
            'label' => memberAuditLabels()['passbild'],
            'old' => 'vorhanden',
            'new' => '',
        ]], $currentUser);
        noContent();
    }
    unhandledMethod();
}

/**
 * Jedes Event hat eine eigene Teilnehmertabelle. `meals` leer heisst: das Event kennt keine
 * Essensauswahl - dann fehlt die Spalte sowohl in der Tabelle als auch in der API.
 */
function eventDefinition(string $event): array
{
    $events = [
        'warnemuende' => ['table' => 'warnemuende_teilnehmer', 'meals' => ['Zander', 'Rind', 'Vegie']],
        'eisbeinessen' => ['table' => 'eisbeinessen_teilnehmer', 'meals' => []],
    ];
    if (!isset($events[$event])) throw new ApiError('Unbekanntes Event: ' . $event, 404);
    return $events[$event];
}

/** Alle Eventtabellen sind bis auf die Essensauswahl gleich gebaut - deshalb reicht ein Bauplan. */
function eventTableDdl(string $event): string
{
    ['table' => $table, 'meals' => $meals] = eventDefinition($event);
    return implode("\n", array_filter([
        "CREATE TABLE IF NOT EXISTS {$table} (",
        '  id INT NOT NULL AUTO_INCREMENT,',
        '  name VARCHAR(120) NOT NULL,',
        '  vorname VARCHAR(120) NOT NULL,',
        $meals ? "  essensauswahl ENUM('" . implode("', '", $meals) . "') NOT NULL DEFAULT '{$meals[0]}'," : '',
        '  bezahlt TINYINT(1) NOT NULL DEFAULT 0,',
        '  abgesagt TINYINT(1) NOT NULL DEFAULT 0,',
        '  bemerkung TEXT NULL,',
        '  mitglied_id INT NULL,',
        '  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,',
        '  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,',
        '  PRIMARY KEY (id),',
        "  INDEX idx_{$table}_name (name, vorname),",
        "  CONSTRAINT fk_{$table}_mitglied FOREIGN KEY (mitglied_id) REFERENCES mitglied (id) ON DELETE SET NULL",
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    ]));
}

/**
 * Ein neues Event soll ohne Schema-Import laufen: fehlt die Tabelle, legen wir sie an.
 * Darf der DB-Benutzer das nicht (Hoster), bleibt der lesbare Hinweis statt eines 500ers.
 */
function ensureEventTable(string $event): void
{
    $table = eventDefinition($event)['table'];
    if (tableExists($table)) return;

    try {
        db()->exec(eventTableDdl($event));
    } catch (PDOException $error) {
        error_log((string) $error);
        throw new ApiError('Tabelle ' . $table . ' fehlt und konnte nicht angelegt werden - bitte das Schema aus server/db/schema.mysql.sql einspielen.', 503);
    }
    clearSchemaCache();
}

function eventParticipantColumns(string $event): array
{
    $meals = eventDefinition($event)['meals'] ? ['essensauswahl'] : [];
    return array_merge(['name', 'vorname'], $meals, ['bezahlt', 'abgesagt', 'bemerkung', 'mitglied_id']);
}

/** Akzeptiert auch die Schreibweisen der Papierliste ("Zanderfilet", "Rinderbäckchen"). */
function normalizeEventMeal(string $event, mixed $value): string
{
    $options = eventDefinition($event)['meals'];
    $text = trim((string) $value);
    foreach ($options as $option) {
        // stripos genuegt: die Gerichtsnamen sind ASCII, nur die Endungen der
        // Papierliste ("Rinderbaeckchen") tragen Umlaute - und mbstring ist beim Hoster nicht sicher da.
        if (stripos($text, $option) === 0) return $option;
    }
    throw new ApiError('Essensauswahl muss ' . implode(', ', $options) . ' sein.', 400);
}

function normalizeEventInput(string $event, array $payload, bool $partial = false): array
{
    $meals = eventDefinition($event)['meals'];
    $known = array_merge(['id', 'name', 'vorname', 'bezahlt', 'abgesagt', 'bemerkung', 'mitgliedId'], $meals ? ['essensauswahl'] : []);
    $unknown = array_diff(array_keys($payload), $known);
    if ($unknown) throw new ApiError('Unbekannte Felder: ' . implode(', ', $unknown), 400);

    $participant = [];
    foreach (['name', 'vorname'] as $field) {
        if ($partial && !array_key_exists($field, $payload)) continue;
        $participant[$field] = trim((string) ($payload[$field] ?? ''));
        if ($field === 'name' && $participant[$field] === '') throw new ApiError('Name ist erforderlich.', 400);
    }
    if ($meals && (!$partial || array_key_exists('essensauswahl', $payload))) {
        $participant['essensauswahl'] = normalizeEventMeal($event, $payload['essensauswahl'] ?? $meals[0]);
    }
    if (!$partial || array_key_exists('bezahlt', $payload)) {
        $participant['bezahlt'] = (bool) ($payload['bezahlt'] ?? false);
    }
    if (!$partial || array_key_exists('abgesagt', $payload)) {
        $participant['abgesagt'] = (bool) ($payload['abgesagt'] ?? false);
    }
    if (!$partial || array_key_exists('bemerkung', $payload)) {
        $participant['bemerkung'] = trim((string) ($payload['bemerkung'] ?? ''));
    }
    if (!$partial || array_key_exists('mitgliedId', $payload)) {
        $mitgliedId = (int) ($payload['mitgliedId'] ?? 0);
        $participant['mitgliedId'] = $mitgliedId > 0 ? $mitgliedId : null;
    }
    return $participant;
}

function assertEventMemberExists(?int $mitgliedId): void
{
    if ($mitgliedId === null) return;
    $statement = db()->prepare('SELECT 1 FROM mitglied WHERE id = ?');
    $statement->execute([$mitgliedId]);
    if (!$statement->fetchColumn()) throw new ApiError('Unbekannte DB-ID: ' . $mitgliedId, 400);
}

function eventRowToApi(array $row): array
{
    return array_merge(
        [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'vorname' => (string) $row['vorname'],
        ],
        array_key_exists('essensauswahl', $row) ? ['essensauswahl' => (string) $row['essensauswahl']] : [],
        [
            'bezahlt' => (bool) $row['bezahlt'],
            'abgesagt' => (bool) $row['abgesagt'],
            'bemerkung' => (string) ($row['bemerkung'] ?? ''),
            'mitgliedId' => $row['mitglied_id'] === null ? null : (int) $row['mitglied_id'],
        ]
    );
}

/** Bringt den Datensatz in die Reihenfolge der Tabellenspalten - fuer INSERT und UPDATE gleich. */
function eventParticipantValues(string $event, array $participant): array
{
    return array_map(static fn(string $column) => match ($column) {
        'mitglied_id' => $participant['mitgliedId'],
        'bezahlt', 'abgesagt' => (int) $participant[$column],
        default => $participant[$column],
    }, eventParticipantColumns($event));
}

/** Speichert eine eindeutige Namenszuordnung dauerhaft in der Eventtabelle. */
function linkEventParticipantToMember(string $event, int $participantId): void
{
    $table = eventDefinition($event)['table'];
    db()->prepare(
        'UPDATE ' . $table . ' t JOIN ('
        . 'SELECT name, vorname, MIN(id) AS id FROM mitglied GROUP BY name, vorname HAVING COUNT(*) = 1'
        . ') m ON m.name = t.name AND m.vorname = t.vorname '
        . 'SET t.mitglied_id = m.id WHERE t.mitglied_id IS NULL AND t.id = ?'
    )->execute([$participantId]);
}

/** Gemeinsame SELECT-Liste fuer Collection und Einzelressource. */
function eventParticipantSelect(string $event): string
{
    $columns = array_map(static fn(string $column): string => 't.' . $column, eventParticipantColumns($event));
    $table = eventDefinition($event)['table'];
    return 'SELECT t.id, ' . implode(', ', $columns) . ' FROM ' . $table . ' t';
}

function findEventParticipantById(string $event, int $id): ?array
{
    $statement = db()->prepare(eventParticipantSelect($event) . ' WHERE t.id = ?');
    $statement->execute([$id]);
    $row = $statement->fetch();
    return $row ? eventRowToApi($row) : null;
}

function handleEventParticipantCollection(string $event): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'POST']);
    ensureEventTable($event);
    $table = eventDefinition($event)['table'];
    $columns = eventParticipantColumns($event);

    if ($method === 'GET') {
        $rows = db()->query(eventParticipantSelect($event) . ' ORDER BY t.name, t.vorname, t.id')->fetchAll();
        jsonResponse(['participants' => array_map('eventRowToApi', $rows)]);
    }

    if ($method === 'POST') {
        $participant = normalizeEventInput($event, readJsonBody());
        assertEventMemberExists($participant['mitgliedId']);
        $placeholders = implode(', ', array_fill(0, count($columns), '?'));
        db()->prepare('INSERT INTO ' . $table . ' (' . implode(', ', $columns) . ') VALUES (' . $placeholders . ')')
            ->execute(eventParticipantValues($event, $participant));
        $id = (int) db()->lastInsertId();
        linkEventParticipantToMember($event, $id);
        jsonResponse(['participant' => findEventParticipantById($event, $id)], 201);
    }
    unhandledMethod();
}

function handleEventParticipantResource(string $event, int $id): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'PUT', 'PATCH', 'DELETE']);
    ensureEventTable($event);
    $table = eventDefinition($event)['table'];
    $existing = findEventParticipantById($event, $id);
    if (!$existing) throw new ApiError('Teilnehmer nicht gefunden.', 404);

    if ($method === 'GET') {
        jsonResponse(['participant' => $existing]);
    }

    if ($method === 'PUT' || $method === 'PATCH') {
        $patch = normalizeEventInput($event, readJsonBody(), $method === 'PATCH');
        $participant = array_replace($existing, $patch);
        $nameChanged = $participant['name'] !== $existing['name'] || $participant['vorname'] !== $existing['vorname'];
        if ($nameChanged) $participant['mitgliedId'] = null;
        assertEventMemberExists($participant['mitgliedId']);
        $assignments = implode(', ', array_map(static fn(string $column) => $column . ' = ?', eventParticipantColumns($event)));
        db()->prepare('UPDATE ' . $table . ' SET ' . $assignments . ' WHERE id = ?')
            ->execute([...eventParticipantValues($event, $participant), $id]);
        linkEventParticipantToMember($event, $id);
        jsonResponse(['participant' => findEventParticipantById($event, $id)]);
    }

    if ($method === 'DELETE') {
        db()->prepare('DELETE FROM ' . $table . ' WHERE id = ?')->execute([$id]);
        noContent();
    }
    unhandledMethod();
}
