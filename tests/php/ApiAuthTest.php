<?php
declare(strict_types=1);

final class ApiAuthTest extends DatabaseTestCase
{
    /** So reicht requireAuth() den Benutzer an handleSessionPassword() weiter. */
    private static function forcedChangeUser(): array
    {
        return ['id' => 1, 'username' => 'admin', 'role' => 'admin', 'passwordChangeRequired' => true];
    }

    private static function voluntaryChangeUser(): array
    {
        return ['id' => 1, 'username' => 'admin', 'role' => 'admin', 'passwordChangeRequired' => false];
    }

    public function testRequireAuthRejectsMissingAndUnknownToken(): void
    {
        $this->assertApiError(401, 'Anmeldung erforderlich', static fn() => requireAuth());

        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer gibtesnicht';
        $this->assertApiError(401, 'Anmeldung erforderlich', static fn() => requireAuth());
    }

    public function testRequireAuthRejectsExpiredSession(): void
    {
        $token = TestDatabase::createSessionToken(1, '-1 minute');
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
        $this->assertApiError(401, 'Anmeldung erforderlich', static fn() => requireAuth());
    }

    public function testRequireAuthRejectsSessionOfDeactivatedUser(): void
    {
        $this->authenticateAs(3);
        $this->assertApiError(401, 'Anmeldung erforderlich', static fn() => requireAuth());
    }

    public function testRequireAuthReturnsUserAndExtendsSession(): void
    {
        $token = TestDatabase::createSessionToken(2, '+2 minutes');
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;

        $user = requireAuth();
        $this->assertSame(['id' => 2, 'username' => 'anna', 'role' => 'user', 'passwordChangeRequired' => false], $user);

        $statement = db()->prepare('SELECT expires_at FROM app_session WHERE token_hash = ?');
        $statement->execute([tokenHash($token)]);
        $expiresAt = new DateTimeImmutable((string) $statement->fetchColumn());
        $this->assertGreaterThan(new DateTimeImmutable('+20 minutes'), $expiresAt);
    }

    public function testRequireAuthReportsPasswordChangeFromSessionFlag(): void
    {
        $this->authenticateAs(1, true);
        $this->assertTrue(requireAuth()['passwordChangeRequired']);
    }

    public function testRequireAuthReportsPasswordChangeWhenHashWasCleared(): void
    {
        $this->authenticateAs(4);
        $this->assertTrue(requireAuth()['passwordChangeRequired']);
    }

    public function testSessionLoginReturnsTokenAndStoresSession(): void
    {
        $this->request('POST', ['username' => 'admin', 'password' => TestDatabase::PASSWORD]);

        $response = $this->capture(static fn() => handleSession());

        $this->assertSame(200, $response->statusCode);
        $this->assertSame(['id' => 1, 'username' => 'admin', 'role' => 'admin', 'passwordChangeRequired' => false], $response->payload['user']);
        $this->assertSame(1, $this->countRows('app_session', 'token_hash = ?', [tokenHash($response->payload['token'])]));
    }

    public function testSessionLoginRejectsWrongPasswordUnknownUserAndInactiveUser(): void
    {
        $this->request('POST', ['username' => 'admin', 'password' => 'falsch']);
        $this->assertApiError(401, 'Benutzername oder Passwort', static fn() => handleSession());

        $this->request('POST', ['username' => 'niemand', 'password' => TestDatabase::PASSWORD]);
        $this->assertApiError(401, 'Benutzername oder Passwort', static fn() => handleSession());

        $this->request('POST', ['username' => 'gesperrt', 'password' => TestDatabase::PASSWORD]);
        $this->assertApiError(401, 'Benutzername oder Passwort', static fn() => handleSession());
    }

    public function testSessionLoginWithoutStoredPasswordDemandsPasswordChange(): void
    {
        $this->request('POST', ['username' => 'ohnepasswort', 'password' => '']);

        $response = $this->capture(static fn() => handleSession());

        $this->assertTrue($response->payload['user']['passwordChangeRequired']);
    }

    public function testSessionLoginWithoutStoredPasswordRejectsAnyPassword(): void
    {
        $this->request('POST', ['username' => 'ohnepasswort', 'password' => 'irgendwas']);
        $this->assertApiError(401, 'Benutzername oder Passwort', static fn() => handleSession());
    }

    public function testSessionGetReturnsCurrentUserAndDeleteRemovesSession(): void
    {
        $token = $this->authenticateAs(1);

        $this->request('GET');
        $this->assertSame('admin', $this->capture(static fn() => handleSession())->payload['user']['username']);

        $this->request('DELETE');
        $this->assertSame(204, $this->capture(static fn() => handleSession())->statusCode);
        $this->assertSame(0, $this->countRows('app_session', 'token_hash = ?', [tokenHash($token)]));
    }

    public function testSessionRejectsUnsupportedMethod(): void
    {
        $this->request('PUT');
        $this->assertApiError(405, 'Methode nicht erlaubt', static fn() => handleSession());
    }

    public function testSessionPasswordStoresNewHashAndClearsFlag(): void
    {
        $token = $this->authenticateAs(1, true);
        $this->request('POST', ['password' => 'neuesPasswort1']);

        $response = $this->capture(static fn() => handleSessionPassword(self::forcedChangeUser()));

        $this->assertFalse($response->payload['user']['passwordChangeRequired']);
        $statement = db()->prepare('SELECT password_hash FROM app_user WHERE id = 1');
        $statement->execute();
        $this->assertTrue(password_verify('neuesPasswort1', (string) $statement->fetchColumn()));
        $this->assertSame(1, $this->countRows('app_session', 'token_hash = ? AND password_change_required = 0', [tokenHash($token)]));
    }

    public function testSessionPasswordRejectsEmptyPasswordAndUsername(): void
    {
        $this->authenticateAs(1);
        $currentUser = self::forcedChangeUser();

        $this->request('POST', ['password' => '']);
        $this->assertApiError(400, 'Passwort ist erforderlich', static fn() => handleSessionPassword($currentUser));

        $this->request('POST', ['password' => 'ADMIN']);
        $this->assertApiError(400, 'nicht dem Benutzernamen entsprechen', static fn() => handleSessionPassword($currentUser));
    }

    /** Ohne erzwungenen Wechsel reicht das blosse Token nicht - sonst uebernimmt ein gestohlenes Token das Konto. */
    public function testSessionPasswordRequiresCurrentPasswordForVoluntaryChange(): void
    {
        $this->authenticateAs(1);
        $currentUser = self::voluntaryChangeUser();

        $this->request('POST', ['password' => 'neuesPasswort1']);
        $this->assertApiError(403, 'aktuelle Passwort ist falsch', static fn() => handleSessionPassword($currentUser));

        $this->request('POST', ['password' => 'neuesPasswort1', 'currentPassword' => 'falsch']);
        $this->assertApiError(403, 'aktuelle Passwort ist falsch', static fn() => handleSessionPassword($currentUser));

        $statement = db()->prepare('SELECT password_hash FROM app_user WHERE id = 1');
        $statement->execute();
        $this->assertTrue(password_verify(TestDatabase::PASSWORD, (string) $statement->fetchColumn()));
    }

    public function testSessionPasswordAcceptsCorrectCurrentPassword(): void
    {
        $this->authenticateAs(1);
        $this->request('POST', ['password' => 'neuesPasswort1', 'currentPassword' => TestDatabase::PASSWORD]);

        $response = $this->capture(static fn() => handleSessionPassword(self::voluntaryChangeUser()));

        $this->assertFalse($response->payload['user']['passwordChangeRequired']);
        $statement = db()->prepare('SELECT password_hash FROM app_user WHERE id = 1');
        $statement->execute();
        $this->assertTrue(password_verify('neuesPasswort1', (string) $statement->fetchColumn()));
    }

    public function testSessionPasswordEndsAllOtherSessionsOfTheUser(): void
    {
        $otherToken = TestDatabase::createSessionToken(1);
        $foreignToken = TestDatabase::createSessionToken(2);
        $token = $this->authenticateAs(1, true);
        $this->request('POST', ['password' => 'neuesPasswort1']);

        $this->capture(static fn() => handleSessionPassword(self::forcedChangeUser()));

        $this->assertSame(1, $this->countRows('app_session', 'token_hash = ?', [tokenHash($token)]));
        $this->assertSame(0, $this->countRows('app_session', 'token_hash = ?', [tokenHash($otherToken)]));
        $this->assertSame(1, $this->countRows('app_session', 'token_hash = ?', [tokenHash($foreignToken)]));
    }

    public function testLoginThrottlingBlocksAfterRepeatedFailuresAndClearsOnSuccess(): void
    {
        for ($attempt = 0; $attempt < LOGIN_ATTEMPT_LIMIT_USERNAME; $attempt++) {
            $this->request('POST', ['username' => 'admin', 'password' => 'falsch']);
            $this->assertApiError(401, 'Benutzername oder Passwort', static fn() => handleSession());
        }
        $this->assertSame(LOGIN_ATTEMPT_LIMIT_USERNAME, $this->countRows('app_login_attempt', 'username = ?', ['admin']));

        // Auch das richtige Passwort kommt jetzt nicht mehr durch.
        $this->request('POST', ['username' => 'admin', 'password' => TestDatabase::PASSWORD]);
        $this->assertApiError(429, 'Zu viele Fehlversuche', static fn() => handleSession());

        // Ein anderer Benutzer ist davon nicht betroffen.
        $this->request('POST', ['username' => 'anna', 'password' => TestDatabase::PASSWORD]);
        $this->assertSame(200, $this->capture(static fn() => handleSession())->statusCode);

        db()->prepare('DELETE FROM app_login_attempt WHERE username = ?')->execute(['admin']);
        $this->request('POST', ['username' => 'admin', 'password' => TestDatabase::PASSWORD]);
        $this->assertSame(200, $this->capture(static fn() => handleSession())->statusCode);
        $this->assertSame(0, $this->countRows('app_login_attempt', 'username = ?', ['admin']));
    }

    public function testExpiredSessionsAreRemovedOnLogin(): void
    {
        $expired = TestDatabase::createSessionToken(2, '-1 minute');

        $this->request('POST', ['username' => 'admin', 'password' => TestDatabase::PASSWORD]);
        $this->capture(static fn() => handleSession());

        $this->assertSame(0, $this->countRows('app_session', 'token_hash = ?', [tokenHash($expired)]));
    }

    public function testUsersCollectionListsUsersWithoutHashesForAdminOnly(): void
    {
        $this->request('GET');
        $response = $this->capture(static fn() => handleUsersCollection(['id' => 1, 'role' => 'admin']));

        $this->assertCount(4, $response->payload['users']);
        $this->assertArrayNotHasKey('password_hash', $response->payload['users'][0]);
        $this->assertSame(['admin', 'anna', 'gesperrt', 'ohnepasswort'], array_column($response->payload['users'], 'username'));

        $this->assertApiError(403, 'Administratorrechte', static fn() => handleUsersCollection(['id' => 2, 'role' => 'user']));
    }

    public function testUsersCollectionCreatesUser(): void
    {
        $this->request('POST', ['username' => 'neu', 'password' => 'geheim', 'role' => 'user']);

        $response = $this->capture(static fn() => handleUsersCollection(['id' => 1, 'role' => 'admin']));

        $this->assertSame(201, $response->statusCode);
        $this->assertSame('neu', $response->payload['user']['username']);
        $this->assertSame('user', $response->payload['user']['role']);
        $this->assertSame(1, $this->countRows('app_user', 'username = ?', ['neu']));
    }

    public function testUsersCollectionRequiresUsernameAndPassword(): void
    {
        $this->request('POST', ['username' => '', 'password' => 'geheim']);
        $this->assertApiError(400, 'Benutzername und Passwort', static fn() => handleUsersCollection(['id' => 1, 'role' => 'admin']));
    }

    public function testUserResourceUpdatesRoleOfOtherUser(): void
    {
        $this->request('PUT', ['role' => 'admin']);

        $response = $this->capture(static fn() => handleUserResource(['id' => 1, 'role' => 'admin'], 2));

        $this->assertSame('admin', $response->payload['user']['role']);
    }

    public function testUserResourceProtectsOwnAccount(): void
    {
        $admin = ['id' => 1, 'role' => 'admin'];

        $this->request('PUT', ['active' => false]);
        $this->assertApiError(400, 'nicht deaktiviert', fn() => handleUserResource($admin, 1));

        $this->request('PUT', ['role' => 'user']);
        $this->assertApiError(400, 'muss Admin bleiben', fn() => handleUserResource($admin, 1));

        $this->request('DELETE');
        $this->assertApiError(400, 'nicht deaktiviert', fn() => handleUserResource($admin, 1));
    }

    public function testUserResourceReturns404ForUnknownUser(): void
    {
        $this->request('PUT', ['role' => 'user']);
        $this->assertApiError(404, 'Benutzer nicht gefunden', static fn() => handleUserResource(['id' => 1, 'role' => 'admin'], 999));
    }

    public function testUserResourceDeleteOnlyDeactivates(): void
    {
        $this->request('DELETE');

        $this->assertSame(204, $this->capture(static fn() => handleUserResource(['id' => 1, 'role' => 'admin'], 2))->statusCode);
        $this->assertSame(1, $this->countRows('app_user', 'id = 2 AND active = 0'));
    }
}
