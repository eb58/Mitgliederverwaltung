<?php
declare(strict_types=1);

final class ApiExternalContactsTest extends DatabaseTestCase
{
    private const ADMIN = ['id' => 1, 'username' => 'admin', 'role' => 'admin'];
    private const USER = ['id' => 2, 'username' => 'anna', 'role' => 'user'];

    private function insertContact(array $values): int
    {
        $columns = array_merge(['kategorie' => '', 'firma' => '', 'name' => ''], $values);
        $sql = 'INSERT INTO externe_kontakte (' . implode(', ', array_keys($columns)) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')';
        db()->prepare($sql)->execute(array_values($columns));
        return (int) db()->lastInsertId();
    }

    public function testCollectionListsContactsByCategoryAndName(): void
    {
        $this->insertContact(['kategorie' => 'Vermieter', 'firma' => 'Wohnbau Nord']);
        $this->insertContact(['kategorie' => 'Musiker', 'name' => 'Zitherle', 'vorname' => 'Franz']);
        $this->insertContact(['kategorie' => 'Musiker', 'name' => 'Akkordeon', 'vorname' => 'Rita']);
        $this->request('GET');

        $contacts = $this->capture(static fn() => handleExternalContactCollection(self::USER))->payload['contacts'];

        $this->assertSame(['Akkordeon', 'Zitherle', ''], array_column($contacts, 'name'));
        $this->assertSame(
            ['id', 'kategorie', 'firma', 'name', 'vorname', 'zustaendigkeit', 'strasse', 'plz', 'ort', 'telefon', 'handy', 'email', 'webseite', 'bemerkung', 'favorit'],
            array_keys($contacts[0])
        );
        $this->assertFalse($contacts[0]['favorit']);
        $this->assertSame('', $contacts[0]['bemerkung']);
    }

    public function testCreateTrimsFieldsAndStoresFavorite(): void
    {
        $this->request('POST', [
            'kategorie' => ' Bezirksamt ',
            'firma' => ' Bezirksamt Reinickendorf ',
            'name' => 'Sommer',
            'vorname' => 'Petra',
            'zustaendigkeit' => 'Seniorenarbeit',
            'telefon' => '030 90294-0',
            'email' => ' p.sommer@example.org ',
            'bemerkung' => '  Mo-Do erreichbar  ',
            'favorit' => true,
        ]);

        $response = $this->capture(static fn() => handleExternalContactCollection(self::USER));
        $contact = $response->payload['contact'];

        $this->assertSame(201, $response->statusCode);
        $this->assertSame('Bezirksamt', $contact['kategorie']);
        $this->assertSame('Bezirksamt Reinickendorf', $contact['firma']);
        $this->assertSame('p.sommer@example.org', $contact['email']);
        $this->assertSame('Mo-Do erreichbar', $contact['bemerkung']);
        $this->assertTrue($contact['favorit']);
        $this->assertSame(1, $this->countRows('externe_kontakte'));
    }

    public function testCreateAcceptsCompanyWithoutPersonAndPersonWithoutCompany(): void
    {
        $this->request('POST', ['firma' => 'Blitzblank Gebäudereinigung']);
        $this->assertSame(201, $this->capture(static fn() => handleExternalContactCollection(self::USER))->statusCode);

        $this->request('POST', ['name' => 'Spielmann']);
        $this->assertSame(201, $this->capture(static fn() => handleExternalContactCollection(self::USER))->statusCode);

        $this->assertSame(2, $this->countRows('externe_kontakte'));
    }

    public function testCreateRejectsContactWithoutNameAndCompany(): void
    {
        $this->request('POST', ['vorname' => 'Petra', 'firma' => '  ', 'telefon' => '030 1']);

        $this->assertApiError(400, 'Name oder Firma ist erforderlich', static fn() => handleExternalContactCollection(self::USER));
        $this->assertSame(0, $this->countRows('externe_kontakte'));
    }

    public function testCreateRejectsUnknownFieldsInvalidEmailAndOverlongValues(): void
    {
        $this->request('POST', ['name' => 'Spielmann', 'geburtstag' => '1960-01-01']);
        $this->assertApiError(400, 'Unbekannte Felder', static fn() => handleExternalContactCollection(self::USER));

        $this->request('POST', ['name' => 'Spielmann', 'email' => 'kein-at-zeichen']);
        $this->assertApiError(400, 'Ungueltige Email-Adresse', static fn() => handleExternalContactCollection(self::USER));

        $this->request('POST', ['name' => 'Spielmann', 'plz' => '1346913469134']);
        $this->assertApiError(400, 'plz darf hoechstens 12 Zeichen', static fn() => handleExternalContactCollection(self::USER));
    }

    /** Umlaute zaehlen als ein Zeichen, auch wenn sie in UTF-8 zwei Bytes belegen. */
    public function testLengthLimitCountsCharactersNotBytes(): void
    {
        $this->request('POST', ['name' => str_repeat('Ä', 120)]);

        $this->assertSame(201, $this->capture(static fn() => handleExternalContactCollection(self::USER))->statusCode);
    }

    public function testResourceUpdatesContact(): void
    {
        $id = $this->insertContact(['kategorie' => 'Reinigung', 'firma' => 'Blitzblank']);
        $this->request('PUT', ['kategorie' => 'Reinigung', 'firma' => 'Blitzblank GmbH', 'telefon' => '030 123', 'favorit' => true]);

        $contact = $this->capture(static fn() => handleExternalContactResource(self::USER, $id))->payload['contact'];

        $this->assertSame('Blitzblank GmbH', $contact['firma']);
        $this->assertSame('030 123', $contact['telefon']);
        $this->assertTrue($contact['favorit']);
    }

    public function testPutClearsFieldsThatAreNotSent(): void
    {
        $id = $this->insertContact(['firma' => 'Blitzblank', 'telefon' => '030 123']);
        $this->request('PUT', ['firma' => 'Blitzblank']);

        $this->assertSame('', $this->capture(static fn() => handleExternalContactResource(self::USER, $id))->payload['contact']['telefon']);
    }

    public function testPatchKeepsUnsentFields(): void
    {
        $id = $this->insertContact(['kategorie' => 'Vermieter', 'firma' => 'Wohnbau Nord', 'telefon' => '030 456']);
        $this->request('PATCH', ['favorit' => true]);

        $contact = $this->capture(static fn() => handleExternalContactResource(self::USER, $id))->payload['contact'];

        $this->assertTrue($contact['favorit']);
        $this->assertSame('Wohnbau Nord', $contact['firma']);
        $this->assertSame('030 456', $contact['telefon']);
    }

    public function testUpdateMustKeepNameOrCompany(): void
    {
        $id = $this->insertContact(['firma' => 'Wohnbau Nord']);
        $this->request('PATCH', ['firma' => '']);

        $this->assertApiError(400, 'Name oder Firma ist erforderlich', static fn() => handleExternalContactResource(self::USER, $id));
        $this->assertSame('Wohnbau Nord', $this->fetchColumn('SELECT firma FROM externe_kontakte WHERE id = ?', [$id]));
    }

    public function testResourceDeletesContact(): void
    {
        $id = $this->insertContact(['firma' => 'Blitzblank']);
        $this->request('DELETE');

        $this->assertSame(204, $this->capture(static fn() => handleExternalContactResource(self::USER, $id))->statusCode);
        $this->assertSame(0, $this->countRows('externe_kontakte'));
    }

    public function testUnknownContactIsRejected(): void
    {
        $this->request('GET');
        $this->assertApiError(404, 'Kontakt nicht gefunden', static fn() => handleExternalContactResource(self::USER, 4711));
    }

    public function testOnlyAdminCreatesNewCategory(): void
    {
        $this->request('POST', ['kategorie' => 'Fotografen', 'name' => 'Blende']);
        $this->assertApiError(403, 'Neue Kategorien kann nur ein Admin anlegen', static fn() => handleExternalContactCollection(self::USER));
        $this->assertSame(0, $this->countRows('externe_kontakte'));

        $this->assertSame('Fotografen', $this->capture(static fn() => handleExternalContactCollection(self::ADMIN))->payload['contact']['kategorie']);
    }

    public function testUserChoosesFixedOrAlreadyUsedCategory(): void
    {
        $this->insertContact(['kategorie' => 'Fotografen', 'name' => 'Blende']);

        foreach (['presse', 'Fotografen', 'FOTOGRAFEN', ''] as $kategorie) {
            $this->request('POST', ['kategorie' => $kategorie, 'name' => 'Spielmann']);
            $this->assertSame(201, $this->capture(static fn() => handleExternalContactCollection(self::USER))->statusCode, $kategorie);
        }
    }

    public function testUserCannotMoveContactIntoNewCategory(): void
    {
        $id = $this->insertContact(['kategorie' => 'Fotografen', 'firma' => 'Blende']);
        $this->request('PATCH', ['telefon' => '030 789']);
        $this->assertSame('030 789', $this->capture(static fn() => handleExternalContactResource(self::USER, $id))->payload['contact']['telefon']);

        $this->request('PATCH', ['kategorie' => 'Chor']);
        $this->assertApiError(403, 'Neue Kategorien kann nur ein Admin anlegen', static fn() => handleExternalContactResource(self::USER, $id));
        $this->assertSame('Fotografen', $this->fetchColumn('SELECT kategorie FROM externe_kontakte WHERE id = ?', [$id]));
    }

    public function testMissingTableIsCreatedOnDemand(): void
    {
        db()->exec('DROP TABLE externe_kontakte');
        db()->exec('DROP TABLE externe_kontakt_kategorie');
        clearSchemaCache();
        $this->request('GET');

        $this->assertSame([], $this->capture(static fn() => handleExternalContactCollection(self::USER))->payload['contacts']);
        $this->assertSame([], $this->capture(static fn() => handleExternalContactCategoryCollection(self::USER))->payload['categories']);

        $this->request('POST', ['kategorie' => 'Musiker', 'name' => 'Spielmann']);
        $this->assertSame('Musiker', $this->capture(static fn() => handleExternalContactCollection(self::USER))->payload['contact']['kategorie']);
    }

    private function createCategory(array $user, string $name): ApiResponse
    {
        $this->request('POST', ['name' => $name]);
        return $this->capture(static fn() => handleExternalContactCategoryCollection($user));
    }

    public function testAdminCreatesCategoryThatUsersCanChoose(): void
    {
        $response = $this->createCategory(self::ADMIN, '  Chor ');
        $this->assertSame(201, $response->statusCode);
        $this->assertSame('Chor', $response->payload['category']['name']);
        $this->createCategory(self::ADMIN, 'Blumen');

        $this->request('GET');
        $categories = $this->capture(static fn() => handleExternalContactCategoryCollection(self::USER))->payload['categories'];
        $this->assertSame(['Blumen', 'Chor'], array_column($categories, 'name'));

        $this->request('POST', ['kategorie' => 'chor', 'name' => 'Sangesfreude']);
        $this->assertSame(201, $this->capture(static fn() => handleExternalContactCollection(self::USER))->statusCode);
    }

    public function testOnlyAdminCreatesOrDeletesCategories(): void
    {
        $this->request('POST', ['name' => 'Chor']);
        $this->assertApiError(403, 'Administratorrechte', static fn() => handleExternalContactCategoryCollection(self::USER));

        $id = $this->createCategory(self::ADMIN, 'Chor')->payload['category']['id'];
        $this->request('DELETE');
        $this->assertApiError(403, 'Administratorrechte', static fn() => handleExternalContactCategoryResource(self::USER, $id));
        $this->assertSame(1, $this->countRows('externe_kontakt_kategorie'));
    }

    public function testCreateRejectsEmptyOverlongUnknownAndExistingCategories(): void
    {
        $this->request('POST', ['name' => '  ']);
        $this->assertApiError(400, 'Name der Kategorie fehlt', static fn() => handleExternalContactCategoryCollection(self::ADMIN));

        $this->request('POST', ['name' => str_repeat('x', 81)]);
        $this->assertApiError(400, 'hoechstens 80 Zeichen', static fn() => handleExternalContactCategoryCollection(self::ADMIN));

        $this->request('POST', ['name' => 'Chor', 'farbe' => 'rot']);
        $this->assertApiError(400, 'Unbekannte Felder', static fn() => handleExternalContactCategoryCollection(self::ADMIN));

        $this->insertContact(['kategorie' => 'Fotografen', 'name' => 'Blende']);
        $this->createCategory(self::ADMIN, 'Chor');
        foreach (['musiker', 'FOTOGRAFEN', 'chor'] as $name) {
            $this->request('POST', ['name' => $name]);
            $this->assertApiError(409, 'gibt es schon', static fn() => handleExternalContactCategoryCollection(self::ADMIN));
        }
        $this->assertSame(1, $this->countRows('externe_kontakt_kategorie'));
    }

    public function testDeleteOnlyRemovesUnusedCategory(): void
    {
        $id = $this->createCategory(self::ADMIN, 'Chor')->payload['category']['id'];
        $contactId = $this->insertContact(['kategorie' => 'Chor', 'name' => 'Sangesfreude']);

        $this->request('DELETE');
        $this->assertApiError(409, 'noch von 1 Kontakt benutzt', static fn() => handleExternalContactCategoryResource(self::ADMIN, $id));

        db()->prepare('DELETE FROM externe_kontakte WHERE id = ?')->execute([$contactId]);
        $this->assertSame(204, $this->capture(static fn() => handleExternalContactCategoryResource(self::ADMIN, $id))->statusCode);
        $this->assertSame(0, $this->countRows('externe_kontakt_kategorie'));

        $this->assertApiError(404, 'Kategorie nicht gefunden', static fn() => handleExternalContactCategoryResource(self::ADMIN, $id));
    }
}
