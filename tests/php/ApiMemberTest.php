<?php
declare(strict_types=1);

final class ApiMemberTest extends DatabaseTestCase
{
    private const ADMIN = ['id' => 1, 'username' => 'admin', 'role' => 'admin'];

    private function validMember(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Müller',
            'vorname' => 'Anna',
            'geschlecht' => 'w',
            'clubzugehoerigkeit' => 9,
        ], $overrides);
    }

    public function testMembersCollectionListsMembersSortedByName(): void
    {
        TestDatabase::insertMemberRow(1, 'Zander', 'Uwe');
        TestDatabase::insertMemberRow(2, 'Auer', 'Eva');
        $this->request('GET');

        $response = $this->capture(static fn() => handleMembersCollection(self::ADMIN));

        $this->assertSame(['Auer', 'Zander'], array_column($response->payload['members'], 'name'));
    }

    public function testMembersCollectionAppliesLimitAndOffset(): void
    {
        foreach (['A', 'B', 'C'] as $index => $name) {
            TestDatabase::insertMemberRow($index + 1, $name, 'Test');
        }

        $this->request('GET', null, ['limit' => '2']);
        $this->assertCount(2, $this->capture(static fn() => handleMembersCollection(self::ADMIN))->payload['members']);

        $this->request('GET', null, ['limit' => '2', 'offset' => '2']);
        $members = $this->capture(static fn() => handleMembersCollection(self::ADMIN))->payload['members'];
        $this->assertSame(['C'], array_column($members, 'name'));
    }

    public function testMembersCollectionSearchesAcrossNameAndContactColumns(): void
    {
        TestDatabase::insertMemberRow(1, 'Müller', 'Anna', ['email' => 'anna@example.test']);
        TestDatabase::insertMemberRow(2, 'Schmidt', 'Bert', ['handy' => '0170-123']);

        $this->request('GET', null, ['search' => 'example.test']);
        $this->assertSame(['Müller'], array_column($this->capture(static fn() => handleMembersCollection(self::ADMIN))->payload['members'], 'name'));

        $this->request('GET', null, ['search' => '0170']);
        $this->assertSame(['Schmidt'], array_column($this->capture(static fn() => handleMembersCollection(self::ADMIN))->payload['members'], 'name'));
    }

    public function testMembersCollectionCreatesMemberWithGroupsFunctionsAndAudit(): void
    {
        $this->request('POST', $this->validMember(['id' => 5, 'interessengruppen' => [4, 16], 'funktionen' => [1]]));

        $response = $this->capture(static fn() => handleMembersCollection(self::ADMIN));

        $this->assertSame(201, $response->statusCode);
        $this->assertSame('Müller', $response->payload['member']['name']);
        $this->assertSame([4, 16], $response->payload['member']['interessengruppen']);
        $this->assertSame([1], $response->payload['member']['funktionen']);
        $this->assertSame(1, $this->countRows('mitglied_aenderung', 'mitglied_id = 5 AND aktion = ?', ['created']));
    }

    public function testMembersCollectionAssignsNextFreeIdWhenMissing(): void
    {
        TestDatabase::insertMemberRow(7, 'Alt', 'Otto');
        $this->request('POST', $this->validMember());

        $response = $this->capture(static fn() => handleMembersCollection(self::ADMIN));

        $this->assertSame(8.0, $response->payload['member']['id']);
    }

    public function testMembersCollectionRejectsInvalidAndUnknownFields(): void
    {
        $this->request('POST', $this->validMember(['name' => '']));
        $this->assertApiError(400, 'Pflichtfelder', static fn() => handleMembersCollection(self::ADMIN));

        $this->request('POST', $this->validMember(['geschlecht' => 'x']));
        $this->assertApiError(400, "geschlecht muss 'm' oder 'w' sein", static fn() => handleMembersCollection(self::ADMIN));

        $this->request('POST', $this->validMember(['unbekanntesFeld' => 1]));
        $this->assertApiError(400, 'Unbekannte Felder: unbekanntesFeld', static fn() => handleMembersCollection(self::ADMIN));
    }

    public function testFailedCreateLeavesNoPartialRows(): void
    {
        $this->request('POST', $this->validMember(['id' => 5, 'interessengruppen' => [999999]]));

        try {
            handleMembersCollection(self::ADMIN);
        } catch (Throwable) {
            // Fremdschluesselverletzung auf interessengruppe ist hier der Zweck des Tests.
        }

        $this->assertSame(0, $this->countRows('mitglied', 'id = 5'));
        $this->assertSame(0, $this->countRows('mitglied_aenderung', 'mitglied_id = 5'));
    }

    public function testMemberResourceReturnsMemberOr404(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna', ['geburtstag' => '1950-02-03']);

        $this->request('GET');
        $response = $this->capture(static fn() => handleMemberResource(3, self::ADMIN));
        $this->assertSame('1950-02-03', $response->payload['member']['geburtstag']);

        $this->assertApiError(404, 'Mitglied nicht gefunden', static fn() => handleMemberResource(999, self::ADMIN));
    }

    public function testMemberResourceUpdatePatchesOnlyGivenFieldsAndLogsChanges(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna', ['ort' => 'Berlin', 'telefon' => '030-1']);
        $this->request('PATCH', ['ort' => 'Potsdam']);

        $response = $this->capture(static fn() => handleMemberResource(3, self::ADMIN));

        $this->assertSame('Potsdam', $response->payload['member']['ort']);
        $this->assertSame('030-1', $response->payload['member']['telefon']);

        $statement = db()->prepare('SELECT aktion, aenderungen_json FROM mitglied_aenderung WHERE mitglied_id = 3');
        $statement->execute();
        $row = $statement->fetch();
        $this->assertSame('updated', $row['aktion']);
        $this->assertSame(
            [['field' => 'ort', 'label' => 'Ort', 'old' => 'Berlin', 'new' => 'Potsdam']],
            json_decode((string) $row['aenderungen_json'], true)
        );
    }

    public function testMemberResourceUpdateWithoutRealChangeWritesNoAuditEntry(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna', ['ort' => 'Berlin']);
        $this->request('PATCH', ['ort' => 'Berlin']);

        $this->capture(static fn() => handleMemberResource(3, self::ADMIN));

        $this->assertSame(0, $this->countRows('mitglied_aenderung', 'mitglied_id = 3'));
    }

    public function testMemberResourceUpdateReplacesInterestGroups(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        db()->exec('INSERT INTO mitglied_interessengruppe (mitglied_id, interessengruppe_id) VALUES (3, 4)');
        $this->request('PATCH', ['interessengruppen' => [16]]);

        $response = $this->capture(static fn() => handleMemberResource(3, self::ADMIN));

        $this->assertSame([16], $response->payload['member']['interessengruppen']);
        $this->assertSame(1, $this->countRows('mitglied_interessengruppe', 'mitglied_id = 3'));
    }

    public function testMemberResourceDeleteRemovesMemberAndLogsIt(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        $this->request('DELETE');

        $this->assertSame(204, $this->capture(static fn() => handleMemberResource(3, self::ADMIN))->statusCode);
        $this->assertSame(0, $this->countRows('mitglied', 'id = 3'));
        $this->assertSame(1, $this->countRows('mitglied_aenderung', 'mitglied_id = 3 AND aktion = ?', ['deleted']));
    }

    public function testMemberChangesListsHistoryForOneMember(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        TestDatabase::insertMemberRow(4, 'Schmidt', 'Bert');
        auditMemberChange(3, 'updated', [['field' => 'ort', 'label' => 'Ort', 'old' => 'Berlin', 'new' => 'Potsdam']], self::ADMIN);
        auditMemberChange(4, 'updated', [], self::ADMIN);
        $this->request('GET');

        $response = $this->capture(static fn() => handleMemberChanges(3));

        $this->assertCount(1, $response->payload['changes']);
        $this->assertSame('Potsdam', $response->payload['changes'][0]['changes'][0]['new']);
        $this->assertSame('admin', $response->payload['changes'][0]['changedByName']);
    }

    public function testRecentMemberChangesRespectsLimitAndKeepsDeletedMembers(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        auditMemberChange(3, 'updated', [], self::ADMIN);
        auditMemberChange(99, 'deleted', [], self::ADMIN);

        $this->request('GET');
        $all = $this->capture(static fn() => handleRecentMemberChanges())->payload['changes'];
        $this->assertCount(2, $all);
        $this->assertFalse($all[0]['memberExists']);
        $this->assertTrue($all[1]['memberExists']);
        $this->assertSame('Anna Müller', $all[1]['memberName']);

        $this->request('GET', null, ['limit' => '1']);
        $this->assertCount(1, $this->capture(static fn() => handleRecentMemberChanges())->payload['changes']);
    }

    public function testMemberPhotoRoundTripStoresServesAndDeletes(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        $_SERVER['CONTENT_TYPE'] = 'application/json';
        $this->request('PUT', ['fileName' => 'anna.png', 'mimeType' => 'image/png', 'base64' => base64_encode('BILD')]);

        $stored = $this->capture(static fn() => handleMemberPhoto(3, self::ADMIN));
        $this->assertSame('anna.png', $stored->payload['photo']['fileName']);
        $this->assertSame(4, $stored->payload['photo']['size']);
        $this->assertSame(1, $this->countRows('mitglied_aenderung', 'mitglied_id = 3 AND aktion = ?', ['photo_updated']));

        unset($_SERVER['CONTENT_TYPE']);
        $this->request('GET');
        $served = $this->capture(static fn() => handleMemberPhoto(3, self::ADMIN));
        $this->assertSame('BILD', $served->rawBody);
        $this->assertSame('image/png', $served->headers['Content-Type']);

        $_SERVER['HTTP_IF_NONE_MATCH'] = $served->headers['ETag'];
        $notModified = $this->capture(static fn() => handleMemberPhoto(3, self::ADMIN));
        $this->assertSame(304, $notModified->statusCode);
        $this->assertSame('', $notModified->rawBody);

        unset($_SERVER['HTTP_IF_NONE_MATCH']);
        $this->request('DELETE');
        $this->assertSame(204, $this->capture(static fn() => handleMemberPhoto(3, self::ADMIN))->statusCode);
        $this->assertSame(0, $this->countRows('mitglied_passbild', 'mitglied_id = 3'));
    }

    public function testMemberPhotoReturns404WhenMissing(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');

        $this->request('GET');
        $this->assertApiError(404, 'Passbild nicht gefunden', static fn() => handleMemberPhoto(3, self::ADMIN));

        $this->request('DELETE');
        $this->assertApiError(404, 'Passbild nicht gefunden', static fn() => handleMemberPhoto(3, self::ADMIN));
    }

    public function testMemberPhotoUploadRequiresExistingMember(): void
    {
        $_SERVER['CONTENT_TYPE'] = 'application/json';
        $this->request('PUT', ['base64' => base64_encode('BILD')]);
        $this->assertApiError(404, 'Mitglied nicht gefunden', static fn() => handleMemberPhoto(999, self::ADMIN));
    }

    public function testMemberPhotoAcceptsRawBodyUpload(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        $_SERVER['CONTENT_TYPE'] = 'image/jpeg';
        $_SERVER['HTTP_X_FILE_NAME'] = 'foto%20neu.jpg';
        $_SERVER['REQUEST_METHOD'] = 'PUT';
        requestBody('ROHDATEN');

        $response = $this->capture(static fn() => handleMemberPhoto(3, self::ADMIN));

        $this->assertSame('foto neu.jpg', $response->payload['photo']['fileName']);
        $this->assertSame('image/jpeg', $response->payload['photo']['mimeType']);
    }
}
