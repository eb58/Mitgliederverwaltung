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

function db(): PDO
{
    static $pdo = null;
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

function tableHasColumn(string $table, string $column): bool
{
    static $cache = [];
    $key = $table . '.' . $column;
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
    static $cache = [];
    if (array_key_exists($table, $cache)) return $cache[$table];

    $statement = db()->prepare(
        'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
    );
    $statement->execute([$table]);
    $cache[$table] = (int) $statement->fetchColumn() > 0;
    return $cache[$table];
}

function sendCorsHeaders(): void
{
    header('Access-Control-Allow-Origin: ' . config()['cors_origin']);
    header('Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS');
    header('Access-Control-Allow-Headers: Authorization,Content-Type,X-File-Name');
}

function jsonResponse(mixed $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function noContent(): void
{
    http_response_code(204);
    exit;
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

function readJsonBody(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') return [];
    $payload = json_decode($raw, true);
    if (!is_array($payload)) {
        throw new ApiError('Ungueltiger JSON-Body.', 400);
    }
    return $payload;
}

function bearerToken(): string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$header && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    return preg_match('/^Bearer\s+(.+)$/i', $header, $matches) ? $matches[1] : '';
}

function base64UrlEncode(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function tokenHash(string $token): string
{
    return hash('sha256', $token);
}

function createSession(array $user): string
{
    $token = base64UrlEncode(random_bytes(32));
    $expiresAt = (new DateTimeImmutable())
        ->modify('+' . config()['auth']['session_ttl_seconds'] . ' seconds')
        ->format('Y-m-d H:i:s');
    if (tableHasColumn('app_session', 'password_change_required')) {
        $statement = db()->prepare(
            'INSERT INTO app_session (token_hash, user_id, password_change_required, expires_at) VALUES (?, ?, ?, ?)'
        );
        $statement->execute([tokenHash($token), $user['id'], !empty($user['passwordChangeRequired']) ? 1 : 0, $expiresAt]);
        return $token;
    }

    $statement = db()->prepare('INSERT INTO app_session (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
    $statement->execute([tokenHash($token), $user['id'], $expiresAt]);
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

    $expiresAt = (new DateTimeImmutable())
        ->modify('+' . config()['auth']['session_ttl_seconds'] . ' seconds')
        ->format('Y-m-d H:i:s');
    db()->prepare('UPDATE app_session SET expires_at = ? WHERE token_hash = ?')->execute([$expiresAt, tokenHash($token)]);
    return [
        'id' => (int) $user['id'],
        'username' => $user['username'],
        'role' => $user['role'],
        'passwordChangeRequired' => ($hasSessionPasswordChangeFlag && (bool) $user['password_change_required'])
            || isPasswordChangeRequiredForUser($user),
    ];
}

function requireAdmin(array $user): void
{
    if (($user['role'] ?? '') !== 'admin') {
        throw new ApiError('Administratorrechte erforderlich.', 403);
    }
}

function normalizeUserRole(mixed $role): string
{
    $value = trim((string) ($role ?: 'admin')) ?: 'admin';
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

function handleSession(): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method === 'POST') {
        $body = readJsonBody();
        $statement = db()->prepare('SELECT id, username, password_hash, role, active FROM app_user WHERE username = ?');
        $statement->execute([(string) ($body['username'] ?? '')]);
        $user = $statement->fetch();
        $password = (string) ($body['password'] ?? '');
        $passwordUnset = $user ? isPasswordUnset($user['password_hash'] ?? '') : false;
        $passwordMatches = $passwordUnset
            ? $password === ''
            : ($user && password_verify($password, (string) $user['password_hash']));
        if (!$user || !(bool) $user['active'] || !$passwordMatches) {
            throw new ApiError('Benutzername oder Passwort ist falsch.', 401);
        }
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

    throw new ApiError('Methode nicht erlaubt.', 405);
}

function handleSessionPassword(array $currentUser): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
        throw new ApiError('Methode nicht erlaubt.', 405);
    }

    $body = readJsonBody();
    $password = (string) ($body['password'] ?? $body['newPassword'] ?? '');
    if ($password === '') {
        throw new ApiError('Passwort ist erforderlich.', 400);
    }
    if (valuesMatchIgnoringCase($currentUser['username'] ?? '', $password)) {
        throw new ApiError('Das neue Passwort darf nicht dem Benutzernamen entsprechen.', 400);
    }

    $statement = db()->prepare('UPDATE app_user SET password_hash = ? WHERE id = ?');
    $statement->execute([password_hash($password, PASSWORD_DEFAULT), (int) $currentUser['id']]);
    $token = bearerToken();
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

    if ($method === 'GET') {
        $rows = db()->query('SELECT id, username, role, active FROM app_user ORDER BY username')->fetchAll();
        jsonResponse(['users' => array_map('publicUser', $rows)]);
    }

    if ($method === 'POST') {
        $body = readJsonBody();
        $username = trim((string) ($body['username'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        $role = normalizeUserRole($body['role'] ?? 'admin');
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

    throw new ApiError('Methode nicht erlaubt.', 405);
}

function findUserById(int $id): ?array
{
    $statement = db()->prepare('SELECT id, username, role, active FROM app_user WHERE id = ?');
    $statement->execute([$id]);
    $user = $statement->fetch();
    return $user ? publicUser($user) : null;
}

function handleUserResource(array $currentUser, int $id): void
{
    requireAdmin($currentUser);
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'PUT' || $method === 'PATCH') {
        $existing = findUserById($id);
        if (!$existing) throw new ApiError('Benutzer nicht gefunden.', 404);
        $body = readJsonBody();
        $role = normalizeUserRole($body['role'] ?? $existing['role']);
        $active = array_key_exists('active', $body) ? (bool) $body['active'] : (bool) $existing['active'];
        if ($id === (int) $currentUser['id'] && !$active) {
            throw new ApiError('Der eigene Benutzer kann nicht deaktiviert werden.', 400);
        }
        if ($id === (int) $currentUser['id'] && $role !== 'admin') {
            throw new ApiError('Der eigene Benutzer muss Admin bleiben.', 400);
        }

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

    throw new ApiError('Methode nicht erlaubt.', 405);
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

function handleReferenceDataOverview(array $currentUser): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        throw new ApiError('Methode nicht erlaubt.', 405);
    }
    $payload = [];
    foreach (referenceDefinitions() as $type => $definition) {
        $payload[$definition['listKey']] = listReferenceItems($type);
    }
    jsonResponse($payload);
}

function readReferenceItemPayload(): array
{
    $body = readJsonBody();
    $id = (int) ($body['id'] ?? 0);
    $label = trim((string) ($body['label'] ?? $body['name'] ?? ''));
    if ($id <= 0 || $label === '') {
        throw new ApiError('ID und Bezeichnung sind erforderlich.', 400);
    }
    return ['id' => $id, 'label' => $label];
}

function handleReferenceDataCollection(array $currentUser, string $type): void
{
    $definition = referenceDefinition($type);
    $method = $_SERVER['REQUEST_METHOD'];
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
    throw new ApiError('Methode nicht erlaubt.', 405);
}

function handleReferenceDataResource(array $currentUser, string $type, int $id): void
{
    $definition = referenceDefinition($type);
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method === 'PUT' || $method === 'PATCH') {
        requireAdmin($currentUser);
        $hasActiveColumn = tableHasColumn($definition['table'], 'active');
        $body = readJsonBody();
        $label = trim((string) ($body['label'] ?? $body['name'] ?? ''));
        if ($label === '') {
            throw new ApiError('Bezeichnung ist erforderlich.', 400);
        }
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
    throw new ApiError('Methode nicht erlaubt.', 405);
}

function memberFields(): array
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
        'weihnachtsessen' => 'weihnachtsessen',
        'wnEssenBezahlt' => 'wn_essen_bezahlt',
        'beitragClubBezahlt' => 'beitrag_club_bezahlt',
        'betragClubBar' => 'betrag_club_bar',
        'beitragComputerBezahlt' => 'beitrag_computer_bezahlt',
        'betragComputerBar' => 'betrag_computer_bar',
        'preisClub' => 'preis_club',
        'gezahlterBetragClub' => 'gezahlter_betrag_club',
        'einzahlungClubAm' => 'einzahlung_club_am',
        'preisComputer' => 'preis_computer',
        'gezahlterBetragComputer' => 'gezahlter_betrag_computer',
        'einzahlungComputerAm' => 'einzahlung_computer_am',
        'preisWeihnachten' => 'preis_weihnachten',
        'gezahlterBetragWeihnachten' => 'gezahlter_betrag_weihnachten',
        'bemerkung' => 'bemerkung',
        'tischnummer' => 'tischnummer',
    ];
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
        'preisClub',
        'gezahlterBetragClub',
        'preisComputer',
        'gezahlterBetragComputer',
        'preisWeihnachten',
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
    foreach (memberFields() as $jsonKey => $_column) {
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
    $allowed = array_fill_keys(array_merge(array_keys(memberFields()), ['interessengruppen', 'funktionen']), true);
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
      (SELECT GROUP_CONCAT(mi.interessengruppe_id ORDER BY mi.interessengruppe_id)
       FROM mitglied_interessengruppe mi WHERE mi.mitglied_id = m.id) AS interessengruppen,
      (SELECT GROUP_CONCAT(mf.funktion_id ORDER BY mf.funktion_id)
       FROM mitglied_funktion mf WHERE mf.mitglied_id = m.id) AS funktionen,
      EXISTS (SELECT 1 FROM mitglied_passbild mp WHERE mp.mitglied_id = m.id) AS has_passbild_in_db
      FROM mitglied m";
}

function rowToMember(array $row): array
{
    $member = [];
    foreach (memberFields() as $jsonKey => $column) {
        $value = $row[$column] ?? null;
        if (in_array($jsonKey, booleanFields(), true)) {
            $member[$jsonKey] = (bool) $value;
        } elseif (in_array($jsonKey, dateFields(), true)) {
            $member[$jsonKey] = $value ? substr((string) $value, 0, 10) : null;
        } elseif (in_array($jsonKey, numberFields(), true)) {
            $member[$jsonKey] = $value === null ? null : (float) $value + 0;
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
        'preisClub' => 'Preis Club',
        'gezahlterBetragClub' => 'Gezahlter Betrag Club',
        'einzahlungClubAm' => 'Einzahlung Club am',
        'preisComputer' => 'Preis Computer',
        'gezahlterBetragComputer' => 'Gezahlter Betrag Computer',
        'einzahlungComputerAm' => 'Einzahlung Computer am',
        'preisWeihnachten' => 'Preis Weihnachten',
        'gezahlterBetragWeihnachten' => 'Gezahlter Betrag Weihnachten',
        'bemerkung' => 'Bemerkung',
        'tischnummer' => 'Tischnummer',
        'interessengruppen' => 'Interessengruppen',
        'funktionen' => 'Funktionen',
        'passbild' => 'Passbild',
    ];
}

function hiddenMemberAuditFields(): array
{
    return ['preisClub', 'preisComputer', 'preisWeihnachten'];
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
    if (in_array($field, numberFields(), true)) return $value === null || $value === '' ? null : (float) $value;
    return $value === null ? '' : (string) $value;
}

function buildMemberAuditChanges(array $before, array $after): array
{
    $labels = memberAuditLabels();
    $fields = array_merge(array_keys(memberFields()), ['interessengruppen', 'funktionen']);
    $changes = [];
    foreach ($fields as $field) {
        if (in_array($field, array_merge(['id', 'funktion', 'passbild'], hiddenMemberAuditFields()), true)) continue;
        $oldRaw = $before[$field] ?? null;
        $newRaw = $after[$field] ?? null;
        if (normalizedAuditValue($field, $oldRaw) === normalizedAuditValue($field, $newRaw)) continue;
        $changes[] = [
            'field' => $field,
            'label' => $labels[$field] ?? $field,
            'old' => formatAuditValue($field, $oldRaw),
            'new' => formatAuditValue($field, $newRaw),
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
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        throw new ApiError('Methode nicht erlaubt.', 405);
    }
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
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        throw new ApiError('Methode nicht erlaubt.', 405);
    }
    if (!tableExists('mitglied_aenderung')) {
        jsonResponse(['changes' => []]);
    }

    $limit = min(max((int) ($_GET['limit'] ?? 100), 1), 200);
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

function handleMembersCollection(array $currentUser): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method === 'GET') {
        $limit = min(max((int) ($_GET['limit'] ?? 50), 1), 500);
        $offset = max((int) ($_GET['offset'] ?? 0), 0);
        $params = [];
        $where = '';
        $search = trim((string) ($_GET['search'] ?? ''));
        if ($search !== '') {
            $where = ' WHERE (m.name LIKE ? OR m.vorname LIKE ? OR m.email LIKE ? OR m.telefon LIKE ? OR m.handy LIKE ?)';
            $value = '%' . $search . '%';
            $params = [$value, $value, $value, $value, $value];
        }
        $statement = db()->prepare(baseSelect() . $where . ' ORDER BY m.name, m.vorname LIMIT ? OFFSET ?');
        $statement->execute([...$params, $limit, $offset]);
        jsonResponse(['members' => array_map('rowToMember', $statement->fetchAll())]);
    }

    if ($method === 'POST') {
        $payload = readJsonBody();
        assertKnownFields($payload);
        $member = normalizeMemberInput($payload);
        assertValidMember($member);
        db()->beginTransaction();
        try {
            if (($member['id'] ?? 0) <= 0) {
                $member['id'] = (int) db()->query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM mitglied')->fetch()['next_id'];
            }
            insertMember($member);
            syncJoinTable('mitglied_interessengruppe', 'interessengruppe_id', (int) $member['id'], $member['interessengruppen']);
            syncJoinTable('mitglied_funktion', 'funktion_id', (int) $member['id'], $member['funktionen']);
            auditMemberChange((int) $member['id'], 'created', [], $currentUser);
            db()->commit();
        } catch (Throwable $error) {
            db()->rollBack();
            throw $error;
        }
        jsonResponse(['member' => findMemberById((int) $member['id'])], 201);
    }

    throw new ApiError('Methode nicht erlaubt.', 405);
}

function handleMemberResource(int $id, array $currentUser): void
{
    $method = $_SERVER['REQUEST_METHOD'];
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

    throw new ApiError('Methode nicht erlaubt.', 405);
}

function insertMember(array $member): void
{
    $fields = memberFields();
    unset($fields['id']);
    $columns = array_merge(['id'], array_values($fields));
    $keys = array_merge(['id'], array_keys($fields));
    $placeholders = implode(', ', array_fill(0, count($columns), '?'));
    $statement = db()->prepare('INSERT INTO mitglied (' . implode(', ', $columns) . ') VALUES (' . $placeholders . ')');
    $statement->execute(array_map(static fn(string $key): mixed => $member[$key] ?? null, $keys));
}

function updateMemberColumns(int $id, array $patch): void
{
    $fields = memberFields();
    $assignments = [];
    $values = [];
    foreach ($patch as $key => $value) {
        if ($key === 'id' || !isset($fields[$key])) continue;
        $assignments[] = $fields[$key] . ' = ?';
        $values[] = $value;
    }
    if (!$assignments) return;
    $values[] = $id;
    db()->prepare('UPDATE mitglied SET ' . implode(', ', $assignments) . ' WHERE id = ?')->execute($values);
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

function handleMemberPhoto(int $id, array $currentUser): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method === 'GET') {
        $statement = db()->prepare('SELECT dateiname, mime_type, inhalt FROM mitglied_passbild WHERE mitglied_id = ?');
        $statement->execute([$id]);
        $photo = $statement->fetch();
        if (!$photo) throw new ApiError('Passbild nicht gefunden.', 404);
        header('Content-Type: ' . $photo['mime_type']);
        header('Content-Disposition: inline; filename="' . addslashes($photo['dateiname']) . '"');
        echo $photo['inhalt'];
        exit;
    }

    if ($method === 'PUT') {
        if (!findMemberById($id)) throw new ApiError('Mitglied nicht gefunden.', 404);
        $photoStatement = db()->prepare('SELECT 1 FROM mitglied_passbild WHERE mitglied_id = ?');
        $photoStatement->execute([$id]);
        $hadPhoto = (bool) $photoStatement->fetchColumn();
        $contentType = $_SERVER['CONTENT_TYPE'] ?? 'application/octet-stream';
        if (str_starts_with($contentType, 'application/json')) {
            $body = readJsonBody();
            $fileName = (string) ($body['fileName'] ?? 'passbild.jpg');
            $mimeType = (string) ($body['mimeType'] ?? 'image/jpeg');
            $content = base64_decode((string) ($body['base64'] ?? ''), true);
            if ($content === false || $content === '') throw new ApiError('base64 ist erforderlich.', 400);
        } else {
            $fileName = rawurldecode((string) ($_SERVER['HTTP_X_FILE_NAME'] ?? 'passbild.jpg')) ?: 'passbild.jpg';
            $mimeType = explode(';', $contentType)[0] ?: 'application/octet-stream';
            $content = file_get_contents('php://input') ?: '';
        }
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

    throw new ApiError('Methode nicht erlaubt.', 405);
}
