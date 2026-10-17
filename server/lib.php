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
        'bemerkung' => 'bemerkung',
    ];
}

function zahlungsFields(): array
{
    return [
        'gezahlterBetragClub' => 'gezahlter_betrag_club',
        'einzahlungClubAm' => 'einzahlung_club_am',
        'gezahlterBetragComputer' => 'gezahlter_betrag_computer',
        'einzahlungComputerAm' => 'einzahlung_computer_am',
    ];
}

/** API-Felder, die nicht gespeichert, sondern aus dem Zahlungsbetrag abgeleitet werden. */
function abgeleiteteZahlungsFields(): array
{
    return [
        'beitragClubBezahlt' => 'beitrag_club_bezahlt',
        'beitragComputerBezahlt' => 'beitrag_computer_bezahlt',
    ];
}

/** Das Beitragsjahr ist das Kalenderjahr: Am 1. Januar beginnt das neue, das alte ist dann abgeschlossen. */
function aktuellesBeitragsjahr(): int
{
    return (int) (new DateTimeImmutable('now', new DateTimeZone('Europe/Berlin')))->format('Y');
}

/** Ein Jahr ohne Datensatz in mitglied_zahlung: nichts gezahlt. */
function leereZahlung(int $beitragsjahr): array
{
    return ['beitragsjahr' => $beitragsjahr, 'gezahlterBetragClub' => 0.0, 'einzahlungClubAm' => null, 'gezahlterBetragComputer' => 0.0, 'einzahlungComputerAm' => null];
}

/** Ein Eintrag aus "zahlungen" ersetzt das ganze Jahr: fehlende Felder gelten als leer. */
function normalizeZahlungen(mixed $value): array
{
    if (!is_array($value)) throw new ApiError('zahlungen muss eine Liste sein.', 400);
    $result = [];
    foreach ($value as $entry) {
        $jahr = is_array($entry) ? filter_var($entry['beitragsjahr'] ?? null, FILTER_VALIDATE_INT) : false;
        if ($jahr === false || $jahr < 1900 || $jahr > 2100) throw new ApiError('Jeder Eintrag in zahlungen braucht ein beitragsjahr (1900-2100).', 400);
        $unknown = array_diff(array_keys($entry), ['beitragsjahr', ...array_keys(zahlungsFields())]);
        if ($unknown) throw new ApiError('Unbekannte Felder in zahlungen: ' . implode(', ', $unknown), 400);
        $zahlung = leereZahlung($jahr);
        foreach (['gezahlterBetragClub', 'gezahlterBetragComputer'] as $key) {
            $amount = (float) ($entry[$key] ?? 0);
            if ($amount < 0) throw new ApiError("$key ($jahr) darf nicht negativ sein.", 400);
            $zahlung[$key] = $amount;
        }
        foreach (['einzahlungClubAm', 'einzahlungComputerAm'] as $key) {
            $zahlung[$key] = normalizeDateValue($key, $entry[$key] ?? null);
        }
        $result[$jahr] = $zahlung;
    }
    krsort($result);
    return array_values($result);
}

/** Abgelaufene Beitragsjahre sind abgeschlossen - "zahlungen" darf nur offene Jahre enthalten. */
function assertKeineAbgelaufenenJahre(array $zahlungen): void
{
    foreach ($zahlungen as ['beitragsjahr' => $jahr]) {
        if ($jahr < aktuellesBeitragsjahr()) {
            throw new ApiError("Das Beitragsjahr $jahr ist abgeschlossen und kann nicht mehr geaendert werden.", 400);
        }
    }
}

/** Haengt jedem Mitglied alle Beitragsjahre an - eine Abfrage fuer die ganze Seite. */
function attachZahlungen(array $members): array
{
    if (!$members) return $members;
    $ids = array_column($members, 'id');
    $statement = db()->prepare(
        'SELECT * FROM mitglied_zahlung WHERE mitglied_id IN (' . implode(', ', array_fill(0, count($ids), '?')) . ') ORDER BY beitragsjahr DESC'
    );
    $statement->execute(array_map('intval', $ids));
    $byMember = [];
    foreach ($statement->fetchAll() as $row) {
        $byMember[(int) $row['mitglied_id']][] = [
            'beitragsjahr' => (int) $row['beitragsjahr'],
            'gezahlterBetragClub' => (float) $row['gezahlter_betrag_club'],
            'einzahlungClubAm' => $row['einzahlung_club_am'] ? substr((string) $row['einzahlung_club_am'], 0, 10) : null,
            'gezahlterBetragComputer' => (float) $row['gezahlter_betrag_computer'],
            'einzahlungComputerAm' => $row['einzahlung_computer_am'] ? substr((string) $row['einzahlung_computer_am'], 0, 10) : null,
        ];
    }
    return array_map(static fn(array $member): array => $member + ['zahlungen' => $byMember[(int) $member['id']] ?? []], $members);
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

/** Gemeinsame API-Sicht auf Stammdaten, Zahlungen und Weihnachtsessen. */
function memberApiFields(): array
{
    return array_merge(mainMemberFields(), abgeleiteteZahlungsFields(), zahlungsFields(), weihnachtsessenFields());
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

function normalizeDateValue(string $jsonKey, mixed $value): ?string
{
    if ($value === '' || $value === null) return null;
    $stringValue = substr((string) $value, 0, 10);
    $valid = preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $stringValue, $parts)
        && checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1])
        && (int) $parts[1] >= 1900 && (int) $parts[1] <= 2100;
    if (!$valid) {
        throw new ApiError("Ungueltiges Datum fuer $jsonKey (erwartet YYYY-MM-DD, Jahr 1900-2100): $stringValue", 400);
    }
    return $stringValue;
}

function normalizeEmailValue(mixed $value): string
{
    $stringValue = $value === null ? '' : trim((string) $value);
    if ($stringValue === '') return '';
    if (filter_var($stringValue, FILTER_VALIDATE_EMAIL) === false) {
        throw new ApiError("Ungueltige Email-Adresse: $stringValue", 400);
    }
    return $stringValue;
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
            $member[$jsonKey] = normalizeDateValue($jsonKey, $value);
        } elseif ($jsonKey === 'email') {
            $member[$jsonKey] = normalizeEmailValue($value);
        } elseif (in_array($jsonKey, numberFields(), true)) {
            $number = $value === '' || $value === null ? null : (float) $value;
            $member[$jsonKey] = isset($nullableNumbers[$jsonKey])
                ? ($number && $number > 0 ? $number : null)
                : ($number ?: 0);
        } else {
            $member[$jsonKey] = $value === null ? '' : (string) $value;
        }
    }

    if (!$partial || array_key_exists('zahlungen', $payload)) {
        $member['zahlungen'] = normalizeZahlungen($payload['zahlungen'] ?? []);
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
    $allowed = array_fill_keys(array_merge(array_keys(memberApiFields()), ['interessengruppen', 'funktionen', 'zahlungen']), true);
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

/**
 * Plausibilitaet wie in validateMember() (src/member-domain.js). Geprueft werden nur die
 * uebergebenen Felder: alte, unsaubere Datensaetze sollen andere Aenderungen nicht blockieren.
 */
function assertPlausibleMember(array $member, array $changed): void
{
    $touched = static fn(string ...$keys): bool => (bool) array_intersect($keys, $changed);
    $plz = trim((string) ($member['plz'] ?? ''));
    if ($touched('plz') && $plz !== '' && !preg_match('/^\d{5}$/', $plz)) {
        throw new ApiError('PLZ muss aus genau 5 Ziffern bestehen.', 400);
    }
    foreach (['gezahlterBetragClub', 'gezahlterBetragComputer', 'gezahlterBetragWeihnachten', 'tischnummer'] as $key) {
        if ($touched($key) && (float) ($member[$key] ?? 0) < 0) throw new ApiError("$key darf nicht negativ sein.", 400);
    }
    [$birth, $entry, $exit] = [$member['geburtstag'] ?? null, $member['eintrittsdatum'] ?? null, $member['austrittsdatum'] ?? null];
    if ($touched('geburtstag') && $birth && $birth > date('Y-m-d')) throw new ApiError('Geburtstag liegt in der Zukunft.', 400);
    if ($touched('geburtstag', 'eintrittsdatum') && $birth && $entry && $entry < $birth) throw new ApiError('Eintritt liegt vor der Geburt.', 400);
    if ($touched('eintrittsdatum', 'austrittsdatum') && $entry && $exit && $exit < $entry) throw new ApiError('Austritt liegt vor dem Eintritt.', 400);
}

function baseSelect(): string
{
    return "SELECT m.*,
      COALESCE(mz.gezahlter_betrag_club, 0.00) > 0 AS beitrag_club_bezahlt,
      COALESCE(mz.gezahlter_betrag_computer, 0.00) > 0 AS beitrag_computer_bezahlt,
      COALESCE(mz.gezahlter_betrag_club, 0.00) AS gezahlter_betrag_club,
      mz.einzahlung_club_am AS einzahlung_club_am,
      COALESCE(mz.gezahlter_betrag_computer, 0.00) AS gezahlter_betrag_computer,
      mz.einzahlung_computer_am AS einzahlung_computer_am,
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
      LEFT JOIN mitglied_zahlung mz
        ON mz.mitglied_id = m.id AND mz.beitragsjahr = " . aktuellesBeitragsjahr() . "
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
    return $row ? attachZahlungen([rowToMember($row)])[0] : null;
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
        'beitragComputerBezahlt' => 'Beitrag Computer bezahlt',
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
    return [...$changes, ...buildZahlungAuditChanges($before['zahlungen'] ?? [], $after['zahlungen'] ?? [])];
}

/** Das aktuelle Beitragsjahr steht schon ueber die flachen Felder im Protokoll. */
function buildZahlungAuditChanges(array $before, array $after): array
{
    $byYear = static fn(array $zahlungen): array => array_column($zahlungen, null, 'beitragsjahr');
    [$before, $after] = [$byYear($before), $byYear($after)];
    $years = array_diff(array_unique([...array_keys($before), ...array_keys($after)]), [aktuellesBeitragsjahr()]);
    rsort($years);
    $labels = memberAuditLabels();
    $changes = [];
    foreach ($years as $year) {
        foreach (array_keys(zahlungsFields()) as $field) {
            $oldRaw = ($before[$year] ?? leereZahlung($year))[$field];
            $newRaw = ($after[$year] ?? leereZahlung($year))[$field];
            if (normalizedAuditValue($field, $oldRaw) === normalizedAuditValue($field, $newRaw)) continue;
            $changes[] = ['field' => $field, 'label' => "{$labels[$field]} $year", 'old' => formatAuditValue($field, $oldRaw), 'new' => formatAuditValue($field, $newRaw)];
        }
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

/** 1062 ist ER_DUP_ENTRY - SQLSTATE 23000 allein traefe auch Fremdschluesselverletzungen. */
function isDuplicateKeyError(Throwable $error): bool
{
    return $error instanceof PDOException && (int) ($error->errorInfo[1] ?? 0) === 1062;
}

/**
 * Die Datenbank vergibt die Mitgliedsnummer. Eine mitgeschickte ID wird trotzdem
 * uebernommen - das braucht ein Reimport, der bestehende Nummern behalten soll -
 * und kollidiert sie, ist das ein Konflikt und kein Serverfehler.
 */
function createMemberRecord(array $member, array $currentUser): int
{
    db()->beginTransaction();
    try {
        $id = insertMember($member);
        syncJoinTable('mitglied_interessengruppe', 'interessengruppe_id', $id, $member['interessengruppen']);
        syncJoinTable('mitglied_funktion', 'funktion_id', $id, $member['funktionen']);
        auditMemberChange($id, 'created', [], $currentUser);
        db()->commit();
        return $id;
    } catch (Throwable $error) {
        if (db()->inTransaction()) db()->rollBack();
        if (isDuplicateKeyError($error)) {
            throw new ApiError('Die ID ' . (int) $member['id'] . ' ist bereits vergeben.', 409);
        }
        throw $error;
    }
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
        jsonResponse(['members' => attachZahlungen(array_map('rowToMember', $statement->fetchAll()))]);
    }

    if ($method === 'POST') {
        $payload = readJsonBody();
        assertKnownFields($payload);
        $member = normalizeMemberInput($payload);
        assertValidMember($member);
        assertPlausibleMember($member, array_keys($member));
        assertKeineAbgelaufenenJahre($member['zahlungen']);
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
        assertPlausibleMember($member, array_keys($patch));
        assertKeineAbgelaufenenJahre($patch['zahlungen'] ?? []);
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

/** Felder, die beim Zusammenfuehren vom aufgeloesten Datensatz uebernommen werden koennen. */
function mergeableMemberFields(): array
{
    $fields = array_diff(array_keys(mainMemberFields()), ['id', 'passbild', 'funktion']);
    return array_values(array_merge($fields, ['interessengruppen', 'funktionen', 'passbild']));
}

/**
 * Fuehrt einen doppelten Datensatz (sourceId) in diesen hier zusammen. "fromSource" nennt
 * die Felder, deren Wert vom aufgeloesten Datensatz kommt - alle anderen behaelt dieser.
 * Zahlungsjahre, die hier fehlen, Eventanmeldungen und Aenderungsverlauf ziehen mit um,
 * das Weihnachtsessen bleibt bei diesem Datensatz. Danach wird der andere geloescht.
 */
function handleMemberMerge(int $id, array $currentUser): void
{
    assertMethodAllowed($_SERVER['REQUEST_METHOD'], ['POST']);
    // Zusammenfuehren gehoert zu "Auffaellige Daten" und ist wie diese Ansicht Admins vorbehalten.
    requireAdmin($currentUser);
    $payload = readJsonBody();
    $sourceId = (int) ($payload['sourceId'] ?? 0);
    $fromSource = $payload['fromSource'] ?? [];
    if ($sourceId <= 0 || $sourceId === $id) throw new ApiError('sourceId muss ein anderer Datensatz sein.', 400);
    if (!is_array($fromSource)) throw new ApiError('fromSource muss eine Liste sein.', 400);
    $unknown = array_diff($fromSource, mergeableMemberFields());
    if ($unknown) throw new ApiError('Nicht uebernehmbare Felder: ' . implode(', ', $unknown), 400);

    $target = findMemberById($id);
    $source = findMemberById($sourceId);
    if (!$target || !$source) throw new ApiError('Mitglied nicht gefunden.', 404);

    $patch = array_intersect_key($source, array_flip(array_diff($fromSource, ['passbild'])));
    $member = array_replace($target, $patch);
    assertValidMember($member);
    assertPlausibleMember($member, array_keys($patch));

    // Vor der Transaktion: ein CREATE TABLE wuerde sie sonst stillschweigend beenden.
    ensureEventTables();
    db()->beginTransaction();
    try {
        updateMemberColumns($id, $patch);
        foreach (['interessengruppen' => ['mitglied_interessengruppe', 'interessengruppe_id'], 'funktionen' => ['mitglied_funktion', 'funktion_id']] as $key => [$table, $column]) {
            if (array_key_exists($key, $patch)) syncJoinTable($table, $column, $id, $patch[$key]);
        }
        if (in_array('passbild', $fromSource, true)) {
            db()->prepare('DELETE FROM mitglied_passbild WHERE mitglied_id = ?')->execute([$id]);
            db()->prepare('UPDATE mitglied_passbild SET mitglied_id = ? WHERE mitglied_id = ?')->execute([$id, $sourceId]);
            db()->prepare('UPDATE mitglied SET passbild = ? WHERE id = ?')->execute([$source['passbild'] ?? '', $id]);
        }

        $targetYears = db()->prepare('SELECT beitragsjahr FROM mitglied_zahlung WHERE mitglied_id = ?');
        $targetYears->execute([$id]);
        $years = array_map('intval', $targetYears->fetchAll(PDO::FETCH_COLUMN));
        $movePayments = 'UPDATE mitglied_zahlung SET mitglied_id = ? WHERE mitglied_id = ?'
            . ($years ? ' AND beitragsjahr NOT IN (' . implode(', ', array_fill(0, count($years), '?')) . ')' : '');
        db()->prepare($movePayments)->execute([$id, $sourceId, ...$years]);

        db()->prepare('UPDATE event_teilnehmer SET mitglied_id = ? WHERE mitglied_id = ?')->execute([$id, $sourceId]);
        db()->prepare('UPDATE mitglied_aenderung SET mitglied_id = ? WHERE mitglied_id = ?')->execute([$id, $sourceId]);

        $updated = findMemberById($id);
        $changes = buildMemberAuditChanges($target, $updated);
        if (in_array('passbild', $fromSource, true)) {
            $changes[] = ['field' => 'passbild', 'label' => memberAuditLabels()['passbild'], 'old' => $target['hasPassbildInDb'] ? 'vorhanden' : '', 'new' => $source['hasPassbildInDb'] ? 'übernommen' : 'entfernt'];
        }
        $changes[] = [
            'field' => 'merge',
            'label' => 'Zusammengeführt mit',
            'old' => trim(($source['vorname'] ?? '') . ' ' . ($source['name'] ?? '')) . ' (ID ' . $sourceId . ')',
            'new' => 'aufgelöst',
        ];
        auditMemberChange($id, 'merged', $changes, $currentUser);
        db()->prepare('DELETE FROM mitglied WHERE id = ?')->execute([$sourceId]);
        db()->commit();
    } catch (Throwable $error) {
        if (db()->inTransaction()) db()->rollBack();
        throw $error;
    }
    jsonResponse(['member' => findMemberById($id)]);
}

/** Liefert die vergebene Mitgliedsnummer - ohne eigene Angabe die der Datenbank. */
function insertMember(array $member): int
{
    $fields = mainMemberFields();
    unset($fields['id']);
    $keys = array_keys($fields);
    $chosenId = (int) ($member['id'] ?? 0);
    if ($chosenId > 0) {
        array_unshift($keys, 'id');
        $fields = ['id' => 'id'] + $fields;
    }
    $columns = array_values($fields);
    $placeholders = implode(', ', array_fill(0, count($columns), '?'));
    $statement = db()->prepare('INSERT INTO mitglied (' . implode(', ', $columns) . ') VALUES (' . $placeholders . ')');
    $statement->execute(array_map(static fn(string $key): mixed => $member[$key] ?? null, $keys));
    $id = $chosenId > 0 ? $chosenId : (int) db()->lastInsertId();
    updateMemberZahlungsjahre($id, $member);
    updateMemberZahlungen($id, $member);
    updateMemberWeihnachtsessen($id, $member);
    return $id;
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
    updateMemberZahlungsjahre($id, $patch);
    updateMemberZahlungen($id, $patch);
    updateMemberWeihnachtsessen($id, $patch);
}

/**
 * Jahre, die nicht in "zahlungen" stehen, bleiben unangetastet. Die flachen Felder laufen
 * danach und gewinnen fuers aktuelle Jahr - so ueberschreibt eine mitgeschickte, aeltere
 * Liste keine Grid-Aenderung am aktuellen Jahr.
 */
function updateMemberZahlungsjahre(int $memberId, array $values): void
{
    foreach ($values['zahlungen'] ?? [] as $zahlung) {
        updateMemberZahlungen($memberId, $zahlung, $zahlung['beitragsjahr']);
    }
}

function updateMemberZahlungen(int $memberId, array $values, ?int $beitragsjahr = null): void
{
    $beitragsjahr ??= aktuellesBeitragsjahr();
    $fields = array_intersect_key(zahlungsFields(), $values);
    if (!$fields) return;
    $columns = array_values($fields);
    $placeholders = implode(', ', array_fill(0, count($columns) + 2, '?'));
    $updates = implode(', ', array_map(static fn(string $column): string => $column . ' = VALUES(' . $column . ')', $columns));
    db()->prepare(
        'INSERT INTO mitglied_zahlung (mitglied_id, beitragsjahr, ' . implode(', ', $columns) . ') '
        . 'VALUES (' . $placeholders . ') ON DUPLICATE KEY UPDATE ' . $updates
    )->execute([$memberId, $beitragsjahr, ...array_map(static fn(string $key): mixed => $values[$key], array_keys($fields))]);
    db()->prepare(
        'DELETE FROM mitglied_zahlung
         WHERE mitglied_id = ? AND beitragsjahr = ?
           AND gezahlter_betrag_club = 0 AND einzahlung_club_am IS NULL
           AND gezahlter_betrag_computer = 0 AND einzahlung_computer_am IS NULL'
    )->execute([$memberId, $beitragsjahr]);
}

function updateMemberWeihnachtsessen(int $memberId, array $values): void
{
    updateMemberSideTable('mitglied_weihnachtsessen', weihnachtsessenFields(), $memberId, $values);
}

function updateMemberSideTable(string $table, array $definedFields, int $memberId, array $values): void
{
    $fields = array_intersect_key($definedFields, $values);
    if (!$fields) return;
    $columns = array_values($fields);
    $placeholders = implode(', ', array_fill(0, count($columns) + 1, '?'));
    $updates = implode(', ', array_map(static fn(string $column): string => $column . ' = VALUES(' . $column . ')', $columns));
    db()->prepare(
        'INSERT INTO ' . $table . ' (mitglied_id, ' . implode(', ', $columns) . ') '
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
 * Events (Teilnehmerlisten) legt man in der Oberflaeche an; sie stehen in der Tabelle event,
 * ihre Teilnehmer gemeinsam in event_teilnehmer. Der `schluessel` wird beim Anlegen aus der
 * Bezeichnung gebildet und bleibt danach fest: er traegt den API-Pfad
 * (/api/<schluessel>-participants), die DOM-Ids und den gemerkten Spaltenzustand.
 */
const EVENT_TABLE_DDL = 'CREATE TABLE IF NOT EXISTS event (
  id INT NOT NULL AUTO_INCREMENT,
  schluessel VARCHAR(40) NOT NULL,
  bezeichnung VARCHAR(120) NOT NULL,
  datum DATE NULL,
  symbol VARCHAR(20) NOT NULL DEFAULT \'kalender\',
  max_plaetze INT NULL,
  essensauswahl TEXT NULL,
  preis DECIMAL(8,2) NULL,
  pdf_hinweis VARCHAR(255) NOT NULL DEFAULT \'\',
  archiviert TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_schluessel (schluessel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

const EVENT_PARTICIPANT_TABLE_DDL = 'CREATE TABLE IF NOT EXISTS event_teilnehmer (
  id INT NOT NULL AUTO_INCREMENT,
  event_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  vorname VARCHAR(120) NOT NULL,
  essensauswahl VARCHAR(60) NOT NULL DEFAULT \'\',
  bezahlt TINYINT(1) NOT NULL DEFAULT 0,
  abgesagt TINYINT(1) NOT NULL DEFAULT 0,
  bemerkung TEXT NULL,
  mitglied_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_event_teilnehmer_name (event_id, name, vorname),
  CONSTRAINT fk_event_teilnehmer_event FOREIGN KEY (event_id) REFERENCES event (id),
  CONSTRAINT fk_event_teilnehmer_mitglied FOREIGN KEY (mitglied_id) REFERENCES mitglied (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/** Symbole fuer den Eintrag in der Navigation; die Bilder dazu hat das Frontend. */
const EVENT_SYMBOLS = ['kalender', 'essen', 'schiff', 'bus', 'feier', 'musik'];

/**
 * Bis Oktober 2026 hatte jedes Event eine eigene, im Code eingetragene Tabelle <schluessel>_teilnehmer.
 * Beim ersten Zugriff ziehen sie mit ihren Teilnehmern nach event/event_teilnehmer um; die alten
 * Tabellen bleiben unangetastet stehen.
 */
function legacyEventDefinitions(): array
{
    return [
        ['schluessel' => 'warnemuende', 'bezeichnung' => 'Warnemünde', 'symbol' => 'schiff', 'max_plaetze' => 50, 'essensauswahl' => ['Zander', 'Rind', 'Vegie'], 'pdf_hinweis' => ''],
        ['schluessel' => 'eisbeinessen', 'bezeichnung' => 'Eisbeinessen', 'symbol' => 'essen', 'max_plaetze' => 30, 'essensauswahl' => [], 'pdf_hinweis' => 'Selbstbeteiligung liegt bei 20 Euro.'],
    ];
}

/** Merkt sich, welche alte Liste schon umgezogen ist - auch wenn das Event spaeter geloescht wird. */
const EVENT_MIGRATION_TABLE_DDL = 'CREATE TABLE IF NOT EXISTS event_migration (
  schluessel VARCHAR(40) NOT NULL,
  migriert_am TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (schluessel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/**
 * Fehlen die Tabellen, legen wir sie an; sonst lesbarer Hinweis statt 500er. Danach zieht jede
 * alte Liste um, die noch nicht in event_migration steht - bei jedem Zugriff, bis es geklappt hat.
 */
function ensureEventTables(): void
{
    if (!tableExists('event') || !tableExists('event_teilnehmer') || !tableExists('event_migration')) {
        try {
            db()->exec(EVENT_TABLE_DDL);
            db()->exec(EVENT_PARTICIPANT_TABLE_DDL);
            db()->exec(EVENT_MIGRATION_TABLE_DDL);
        } catch (PDOException $error) {
            error_log((string) $error);
            throw new ApiError('Tabellen event/event_teilnehmer fehlen und konnten nicht angelegt werden - bitte das Schema aus server/db/schema.mysql.sql einspielen.', 503);
        }
        clearSchemaCache();
    }
    migrateLegacyEvents();
}

/** Je alte Liste in einer Transaktion: entweder Event, Teilnehmer und Vermerk - oder nichts. */
function migrateLegacyEvents(): void
{
    $done = db()->query('SELECT schluessel FROM event_migration')->fetchAll(PDO::FETCH_COLUMN);
    foreach (legacyEventDefinitions() as $event) {
        if (in_array($event['schluessel'], $done, true)) continue;
        try {
            db()->beginTransaction();
            // Der Vermerk zuerst: ein gleichzeitiger Aufruf wartet hier auf die Sperre und scheitert danach am Primaerschluessel.
            db()->prepare('INSERT INTO event_migration (schluessel) VALUES (?)')->execute([$event['schluessel']]);
            db()->prepare('INSERT INTO event (schluessel, bezeichnung, symbol, max_plaetze, essensauswahl, pdf_hinweis) VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([$event['schluessel'], $event['bezeichnung'], $event['symbol'], $event['max_plaetze'], json_encode($event['essensauswahl'], JSON_UNESCAPED_UNICODE), $event['pdf_hinweis']]);
            $eventId = (int) db()->lastInsertId();

            $legacyTable = $event['schluessel'] . '_teilnehmer';
            if (tableExists($legacyTable)) {
                $meal = tableHasColumn($legacyTable, 'essensauswahl') ? 'essensauswahl' : "''";
                $abgesagt = tableHasColumn($legacyTable, 'abgesagt') ? 'abgesagt' : '0';
                // In Anmeldereihenfolge: die Liste zaehlt ihre Plaetze nach der ID.
                db()->prepare(
                    'INSERT INTO event_teilnehmer (event_id, name, vorname, essensauswahl, bezahlt, abgesagt, bemerkung, mitglied_id, created_at, updated_at) '
                    . "SELECT ?, name, vorname, {$meal}, bezahlt, {$abgesagt}, bemerkung, mitglied_id, created_at, updated_at FROM {$legacyTable} ORDER BY id"
                )->execute([$eventId]);
            }
            db()->commit();
        } catch (PDOException $error) {
            if (db()->inTransaction()) db()->rollBack();
            // Ein gleichzeitiger Aufruf war schneller - dann ist die Liste schon umgezogen.
            if ($error->getCode() === '23000' && legacyEventMigrated($event['schluessel'])) continue;
            error_log((string) $error);
            throw new ApiError('Die bisherige Teilnehmerliste ' . $event['bezeichnung'] . ' konnte nicht uebernommen werden. Beim naechsten Aufruf wird es erneut versucht.', 503);
        }
    }
}

function legacyEventMigrated(string $key): bool
{
    $statement = db()->prepare('SELECT 1 FROM event_migration WHERE schluessel = ?');
    $statement->execute([$key]);
    return (bool) $statement->fetchColumn();
}

function decodeEventMeals(?string $json): array
{
    $meals = json_decode((string) $json, true);
    return is_array($meals) ? array_values(array_filter($meals, 'is_string')) : [];
}

function eventRowToApi(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'key' => (string) $row['schluessel'],
        'label' => (string) $row['bezeichnung'],
        'datum' => $row['datum'] === null ? null : (string) $row['datum'],
        'symbol' => (string) $row['symbol'],
        'maxSeats' => $row['max_plaetze'] === null ? null : (int) $row['max_plaetze'],
        'mealOptions' => decodeEventMeals($row['essensauswahl']),
        'preis' => $row['preis'] === null ? null : (float) $row['preis'],
        'pdfHinweis' => (string) $row['pdf_hinweis'],
        'archiviert' => (bool) $row['archiviert'],
        'participantCount' => (int) ($row['teilnehmer'] ?? 0),
    ];
}

/** Zaehlt nur, wer noch teilnimmt - Abgesagte stehen zwar in der Liste, belegen aber keinen Platz. */
function eventSelect(): string
{
    return 'SELECT e.*, (SELECT COUNT(*) FROM event_teilnehmer t WHERE t.event_id = e.id AND t.abgesagt = 0) AS teilnehmer FROM event e';
}

function findEventById(int $id): ?array
{
    $statement = db()->prepare(eventSelect() . ' WHERE e.id = ?');
    $statement->execute([$id]);
    $row = $statement->fetch();
    return $row ? eventRowToApi($row) : null;
}

function eventDefinition(string $key): array
{
    ensureEventTables();
    $statement = db()->prepare(eventSelect() . ' WHERE e.schluessel = ?');
    $statement->execute([$key]);
    $row = $statement->fetch();
    if (!$row) throw new ApiError('Unbekanntes Event: ' . $key, 404);
    return eventRowToApi($row);
}

/** "Sommerfest 2027" -> "sommerfest2027": nur a-z und Ziffern, damit Pfad und DOM-Ids ohne Escaping auskommen. */
function eventKeyFromLabel(string $label): string
{
    $text = strtolower(strtr($label, ['ä' => 'ae', 'ö' => 'oe', 'ü' => 'ue', 'Ä' => 'ae', 'Ö' => 'oe', 'Ü' => 'ue', 'ß' => 'ss']));
    // Weitere Sonderzeichen fallen weg - iconv ist beim Hoster nicht sicher da.
    $key = substr((string) preg_replace('/[^a-z0-9]+/', '', $text), 0, 30);
    return $key !== '' ? $key : 'event';
}

function uniqueEventKey(string $label): string
{
    $base = eventKeyFromLabel($label);
    $statement = db()->prepare('SELECT 1 FROM event WHERE schluessel = ?');
    for ($suffix = 1; ; $suffix++) {
        $key = $suffix === 1 ? $base : $base . $suffix;
        $statement->execute([$key]);
        if (!$statement->fetchColumn()) return $key;
    }
}

function normalizeEventSettings(array $payload): array
{
    $known = ['id', 'key', 'label', 'datum', 'symbol', 'maxSeats', 'mealOptions', 'preis', 'pdfHinweis', 'archiviert', 'participantCount'];
    $unknown = array_diff(array_keys($payload), $known);
    if ($unknown) throw new ApiError('Unbekannte Felder: ' . implode(', ', $unknown), 400);

    $label = trim((string) ($payload['label'] ?? ''));
    if ($label === '') throw new ApiError('Bezeichnung des Events fehlt.', 400);
    assertMaxTextLength('Bezeichnung', $label, 120);

    $datum = trim((string) ($payload['datum'] ?? ''));
    if ($datum !== '') {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $datum);
        if (!$date || $date->format('Y-m-d') !== $datum) throw new ApiError('Datum muss im Format JJJJ-MM-TT sein.', 400);
    }

    $symbol = (string) ($payload['symbol'] ?? 'kalender');
    if (!in_array($symbol, EVENT_SYMBOLS, true)) throw new ApiError('Symbol muss ' . implode(', ', EVENT_SYMBOLS) . ' sein.', 400);

    $maxSeats = $payload['maxSeats'] ?? null;
    if ($maxSeats !== null && $maxSeats !== '') {
        if (filter_var($maxSeats, FILTER_VALIDATE_INT) === false || (int) $maxSeats < 1 || (int) $maxSeats > 1000) {
            throw new ApiError('Plaetze muessen eine ganze Zahl zwischen 1 und 1000 sein.', 400);
        }
        $maxSeats = (int) $maxSeats;
    } else {
        $maxSeats = null;
    }

    $meals = $payload['mealOptions'] ?? [];
    if (!is_array($meals)) throw new ApiError('Essensauswahl muss eine Liste sein.', 400);
    $mealOptions = [];
    foreach ($meals as $meal) {
        $meal = trim((string) $meal);
        if ($meal === '') continue;
        assertMaxTextLength('Ein Gericht', $meal, 60);
        foreach ($mealOptions as $existing) {
            if (strcasecmp($existing, $meal) === 0) throw new ApiError("Das Gericht \"$meal\" steht doppelt in der Essensauswahl.", 400);
        }
        $mealOptions[] = $meal;
    }
    if (count($mealOptions) > 10) throw new ApiError('Hoechstens 10 Gerichte zur Auswahl.', 400);

    $preis = $payload['preis'] ?? null;
    if ($preis !== null && $preis !== '') {
        if (!is_numeric($preis) || (float) $preis < 0 || (float) $preis > 100000) throw new ApiError('Preis muss ein Betrag ab 0 sein.', 400);
        $preis = round((float) $preis, 2);
    } else {
        $preis = null;
    }

    $pdfHinweis = trim((string) ($payload['pdfHinweis'] ?? ''));
    assertMaxTextLength('Hinweis fuer die PDF-Liste', $pdfHinweis, 255);

    return [
        'bezeichnung' => $label,
        'datum' => $datum === '' ? null : $datum,
        'symbol' => $symbol,
        'max_plaetze' => $maxSeats,
        'essensauswahl' => json_encode($mealOptions, JSON_UNESCAPED_UNICODE),
        'preis' => $preis,
        'pdf_hinweis' => $pdfHinweis,
        'archiviert' => (int) (bool) ($payload['archiviert'] ?? false),
    ];
}

/** Ein Gericht, das noch jemand gewaehlt hat, darf nicht aus der Auswahl verschwinden. */
function assertEventMealsStillCover(int $eventId, array $mealOptions): void
{
    if (!$mealOptions) return;
    $placeholders = implode(', ', array_fill(0, count($mealOptions), '?'));
    $statement = db()->prepare(
        "SELECT essensauswahl, COUNT(*) AS anzahl FROM event_teilnehmer WHERE event_id = ? AND essensauswahl <> '' AND essensauswahl NOT IN ({$placeholders}) GROUP BY essensauswahl ORDER BY essensauswahl"
    );
    $statement->execute([$eventId, ...$mealOptions]);
    $row = $statement->fetch();
    if (!$row) return;
    $count = (int) $row['anzahl'];
    throw new ApiError("\"{$row['essensauswahl']}\" haben noch $count Teilnehmer gewaehlt - bitte erst bei ihnen ein anderes Gericht eintragen.", 409);
}

function handleEventsCollection(): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'POST']);
    ensureEventTables();

    if ($method === 'GET') {
        $rows = db()->query(eventSelect() . ' ORDER BY e.datum IS NULL, e.datum, e.bezeichnung, e.id')->fetchAll();
        jsonResponse(['events' => array_map('eventRowToApi', $rows)]);
    }

    $settings = normalizeEventSettings(readJsonBody());
    $settings['schluessel'] = uniqueEventKey($settings['bezeichnung']);
    $columns = array_keys($settings);
    try {
        db()->prepare('INSERT INTO event (' . implode(', ', $columns) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')')
            ->execute(array_values($settings));
    } catch (PDOException $error) {
        // Zwei Benutzer legen gleichzeitig ein gleichnamiges Event an.
        if ($error->getCode() === '23000') throw new ApiError('Das Event wurde gerade schon angelegt - bitte die Seite neu laden.', 409);
        throw $error;
    }
    jsonResponse(['event' => findEventById((int) db()->lastInsertId())], 201);
}

function handleEventResource(int $id): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'PUT', 'DELETE']);
    ensureEventTables();
    $existing = findEventById($id);
    if (!$existing) throw new ApiError('Event nicht gefunden.', 404);

    if ($method === 'GET') {
        jsonResponse(['event' => $existing]);
    }

    if ($method === 'PUT') {
        $settings = normalizeEventSettings(readJsonBody());
        assertEventMealsStillCover($id, decodeEventMeals($settings['essensauswahl']));
        $assignments = implode(', ', array_map(static fn(string $column) => $column . ' = ?', array_keys($settings)));
        db()->prepare('UPDATE event SET ' . $assignments . ' WHERE id = ?')->execute([...array_values($settings), $id]);
        jsonResponse(['event' => findEventById($id)]);
    }

    // Loeschen nur fuer leere Listen (z.B. versehentlich angelegt) - alles andere wird archiviert.
    $statement = db()->prepare('SELECT COUNT(*) FROM event_teilnehmer WHERE event_id = ?');
    $statement->execute([$id]);
    $count = (int) $statement->fetchColumn();
    if ($count > 0) {
        throw new ApiError("{$existing['label']} hat noch $count " . ($count === 1 ? 'Eintrag' : 'Eintraege') . ' in der Teilnehmerliste - bitte archivieren statt loeschen.', 409);
    }
    db()->prepare('DELETE FROM event WHERE id = ?')->execute([$id]);
    noContent();
}

const EVENT_PARTICIPANT_COLUMNS = ['name', 'vorname', 'essensauswahl', 'bezahlt', 'abgesagt', 'bemerkung', 'mitglied_id'];

/** Akzeptiert auch die Schreibweisen der Papierliste ("Zanderfilet", "Rinderbäckchen"). */
function normalizeEventMeal(array $event, mixed $value): string
{
    $options = $event['mealOptions'];
    $text = trim((string) $value);
    // Erst der genaue Name, dann der Wortanfang - sonst wuerde "Rinderroulade" zu "Rind".
    foreach ($options as $option) {
        if (strcasecmp($text, $option) === 0) return $option;
    }
    foreach ($options as $option) {
        // stripos genuegt: die Endungen der Papierliste ("Rinderbaeckchen") tragen zwar Umlaute,
        // der Anfang aber nicht - und mbstring ist beim Hoster nicht sicher da.
        if (stripos($text, $option) === 0) return $option;
    }
    throw new ApiError('Essensauswahl muss ' . implode(', ', $options) . ' sein.', 400);
}

function normalizeEventInput(array $event, array $payload, bool $partial = false): array
{
    $meals = $event['mealOptions'];
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

/** Verhindert doppelte Eintraege innerhalb derselben Teilnehmerliste. */
function assertEventParticipantNotExists(array $event, array $participant): void
{
    if ($participant['mitgliedId'] !== null) {
        $statement = db()->prepare(
            'SELECT 1 FROM event_teilnehmer WHERE event_id = ?'
            . ' AND (mitglied_id = ? OR (mitglied_id IS NULL AND name = ? AND vorname = ?)) LIMIT 1'
        );
        $statement->execute([$event['id'], $participant['mitgliedId'], $participant['name'], $participant['vorname']]);
    } else {
        $statement = db()->prepare('SELECT 1 FROM event_teilnehmer WHERE event_id = ? AND name = ? AND vorname = ? LIMIT 1');
        $statement->execute([$event['id'], $participant['name'], $participant['vorname']]);
    }
    if (!$statement->fetchColumn()) return;

    $fullName = trim($participant['vorname'] . ' ' . $participant['name']);
    throw new ApiError($fullName . ' ist bereits in dieser Teilnehmerliste vorhanden.', 409);
}

/** Events ohne Essensauswahl kennen das Feld auch in der API nicht. */
function eventParticipantRowToApi(array $event, array $row): array
{
    return array_merge(
        [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'vorname' => (string) $row['vorname'],
        ],
        $event['mealOptions'] ? ['essensauswahl' => (string) $row['essensauswahl']] : [],
        [
            'bezahlt' => (bool) $row['bezahlt'],
            'abgesagt' => (bool) $row['abgesagt'],
            'bemerkung' => (string) ($row['bemerkung'] ?? ''),
            'mitgliedId' => $row['mitglied_id'] === null ? null : (int) $row['mitglied_id'],
        ]
    );
}

/** Bringt den Datensatz in die Reihenfolge der Tabellenspalten - fuer INSERT und UPDATE gleich. */
function eventParticipantValues(array $participant): array
{
    return array_map(static fn(string $column) => match ($column) {
        'mitglied_id' => $participant['mitgliedId'],
        'bezahlt', 'abgesagt' => (int) $participant[$column],
        'essensauswahl' => $participant['essensauswahl'] ?? '',
        default => $participant[$column],
    }, EVENT_PARTICIPANT_COLUMNS);
}

/** Speichert eine eindeutige Namenszuordnung dauerhaft in der Teilnehmerliste. */
function linkEventParticipantToMember(int $participantId): void
{
    db()->prepare(
        'UPDATE event_teilnehmer t JOIN ('
        . 'SELECT name, vorname, MIN(id) AS id FROM mitglied GROUP BY name, vorname HAVING COUNT(*) = 1'
        . ') m ON m.name = t.name AND m.vorname = t.vorname '
        . 'SET t.mitglied_id = m.id WHERE t.mitglied_id IS NULL AND t.id = ?'
    )->execute([$participantId]);
}

function findEventParticipantById(array $event, int $id): ?array
{
    $statement = db()->prepare('SELECT * FROM event_teilnehmer WHERE event_id = ? AND id = ?');
    $statement->execute([$event['id'], $id]);
    $row = $statement->fetch();
    return $row ? eventParticipantRowToApi($event, $row) : null;
}

function handleEventParticipantCollection(string $key): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'POST']);
    $event = eventDefinition($key);

    if ($method === 'GET') {
        $statement = db()->prepare('SELECT * FROM event_teilnehmer WHERE event_id = ? ORDER BY name, vorname, id');
        $statement->execute([$event['id']]);
        jsonResponse(['participants' => array_map(static fn(array $row) => eventParticipantRowToApi($event, $row), $statement->fetchAll())]);
    }

    if ($method === 'POST') {
        $participant = normalizeEventInput($event, readJsonBody());
        assertEventMemberExists($participant['mitgliedId']);
        assertEventParticipantNotExists($event, $participant);
        $columns = ['event_id', ...EVENT_PARTICIPANT_COLUMNS];
        $placeholders = implode(', ', array_fill(0, count($columns), '?'));
        db()->prepare('INSERT INTO event_teilnehmer (' . implode(', ', $columns) . ') VALUES (' . $placeholders . ')')
            ->execute([$event['id'], ...eventParticipantValues($participant)]);
        $id = (int) db()->lastInsertId();
        linkEventParticipantToMember($id);
        jsonResponse(['participant' => findEventParticipantById($event, $id)], 201);
    }
    unhandledMethod();
}

function handleEventParticipantResource(string $key, int $id): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'PUT', 'PATCH', 'DELETE']);
    $event = eventDefinition($key);
    $existing = findEventParticipantById($event, $id);
    if (!$existing) throw new ApiError('Teilnehmer nicht gefunden.', 404);

    if ($method === 'GET') {
        jsonResponse(['participant' => $existing]);
    }

    if ($method === 'PUT' || $method === 'PATCH') {
        $payload = readJsonBody();
        $patch = normalizeEventInput($event, $payload, $method === 'PATCH');
        // Ohne mitgeschicktes Gericht bleibt das gespeicherte - auch bei PUT nicht stillschweigend das erste der Auswahl.
        if (!array_key_exists('essensauswahl', $payload)) unset($patch['essensauswahl']);
        $participant = array_replace($existing, $patch);
        $nameChanged = $participant['name'] !== $existing['name'] || $participant['vorname'] !== $existing['vorname'];
        if ($nameChanged) $participant['mitgliedId'] = null;
        assertEventMemberExists($participant['mitgliedId']);
        $assignments = implode(', ', array_map(static fn(string $column) => $column . ' = ?', EVENT_PARTICIPANT_COLUMNS));
        // Ohne Essensauswahl bleibt ein frueher gewaehltes Gericht stehen, falls die Auswahl zurueckkommt.
        if (!$event['mealOptions']) {
            $statement = db()->prepare('SELECT essensauswahl FROM event_teilnehmer WHERE id = ?');
            $statement->execute([$id]);
            $participant['essensauswahl'] = (string) $statement->fetchColumn();
        }
        db()->prepare('UPDATE event_teilnehmer SET ' . $assignments . ' WHERE id = ?')
            ->execute([...eventParticipantValues($participant), $id]);
        linkEventParticipantToMember($id);
        jsonResponse(['participant' => findEventParticipantById($event, $id)]);
    }

    if ($method === 'DELETE') {
        db()->prepare('DELETE FROM event_teilnehmer WHERE id = ?')->execute([$id]);
        noContent();
    }
    unhandledMethod();
}


const GEOCODE_TABLE_DDL = 'CREATE TABLE IF NOT EXISTS adress_koordinate (
  adresse_key VARCHAR(255) NOT NULL,
  lon DOUBLE NULL,
  lat DOUBLE NULL,
  genau TINYINT(1) NOT NULL DEFAULT 0,
  ermittelt_am TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (adresse_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/** Wie ensureEventTables: fehlt die Tabelle, legen wir sie an; sonst lesbarer Hinweis statt 500er. */
function ensureGeocodeTable(): void
{
    if (tableExists('adress_koordinate')) return;
    try {
        db()->exec(GEOCODE_TABLE_DDL);
    } catch (PDOException $error) {
        error_log((string) $error);
        throw new ApiError('Tabelle adress_koordinate fehlt und konnte nicht angelegt werden - bitte das Schema aus server/db/schema.mysql.sql einspielen.', 503);
    }
    clearSchemaCache();
}

/** Prueft einen vom Browser gemeldeten Nominatim-Treffer; null = Anschrift nicht gefunden. */
function normalizeGeocodeInput(array $payload): array
{
    $key = trim((string) ($payload['key'] ?? ''));
    if ($key === '' || strlen($key) > 255) throw new ApiError('Schluessel der Anschrift fehlt oder ist zu lang.', 400);
    $result = $payload['result'] ?? null;
    if ($result === null) return [$key, null, null, 0];

    if (!is_array($result) || !is_numeric($result['lon'] ?? null) || !is_numeric($result['lat'] ?? null)) {
        throw new ApiError('Koordinaten muessen Zahlen sein.', 400);
    }
    [$lon, $lat] = [(float) $result['lon'], (float) $result['lat']];
    if ($lon < -180 || $lon > 180 || $lat < -90 || $lat > 90) throw new ApiError('Koordinaten ausserhalb des gueltigen Bereichs.', 400);
    $quality = (string) ($result['quality'] ?? '');
    if (!in_array($quality, ['genau', 'strasse'], true)) throw new ApiError('Genauigkeit muss genau oder strasse sein.', 400);
    return [$key, $lon, $lat, $quality === 'genau' ? 1 : 0];
}

function handleGeocodeCache(): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'POST']);
    ensureGeocodeTable();

    if ($method === 'GET') {
        $entries = [];
        foreach (db()->query('SELECT adresse_key, lon, lat, genau FROM adress_koordinate')->fetchAll() as $row) {
            $entries[$row['adresse_key']] = $row['lon'] === null ? null : ['lon' => (float) $row['lon'], 'lat' => (float) $row['lat'], 'quality' => (int) $row['genau'] === 1 ? 'genau' : 'strasse'];
        }
        jsonResponse(['entries' => (object) $entries]);
    }

    [$key, $lon, $lat, $exact] = normalizeGeocodeInput(readJsonBody());
    db()->prepare(
        'INSERT INTO adress_koordinate (adresse_key, lon, lat, genau) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE lon = VALUES(lon), lat = VALUES(lat), genau = VALUES(genau), ermittelt_am = CURRENT_TIMESTAMP'
    )->execute([$key, $lon, $lat, $exact]);
    noContent();
}

const EXTERNAL_CONTACT_TABLE_DDL = 'CREATE TABLE IF NOT EXISTS externe_kontakte (
  id INT NOT NULL AUTO_INCREMENT,
  kategorie VARCHAR(80) NOT NULL DEFAULT \'\',
  firma VARCHAR(200) NOT NULL DEFAULT \'\',
  name VARCHAR(120) NOT NULL DEFAULT \'\',
  vorname VARCHAR(120) NOT NULL DEFAULT \'\',
  zustaendigkeit VARCHAR(160) NOT NULL DEFAULT \'\',
  strasse VARCHAR(200) NOT NULL DEFAULT \'\',
  plz VARCHAR(12) NOT NULL DEFAULT \'\',
  ort VARCHAR(120) NOT NULL DEFAULT \'\',
  telefon VARCHAR(80) NOT NULL DEFAULT \'\',
  handy VARCHAR(80) NOT NULL DEFAULT \'\',
  email VARCHAR(254) NOT NULL DEFAULT \'\',
  webseite VARCHAR(255) NOT NULL DEFAULT \'\',
  bemerkung TEXT NULL,
  favorit TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_externe_kontakte_kategorie (kategorie),
  INDEX idx_externe_kontakte_name (name, vorname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

const EXTERNAL_CONTACT_CATEGORY_TABLE_DDL = 'CREATE TABLE IF NOT EXISTS externe_kontakt_kategorie (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_externe_kontakt_kategorie_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/** Wie ensureEventTables: fehlt eine Tabelle, legen wir sie an; sonst lesbarer Hinweis statt 500er. */
function ensureExternalContactTables(): void
{
    $tables = [
        'externe_kontakte' => EXTERNAL_CONTACT_TABLE_DDL,
        'externe_kontakt_kategorie' => EXTERNAL_CONTACT_CATEGORY_TABLE_DDL,
    ];
    foreach ($tables as $table => $ddl) {
        if (tableExists($table)) continue;
        try {
            db()->exec($ddl);
        } catch (PDOException $error) {
            error_log((string) $error);
            throw new ApiError("Tabelle $table fehlt und konnte nicht angelegt werden - bitte das Schema aus server/db/schema.mysql.sql einspielen.", 503);
        }
        clearSchemaCache();
    }
}

/** Textspalten der Adressverwaltung mit ihrer Hoechstlaenge; JSON-Schluessel = Spaltenname. */
function externalContactTextFields(): array
{
    return [
        'kategorie' => 80,
        'firma' => 200,
        'name' => 120,
        'vorname' => 120,
        'zustaendigkeit' => 160,
        'strasse' => 200,
        'plz' => 12,
        'ort' => 120,
        'telefon' => 80,
        'handy' => 80,
        'email' => 254,
        'webseite' => 255,
    ];
}

function externalContactColumns(): array
{
    return [...array_keys(externalContactTextFields()), 'bemerkung', 'favorit'];
}

/** Zaehlt Zeichen statt Bytes - mbstring ist beim Hoster nicht sicher da. */
function assertMaxTextLength(string $label, string $value, int $max): void
{
    if (preg_match('/^.{0,' . $max . '}$/su', $value) !== 1) {
        throw new ApiError("$label darf hoechstens $max Zeichen lang sein.", 400);
    }
}

function normalizeExternalContactInput(array $payload, bool $partial = false): array
{
    $unknown = array_diff(array_keys($payload), ['id', ...externalContactColumns()]);
    if ($unknown) throw new ApiError('Unbekannte Felder: ' . implode(', ', $unknown), 400);

    $contact = [];
    foreach (externalContactTextFields() as $field => $max) {
        if ($partial && !array_key_exists($field, $payload)) continue;
        $value = $field === 'email' ? normalizeEmailValue($payload[$field] ?? '') : trim((string) ($payload[$field] ?? ''));
        assertMaxTextLength($field, $value, $max);
        $contact[$field] = $value;
    }
    if (!$partial || array_key_exists('bemerkung', $payload)) {
        $contact['bemerkung'] = trim((string) ($payload['bemerkung'] ?? ''));
    }
    if (!$partial || array_key_exists('favorit', $payload)) {
        $contact['favorit'] = (bool) ($payload['favorit'] ?? false);
    }
    return $contact;
}

/** Feste Kategorien der Adressverwaltung, wie CONTACT_CATEGORY_SUGGESTIONS in src/contact-domain.js. */
const EXTERNAL_CONTACT_CATEGORIES = [
    'Musiker', 'Bezirksamt', 'Reinigung', 'Vermieter', 'Handwerker',
    'Catering', 'Busunternehmen', 'Referenten', 'Presse', 'Sonstiges',
];

/** Eine Kategorie gibt es, wenn sie fest ist, ein Admin sie angelegt hat oder ein Kontakt sie benutzt. */
function externalContactCategoryExists(string $kategorie): bool
{
    foreach (EXTERNAL_CONTACT_CATEGORIES as $known) {
        if (strcasecmp($known, $kategorie) === 0) return true;
    }
    // Die Spalten vergleichen ohne Gross-/Kleinschreibung (utf8mb4_unicode_ci), wie die Oberflaeche.
    $statement = db()->prepare(
        'SELECT 1 FROM externe_kontakt_kategorie WHERE name = ?
         UNION ALL SELECT 1 FROM externe_kontakte WHERE kategorie = ? LIMIT 1'
    );
    $statement->execute([$kategorie, $kategorie]);
    return (bool) $statement->fetchColumn();
}

/** Neue Kategorien legt nur ein Admin an - alle anderen waehlen eine vorhandene. */
function assertExternalContactCategoryAllowed(array $user, string $kategorie): void
{
    if ($kategorie === '' || ($user['role'] ?? '') === 'admin') return;
    if (!externalContactCategoryExists($kategorie)) {
        throw new ApiError('Neue Kategorien kann nur ein Admin anlegen.', 403);
    }
}

/** Ein Kontakt ohne Name und Firma liesse sich in der Liste nicht wiederfinden. */
function assertValidExternalContact(array $contact): void
{
    if (trim($contact['name'] . $contact['firma']) === '') {
        throw new ApiError('Name oder Firma ist erforderlich.', 400);
    }
}

function externalContactRowToApi(array $row): array
{
    $contact = ['id' => (int) $row['id']];
    foreach (array_keys(externalContactTextFields()) as $field) {
        $contact[$field] = (string) $row[$field];
    }
    $contact['bemerkung'] = (string) ($row['bemerkung'] ?? '');
    $contact['favorit'] = (bool) $row['favorit'];
    return $contact;
}

function externalContactValues(array $contact): array
{
    return array_map(
        static fn(string $column) => $column === 'favorit' ? (int) $contact[$column] : $contact[$column],
        externalContactColumns()
    );
}

function findExternalContactById(int $id): ?array
{
    $statement = db()->prepare('SELECT id, ' . implode(', ', externalContactColumns()) . ' FROM externe_kontakte WHERE id = ?');
    $statement->execute([$id]);
    $row = $statement->fetch();
    return $row ? externalContactRowToApi($row) : null;
}

function handleExternalContactCollection(array $currentUser): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'POST']);
    ensureExternalContactTables();
    $columns = externalContactColumns();

    if ($method === 'GET') {
        $rows = db()->query('SELECT id, ' . implode(', ', $columns) . ' FROM externe_kontakte ORDER BY kategorie, firma, name, vorname, id')->fetchAll();
        jsonResponse(['contacts' => array_map('externalContactRowToApi', $rows)]);
    }

    $contact = normalizeExternalContactInput(readJsonBody());
    assertValidExternalContact($contact);
    assertExternalContactCategoryAllowed($currentUser, $contact['kategorie']);
    $placeholders = implode(', ', array_fill(0, count($columns), '?'));
    db()->prepare('INSERT INTO externe_kontakte (' . implode(', ', $columns) . ') VALUES (' . $placeholders . ')')
        ->execute(externalContactValues($contact));
    jsonResponse(['contact' => findExternalContactById((int) db()->lastInsertId())], 201);
}

function handleExternalContactResource(array $currentUser, int $id): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'PUT', 'PATCH', 'DELETE']);
    ensureExternalContactTables();
    $existing = findExternalContactById($id);
    if (!$existing) throw new ApiError('Kontakt nicht gefunden.', 404);

    if ($method === 'GET') {
        jsonResponse(['contact' => $existing]);
    }

    if ($method === 'DELETE') {
        db()->prepare('DELETE FROM externe_kontakte WHERE id = ?')->execute([$id]);
        noContent();
    }

    $contact = array_replace($existing, normalizeExternalContactInput(readJsonBody(), $method === 'PATCH'));
    assertValidExternalContact($contact);
    assertExternalContactCategoryAllowed($currentUser, $contact['kategorie']);
    $assignments = implode(', ', array_map(static fn(string $column) => $column . ' = ?', externalContactColumns()));
    db()->prepare('UPDATE externe_kontakte SET ' . $assignments . ' WHERE id = ?')
        ->execute([...externalContactValues($contact), $id]);
    jsonResponse(['contact' => findExternalContactById($id)]);
}

function externalContactCategoryRowToApi(array $row): array
{
    return ['id' => (int) $row['id'], 'name' => (string) $row['name']];
}

/** Von Admins angelegte Kategorien - auch solche, die noch kein Kontakt benutzt. Lesen duerfen alle. */
function handleExternalContactCategoryCollection(array $currentUser): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'POST']);
    ensureExternalContactTables();

    if ($method === 'GET') {
        $rows = db()->query('SELECT id, name FROM externe_kontakt_kategorie ORDER BY name, id')->fetchAll();
        jsonResponse(['categories' => array_map('externalContactCategoryRowToApi', $rows)]);
    }

    requireAdmin($currentUser);
    $payload = readJsonBody();
    $unknown = array_diff(array_keys($payload), ['name']);
    if ($unknown) throw new ApiError('Unbekannte Felder: ' . implode(', ', $unknown), 400);
    $name = trim((string) ($payload['name'] ?? ''));
    if ($name === '') throw new ApiError('Name der Kategorie fehlt.', 400);
    assertMaxTextLength('Kategorie', $name, 80);
    if (externalContactCategoryExists($name)) {
        throw new ApiError("Die Kategorie \"$name\" gibt es schon.", 409);
    }

    try {
        db()->prepare('INSERT INTO externe_kontakt_kategorie (name) VALUES (?)')->execute([$name]);
    } catch (PDOException $error) {
        // Zwei Admins legen gleichzeitig dieselbe Kategorie an.
        if ($error->getCode() === '23000') throw new ApiError("Die Kategorie \"$name\" gibt es schon.", 409);
        throw $error;
    }
    jsonResponse(['category' => ['id' => (int) db()->lastInsertId(), 'name' => $name]], 201);
}

/** Loeschen geht nur, solange kein Kontakt die Kategorie benutzt - sonst stuende er ploetzlich in einer unbekannten. */
function handleExternalContactCategoryResource(array $currentUser, int $id): void
{
    assertMethodAllowed($_SERVER['REQUEST_METHOD'], ['DELETE']);
    requireAdmin($currentUser);
    ensureExternalContactTables();

    $statement = db()->prepare('SELECT name FROM externe_kontakt_kategorie WHERE id = ?');
    $statement->execute([$id]);
    $name = $statement->fetchColumn();
    if ($name === false) throw new ApiError('Kategorie nicht gefunden.', 404);

    $statement = db()->prepare('SELECT COUNT(*) FROM externe_kontakte WHERE kategorie = ?');
    $statement->execute([$name]);
    $used = (int) $statement->fetchColumn();
    if ($used > 0) {
        throw new ApiError("Die Kategorie \"$name\" wird noch von $used " . ($used === 1 ? 'Kontakt' : 'Kontakten') . ' benutzt.', 409);
    }

    db()->prepare('DELETE FROM externe_kontakt_kategorie WHERE id = ?')->execute([$id]);
    noContent();
}
