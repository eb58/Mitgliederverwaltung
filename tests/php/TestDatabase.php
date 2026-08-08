<?php
declare(strict_types=1);

/**
 * Verbindung zur Wegwerf-Datenbank aus tests/docker-compose.test.yml.
 * Ist sie nicht erreichbar, ueberspringen die Integrationstests sich selbst.
 */
final class TestDatabase
{
    public const PASSWORD = 'geheim123';

    /** Stammdatentabellen: werden je Test aus dem Schema-Seed neu aufgebaut. */
    private const REFERENCE_TABLES = ['seniorenclub', 'austrittsgrund', 'interessengruppe', 'funktion'];

    private static ?PDO $pdo = null;
    private static ?string $failure = null;
    private static array $hashes = [];
    private static array $referenceSeed = [];
    private static array $expectedTables = [];

    private static function env(string $name, string $fallback): string
    {
        $value = getenv($name);
        return $value === false || $value === '' ? $fallback : $value;
    }

    /** Guenstige Hashes: die Testlaufzeit soll nicht an bcrypt haengen. */
    public static function hash(string $password): string
    {
        return self::$hashes[$password] ??= password_hash($password, PASSWORD_BCRYPT, ['cost' => 4]);
    }

    public static function pdo(): ?PDO
    {
        if (self::$pdo instanceof PDO) return self::$pdo;
        if (self::$failure !== null) return null;

        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
            self::env('MEMBER_TEST_DB_HOST', '127.0.0.1'),
            self::env('MEMBER_TEST_DB_PORT', '3307'),
            self::env('MEMBER_TEST_DB_NAME', 'mitgliederverwaltung_test')
        );
        try {
            $pdo = new PDO($dsn, self::env('MEMBER_TEST_DB_USER', 'root'), self::env('MEMBER_TEST_DB_PASSWORD', 'test'), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_TIMEOUT => 3,
            ]);
        } catch (Throwable $error) {
            self::$failure = $error->getMessage();
            return null;
        }

        // Erst nach erfolgreichem Schema merken: bricht der Aufbau ab (z. B. weil
        // MariaDB gerade seinen Init-Server durchstartet), soll der naechste
        // Aufruf es erneut versuchen statt eine halbfertige DB weiterzureichen.
        self::loadSchema($pdo);
        self::$pdo = $pdo;
        return $pdo;
    }

    public static function skipReason(): string
    {
        return 'Test-Datenbank nicht erreichbar (npm run test:php:db:up). ' . (self::$failure ?? '');
    }

    private static function loadSchema(PDO $pdo): void
    {
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($pdo->query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()')->fetchAll() as $row) {
            $pdo->exec('DROP TABLE IF EXISTS `' . $row['TABLE_NAME'] . '`');
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

        $sql = (string) file_get_contents(__DIR__ . '/../../server/db/schema.mysql.sql');
        $referencePattern = '/^INSERT INTO (' . implode('|', self::REFERENCE_TABLES) . ')\b/i';
        self::$referenceSeed = [];
        self::$expectedTables = [];
        foreach (explode(';', $sql) as $statement) {
            $clean = trim(preg_replace('/^\s*--.*$/m', '', $statement));
            if ($clean === '') continue;
            if (preg_match($referencePattern, $clean)) {
                self::$referenceSeed[] = $clean;
            }
            if (preg_match('/^CREATE TABLE (\w+)/i', $clean, $match)) {
                self::$expectedTables[] = $match[1];
            }
            $pdo->exec($statement);
        }
    }

    private static function schemaIsComplete(PDO $pdo): bool
    {
        $rows = $pdo->query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()')->fetchAll();
        return !array_diff(self::$expectedTables, array_column($rows, 'TABLE_NAME'));
    }

    /** Leert alle veraenderlichen Tabellen und legt die Standardbenutzer neu an. */
    public static function reset(): void
    {
        $pdo = self::pdo();
        if (!$pdo) return;
        // Das tmpfs der Test-DB ist nach einem Container-Neustart leer.
        if (!self::schemaIsComplete($pdo)) self::loadSchema($pdo);

        $tables = ['mitglied_aenderung', 'mitglied_passbild', 'mitglied_funktion', 'mitglied_interessengruppe', 'mitglied', 'app_session', 'app_user', ...self::REFERENCE_TABLES];
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($tables as $table) {
            $pdo->exec('TRUNCATE TABLE ' . $table);
        }
        foreach (self::$referenceSeed as $statement) {
            $pdo->exec($statement);
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

        $insert = $pdo->prepare('INSERT INTO app_user (id, username, password_hash, role, active) VALUES (?, ?, ?, ?, ?)');
        $insert->execute([1, 'admin', self::hash(self::PASSWORD), 'admin', 1]);
        $insert->execute([2, 'anna', self::hash(self::PASSWORD), 'user', 1]);
        $insert->execute([3, 'gesperrt', self::hash(self::PASSWORD), 'admin', 0]);
        $insert->execute([4, 'ohnepasswort', '', 'admin', 1]);

        clearSchemaCache();
    }

    public static function insertMemberRow(int $id, string $name, string $vorname, array $extra = []): void
    {
        $columns = array_merge(['id' => $id, 'name' => $name, 'vorname' => $vorname, 'clubzugehoerigkeit_id' => 9], $extra);
        $sql = 'INSERT INTO mitglied (' . implode(', ', array_keys($columns)) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')';
        self::pdo()->prepare($sql)->execute(array_values($columns));
    }

    /** Legt eine Sitzung an und liefert das Klartext-Token. */
    public static function createSessionToken(int $userId, string $expiresAt = '+1 hour', bool $passwordChangeRequired = false): string
    {
        $token = bin2hex(random_bytes(16));
        self::pdo()->prepare('INSERT INTO app_session (token_hash, user_id, password_change_required, expires_at) VALUES (?, ?, ?, ?)')
            ->execute([tokenHash($token), $userId, $passwordChangeRequired ? 1 : 0, (new DateTimeImmutable($expiresAt))->format('Y-m-d H:i:s')]);
        return $token;
    }
}
