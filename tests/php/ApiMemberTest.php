<?php
declare(strict_types=1);

final class ApiMemberTest extends DatabaseTestCase
{
    private const ADMIN = ['id' => 1, 'username' => 'admin', 'role' => 'admin'];

    /** Der Passbild-Upload prueft den Inhalt, nicht den gemeldeten Typ - also echte Bilder. */
    private const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    private const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

    private static function png(): string
    {
        return (string) base64_decode(self::PNG_BASE64, true);
    }

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

    public function testMembersCollectionUsesIdAsStablePaginationTieBreaker(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        TestDatabase::insertMemberRow(1, 'Müller', 'Anna');
        TestDatabase::insertMemberRow(2, 'Müller', 'Anna');

        $this->request('GET', null, ['limit' => '2']);
        $firstPage = $this->capture(static fn() => handleMembersCollection(self::ADMIN))->payload['members'];

        $this->request('GET', null, ['limit' => '2', 'offset' => '2']);
        $secondPage = $this->capture(static fn() => handleMembersCollection(self::ADMIN))->payload['members'];

        $this->assertSame([1.0, 2.0], array_column($firstPage, 'id'));
        $this->assertSame([3.0], array_column($secondPage, 'id'));
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

    public function testMembersCollectionStoresWeihnachtsessenInSideTable(): void
    {
        $this->request('POST', $this->validMember([
            'id' => 5,
            'weihnachtsessen' => 2,
            'wnEssenBezahlt' => true,
            'gezahlterBetragWeihnachten' => 40,
            'tischnummer' => 7,
        ]));

        $member = $this->capture(static fn() => handleMembersCollection(self::ADMIN))->payload['member'];
        $row = db()->query('SELECT * FROM mitglied_weihnachtsessen WHERE mitglied_id = 5')->fetch();

        $this->assertSame(2.0, $member['weihnachtsessen']);
        $this->assertTrue($member['wnEssenBezahlt']);
        $this->assertSame('2', (string) $row['weihnachtsessen']);
        $this->assertSame('40.00', (string) $row['gezahlter_betrag_weihnachten']);
        $this->assertSame('7', (string) $row['tischnummer']);
        $this->assertFalse(tableHasColumn('mitglied', 'weihnachtsessen'));
        $this->assertFalse(tableHasColumn('mitglied', 'wn_essen_bezahlt'));
        $this->assertFalse(tableHasColumn('mitglied', 'gezahlter_betrag_weihnachten'));
        $this->assertFalse(tableHasColumn('mitglied', 'tischnummer'));
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

    public function testMembersCollectionReportsTakenIdAsConflict(): void
    {
        TestDatabase::insertMemberRow(7, 'Alt', 'Otto');
        $this->request('POST', $this->validMember(['id' => 7]));

        $this->assertApiError(409, 'Die ID 7 ist bereits vergeben', fn() => handleMembersCollection(self::ADMIN));
        $this->assertSame(1, $this->countRows('mitglied', 'id = 7'));
        $this->assertSame('Alt', $this->fetchColumn('SELECT name FROM mitglied WHERE id = 7'));
    }

    /** Eine Fremdschluesselverletzung darf nicht als vergebene ID durchgereicht werden. */
    public function testFailedCreateDoesNotReportForeignKeyErrorAsTakenId(): void
    {
        $this->request('POST', $this->validMember(['id' => 5, 'interessengruppen' => [999999]]));

        try {
            handleMembersCollection(self::ADMIN);
            $this->fail('Die Fremdschluesselverletzung haette durchschlagen muessen.');
        } catch (ApiError $error) {
            $this->fail('Unerwarteter ApiError: ' . $error->getMessage());
        } catch (PDOException) {
            $this->addToAssertionCount(1);
        }
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

    public function testMemberResourceUpdatesWeihnachtsessenInSideTableAndAuditsChange(): void
    {
        TestDatabase::insertMemberRow(3, 'MÃ¼ller', 'Anna');
        $this->request('PATCH', [
            'weihnachtsessen' => 1,
            'wnEssenBezahlt' => true,
            'gezahlterBetragWeihnachten' => 20,
            'tischnummer' => 4,
        ]);

        $member = $this->capture(static fn() => handleMemberResource(3, self::ADMIN))->payload['member'];
        $row = db()->query('SELECT * FROM mitglied_weihnachtsessen WHERE mitglied_id = 3')->fetch();
        $audit = json_decode((string) db()->query('SELECT aenderungen_json FROM mitglied_aenderung WHERE mitglied_id = 3')->fetchColumn(), true);

        $this->assertSame(1.0, $member['weihnachtsessen']);
        $this->assertTrue($member['wnEssenBezahlt']);
        $this->assertSame('20.00', (string) $row['gezahlter_betrag_weihnachten']);
        $this->assertSame('4', (string) $row['tischnummer']);
        $this->assertSame(
            ['weihnachtsessen', 'wnEssenBezahlt', 'gezahlterBetragWeihnachten', 'tischnummer'],
            array_column($audit, 'field')
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
        $this->request('PUT', ['fileName' => 'anna.png', 'base64' => self::PNG_BASE64]);

        $stored = $this->capture(static fn() => handleMemberPhoto(3, self::ADMIN));
        $this->assertSame('anna.png', $stored->payload['photo']['fileName']);
        $this->assertSame('image/png', $stored->payload['photo']['mimeType']);
        $this->assertSame(strlen(self::png()), $stored->payload['photo']['size']);
        $this->assertSame(1, $this->countRows('mitglied_aenderung', 'mitglied_id = 3 AND aktion = ?', ['photo_updated']));

        unset($_SERVER['CONTENT_TYPE']);
        $this->request('GET');
        $served = $this->capture(static fn() => handleMemberPhoto(3, self::ADMIN));
        $this->assertSame(self::png(), $served->rawBody);
        $this->assertSame('image/png', $served->headers['Content-Type']);
        $this->assertSame('nosniff', $served->headers['X-Content-Type-Options']);

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
        $this->request('PUT', ['base64' => self::PNG_BASE64]);
        $this->assertApiError(404, 'Mitglied nicht gefunden', static fn() => handleMemberPhoto(999, self::ADMIN));
    }

    public function testMemberPhotoAcceptsRawBodyUpload(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        $_SERVER['CONTENT_TYPE'] = 'image/jpeg';
        $_SERVER['HTTP_X_FILE_NAME'] = 'foto%20neu.jpg';
        $_SERVER['REQUEST_METHOD'] = 'PUT';
        requestBody((string) base64_decode(self::JPEG_BASE64, true));

        $response = $this->capture(static fn() => handleMemberPhoto(3, self::ADMIN));

        $this->assertSame('foto neu.jpg', $response->payload['photo']['fileName']);
        $this->assertSame('image/jpeg', $response->payload['photo']['mimeType']);
    }

    public function testMemberPhotoRejectsNonImageContent(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        $_SERVER['CONTENT_TYPE'] = 'application/json';
        $this->request('PUT', ['fileName' => 'boese.png', 'base64' => base64_encode('<html><script>alert(1)</script>')]);

        $this->assertApiError(400, 'JPG-, PNG- oder WebP-Bild', static fn() => handleMemberPhoto(3, self::ADMIN));
        $this->assertSame(0, $this->countRows('mitglied_passbild', 'mitglied_id = 3'));
    }

    /** Der gemeldete Content-Type darf den erkannten Typ nicht ueberschreiben. */
    public function testMemberPhotoIgnoresClaimedContentTypeAndStoresDetectedOne(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        $_SERVER['CONTENT_TYPE'] = 'text/html';
        $_SERVER['REQUEST_METHOD'] = 'PUT';
        requestBody(self::png());

        $response = $this->capture(static fn() => handleMemberPhoto(3, self::ADMIN));

        $this->assertSame('image/png', $response->payload['photo']['mimeType']);
        $this->assertSame(1, $this->countRows('mitglied_passbild', 'mitglied_id = 3 AND mime_type = ?', ['image/png']));
    }
}
