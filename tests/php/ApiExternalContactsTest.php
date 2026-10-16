<?php
declare(strict_types=1);

final class ApiExternalContactsTest extends DatabaseTestCase
{
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

        $contacts = $this->capture(static fn() => handleExternalContactCollection())->payload['contacts'];

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

        $response = $this->capture(static fn() => handleExternalContactCollection());
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
        $this->assertSame(201, $this->capture(static fn() => handleExternalContactCollection())->statusCode);

        $this->request('POST', ['name' => 'Spielmann']);
        $this->assertSame(201, $this->capture(static fn() => handleExternalContactCollection())->statusCode);

        $this->assertSame(2, $this->countRows('externe_kontakte'));
    }

    public function testCreateRejectsContactWithoutNameAndCompany(): void
    {
        $this->request('POST', ['vorname' => 'Petra', 'firma' => '  ', 'telefon' => '030 1']);

        $this->assertApiError(400, 'Name oder Firma ist erforderlich', static fn() => handleExternalContactCollection());
        $this->assertSame(0, $this->countRows('externe_kontakte'));
    }

    public function testCreateRejectsUnknownFieldsInvalidEmailAndOverlongValues(): void
    {
        $this->request('POST', ['name' => 'Spielmann', 'geburtstag' => '1960-01-01']);
        $this->assertApiError(400, 'Unbekannte Felder', static fn() => handleExternalContactCollection());

        $this->request('POST', ['name' => 'Spielmann', 'email' => 'kein-at-zeichen']);
        $this->assertApiError(400, 'Ungueltige Email-Adresse', static fn() => handleExternalContactCollection());

        $this->request('POST', ['name' => 'Spielmann', 'plz' => '1346913469134']);
        $this->assertApiError(400, 'plz darf hoechstens 12 Zeichen', static fn() => handleExternalContactCollection());
    }

    /** Umlaute zaehlen als ein Zeichen, auch wenn sie in UTF-8 zwei Bytes belegen. */
    public function testLengthLimitCountsCharactersNotBytes(): void
    {
        $this->request('POST', ['name' => str_repeat('Ä', 120)]);

        $this->assertSame(201, $this->capture(static fn() => handleExternalContactCollection())->statusCode);
    }

    public function testResourceUpdatesContact(): void
    {
        $id = $this->insertContact(['kategorie' => 'Reinigung', 'firma' => 'Blitzblank']);
        $this->request('PUT', ['kategorie' => 'Reinigung', 'firma' => 'Blitzblank GmbH', 'telefon' => '030 123', 'favorit' => true]);

        $contact = $this->capture(static fn() => handleExternalContactResource($id))->payload['contact'];

        $this->assertSame('Blitzblank GmbH', $contact['firma']);
        $this->assertSame('030 123', $contact['telefon']);
        $this->assertTrue($contact['favorit']);
    }

    public function testPutClearsFieldsThatAreNotSent(): void
    {
        $id = $this->insertContact(['firma' => 'Blitzblank', 'telefon' => '030 123']);
        $this->request('PUT', ['firma' => 'Blitzblank']);

        $this->assertSame('', $this->capture(static fn() => handleExternalContactResource($id))->payload['contact']['telefon']);
    }

    public function testPatchKeepsUnsentFields(): void
    {
        $id = $this->insertContact(['kategorie' => 'Vermieter', 'firma' => 'Wohnbau Nord', 'telefon' => '030 456']);
        $this->request('PATCH', ['favorit' => true]);

        $contact = $this->capture(static fn() => handleExternalContactResource($id))->payload['contact'];

        $this->assertTrue($contact['favorit']);
        $this->assertSame('Wohnbau Nord', $contact['firma']);
        $this->assertSame('030 456', $contact['telefon']);
    }

    public function testUpdateMustKeepNameOrCompany(): void
    {
        $id = $this->insertContact(['firma' => 'Wohnbau Nord']);
        $this->request('PATCH', ['firma' => '']);

        $this->assertApiError(400, 'Name oder Firma ist erforderlich', static fn() => handleExternalContactResource($id));
        $this->assertSame('Wohnbau Nord', $this->fetchColumn('SELECT firma FROM externe_kontakte WHERE id = ?', [$id]));
    }

    public function testResourceDeletesContact(): void
    {
        $id = $this->insertContact(['firma' => 'Blitzblank']);
        $this->request('DELETE');

        $this->assertSame(204, $this->capture(static fn() => handleExternalContactResource($id))->statusCode);
        $this->assertSame(0, $this->countRows('externe_kontakte'));
    }

    public function testUnknownContactIsRejected(): void
    {
        $this->request('GET');
        $this->assertApiError(404, 'Kontakt nicht gefunden', static fn() => handleExternalContactResource(4711));
    }

    public function testMissingTableIsCreatedOnDemand(): void
    {
        db()->exec('DROP TABLE externe_kontakte');
        clearSchemaCache();
        $this->request('GET');

        $this->assertSame([], $this->capture(static fn() => handleExternalContactCollection())->payload['contacts']);

        $this->request('POST', ['kategorie' => 'Musiker', 'name' => 'Spielmann']);
        $this->assertSame('Musiker', $this->capture(static fn() => handleExternalContactCollection())->payload['contact']['kategorie']);
    }
}
