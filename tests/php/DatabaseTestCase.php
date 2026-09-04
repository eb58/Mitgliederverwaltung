<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

/** Basis fuer Tests, die echte Handler gegen die Test-Datenbank fahren. */
abstract class DatabaseTestCase extends TestCase
{
    protected function setUp(): void
    {
        $pdo = TestDatabase::pdo();
        if (!$pdo) {
            $this->markTestSkipped(TestDatabase::skipReason());
        }
        db($pdo);
        TestDatabase::reset();
        $_SERVER['REQUEST_METHOD'] = 'GET';
        $_GET = [];
        requestBody('');
        unset($_SERVER['HTTP_AUTHORIZATION'], $_SERVER['REDIRECT_HTTP_AUTHORIZATION'], $_SERVER['HTTP_X_AUTH_TOKEN'], $_SERVER['HTTP_IF_NONE_MATCH'], $_SERVER['CONTENT_TYPE'], $_SERVER['HTTP_X_FILE_NAME']);
    }

    protected function tearDown(): void
    {
        requestBody(null);
        $_GET = [];
        unset($_SERVER['HTTP_AUTHORIZATION'], $_SERVER['REDIRECT_HTTP_AUTHORIZATION'], $_SERVER['HTTP_X_AUTH_TOKEN'], $_SERVER['HTTP_IF_NONE_MATCH'], $_SERVER['CONTENT_TYPE'], $_SERVER['HTTP_X_FILE_NAME']);
    }

    protected function request(string $method, array $body = null, array $query = []): void
    {
        $_SERVER['REQUEST_METHOD'] = $method;
        $_GET = $query;
        requestBody($body === null ? '' : (string) json_encode($body));
    }

    /** Faengt die Antwort ab, die der Handler wirft. */
    protected function capture(callable $call): ApiResponse
    {
        try {
            $call();
        } catch (ApiResponse $response) {
            return $response;
        }
        $this->fail('Der Handler hat keine ApiResponse erzeugt.');
    }

    protected function assertApiError(int $status, string $messagePart, callable $call): void
    {
        try {
            $call();
        } catch (ApiError $error) {
            $this->assertSame($status, $error->statusCode);
            $this->assertStringContainsString($messagePart, $error->getMessage());
            return;
        }
        $this->fail('Erwartete ApiError wurde nicht geworfen.');
    }

    protected function authenticateAs(int $userId, bool $passwordChangeRequired = false): string
    {
        $token = TestDatabase::createSessionToken($userId, '+1 hour', $passwordChangeRequired);
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
        return $token;
    }

    protected function fetchColumn(string $sql, array $params = []): mixed
    {
        $statement = db()->prepare($sql);
        $statement->execute($params);
        return $statement->fetchColumn();
    }

    protected function countRows(string $table, string $where = '1', array $params = []): int
    {
        $statement = db()->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where}");
        $statement->execute($params);
        return (int) $statement->fetchColumn();
    }
}
