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

    $statement = db()->prepare(
        "SELECT u.id, u.username, u.role
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
    return ['id' => (int) $user['id'], 'username' => $user['username'], 'role' => $user['role']];
}

function requireAdmin(array $user): void
{
    if (($user['role'] ?? '') !== 'admin') {
        throw new ApiError('Administratorrechte erforderlich.', 403);
    }
}

function handleSession(): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method === 'POST') {
        $body = readJsonBody();
        $statement = db()->prepare('SELECT id, username, password_hash, role, active FROM app_user WHERE username = ?');
        $statement->execute([(string) ($body['username'] ?? '')]);
        $user = $statement->fetch();
        if (!$user || !(bool) $user['active'] || !password_verify((string) ($body['password'] ?? ''), (string) $user['password_hash'])) {
            throw new ApiError('Benutzername oder Passwort ist falsch.', 401);
        }
        $publicUser = ['id' => (int) $user['id'], 'username' => $user['username'], 'role' => $user['role']];
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
        $role = trim((string) ($body['role'] ?? 'admin')) ?: 'admin';
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
        $role = trim((string) ($body['role'] ?? $existing['role'])) ?: 'admin';
        $active = array_key_exists('active', $body) ? (bool) $body['active'] : (bool) $existing['active'];
        if ($id === (int) $currentUser['id'] && !$active) {
            throw new ApiError('Der eigene Benutzer kann nicht deaktiviert werden.', 400);
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

function handleMembersCollection(): void
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
            db()->commit();
        } catch (Throwable $error) {
            db()->rollBack();
            throw $error;
        }
        jsonResponse(['member' => findMemberById((int) $member['id'])], 201);
    }

    throw new ApiError('Methode nicht erlaubt.', 405);
}

function handleMemberResource(int $id): void
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
            db()->commit();
        } catch (Throwable $error) {
            db()->rollBack();
            throw $error;
        }
        jsonResponse(['member' => findMemberById($id)]);
    }

    if ($method === 'DELETE') {
        $statement = db()->prepare('DELETE FROM mitglied WHERE id = ?');
        $statement->execute([$id]);
        if ($statement->rowCount() === 0) throw new ApiError('Mitglied nicht gefunden.', 404);
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

function handleMemberPhoto(int $id): void
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
        jsonResponse(['photo' => ['id' => $id, 'fileName' => $fileName, 'mimeType' => $mimeType, 'size' => strlen($content), 'sha256' => $sha]]);
    }

    if ($method === 'DELETE') {
        $statement = db()->prepare('DELETE FROM mitglied_passbild WHERE mitglied_id = ?');
        $statement->execute([$id]);
        if ($statement->rowCount() === 0) throw new ApiError('Passbild nicht gefunden.', 404);
        noContent();
    }

    throw new ApiError('Methode nicht erlaubt.', 405);
}
