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

    /** Das Beitragsjahr folgt dem Kalender - die Tests rechnen deshalb relativ dazu. */
    private static function jahr(int $offset = 0): int
    {
        return aktuellesBeitragsjahr() + $offset;
    }

    private static function insertZahlung(int $memberId, int $jahr, float $club, ?string $am = null): void
    {
        db()->prepare('INSERT INTO mitglied_zahlung (mitglied_id, beitragsjahr, gezahlter_betrag_club, einzahlung_club_am) VALUES (?, ?, ?, ?)')
            ->execute([$memberId, $jahr, $club, $am]);
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

    public function testMembersCollectionStoresPaymentsInSideTable(): void
    {
        $this->request('POST', $this->validMember([
            'id' => 6,
            'beitragClubBezahlt' => true,
            'gezahlterBetragClub' => 30,
            'einzahlungClubAm' => '2026-01-15',
            'beitragComputerBezahlt' => true,
            'gezahlterBetragComputer' => 20,
            'einzahlungComputerAm' => '2026-02-16',
        ]));

        $member = $this->capture(static fn() => handleMembersCollection(self::ADMIN))->payload['member'];
        $row = db()->query('SELECT * FROM mitglied_zahlung WHERE mitglied_id = 6')->fetch();

        $this->assertTrue($member['beitragClubBezahlt']);
        $this->assertSame(30.0, $member['gezahlterBetragClub']);
        $this->assertSame('2026-02-16', $member['einzahlungComputerAm']);
        $this->assertSame((string) self::jahr(), (string) $row['beitragsjahr']);
        $this->assertSame('20.00', (string) $row['gezahlter_betrag_computer']);
        $this->assertFalse(tableHasColumn('mitglied_zahlung', 'beitrag_club_bezahlt'));
        $this->assertFalse(tableHasColumn('mitglied_zahlung', 'beitrag_computer_bezahlt'));
        $this->assertFalse(tableHasColumn('mitglied', 'beitrag_club_bezahlt'));
        $this->assertFalse(tableHasColumn('mitglied', 'gezahlter_betrag_club'));
        $this->assertFalse(tableHasColumn('mitglied', 'einzahlung_computer_am'));
    }

    public function testMembersCollectionDoesNotKeepEmptyPaymentRow(): void
    {
        $this->request('POST', $this->validMember(['id' => 6]));

        $member = $this->capture(static fn() => handleMembersCollection(self::ADMIN))->payload['member'];

        $this->assertFalse($member['beitragClubBezahlt']);
        $this->assertSame(0, $this->countRows('mitglied_zahlung', 'mitglied_id = 6'));
    }

    public function testPaymentFlagsAreDerivedFromAmounts(): void
    {
        $this->request('POST', $this->validMember([
            'id' => 6,
            'beitragClubBezahlt' => false,
            'gezahlterBetragClub' => 7.5,
            'beitragComputerBezahlt' => true,
            'gezahlterBetragComputer' => 0,
        ]));
        $member = $this->capture(static fn() => handleMembersCollection(self::ADMIN))->payload['member'];

        $this->assertTrue($member['beitragClubBezahlt']);
        $this->assertFalse($member['beitragComputerBezahlt']);
    }

    /** Der Sollbeitrag steht in paidAmountDefaults, nicht mehr in der Datenbank. */
    public function testSchemaHasNoPriceColumnsLeft(): void
    {
        $this->assertFalse(tableHasColumn('mitglied', 'preis_club'));
        $this->assertFalse(tableHasColumn('mitglied', 'preis_computer'));
        $this->assertFalse(tableHasColumn('mitglied_weihnachtsessen', 'preis_weihnachten'));
    }

    public function testMembersCollectionLetsTheDatabaseAssignTheId(): void
    {
        TestDatabase::insertMemberRow(7, 'Alt', 'Otto');
        $this->request('POST', $this->validMember());

        $response = $this->capture(static fn() => handleMembersCollection(self::ADMIN));

        // AUTO_INCREMENT zaehlt hinter der hoechsten vergebenen Nummer weiter.
        $this->assertSame(8.0, $response->payload['member']['id']);
        $this->assertSame(1, $this->countRows('mitglied', 'id = 8'));
    }

    /** Ein Reimport soll bestehende Nummern behalten koennen. */
    public function testMembersCollectionKeepsAnExplicitlyGivenId(): void
    {
        $this->request('POST', $this->validMember(['id' => 4711]));

        $response = $this->capture(static fn() => handleMembersCollection(self::ADMIN));

        $this->assertSame(4711.0, $response->payload['member']['id']);
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

    public function testMemberResourceUpdatesPaymentsInSideTableAndAuditsChange(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        $this->request('PATCH', [
            'beitragClubBezahlt' => true,
            'gezahlterBetragClub' => 30,
            'einzahlungClubAm' => '2026-03-17',
        ]);

        $member = $this->capture(static fn() => handleMemberResource(3, self::ADMIN))->payload['member'];
        $row = db()->query('SELECT * FROM mitglied_zahlung WHERE mitglied_id = 3')->fetch();
        $audit = json_decode((string) db()->query('SELECT aenderungen_json FROM mitglied_aenderung WHERE mitglied_id = 3')->fetchColumn(), true);

        $this->assertTrue($member['beitragClubBezahlt']);
        $this->assertSame(30.0, $member['gezahlterBetragClub']);
        $this->assertSame('2026-03-17', $row['einzahlung_club_am']);
        $this->assertSame((string) self::jahr(), (string) $row['beitragsjahr']);
        $this->assertSame(
            ['beitragClubBezahlt', 'gezahlterBetragClub', 'einzahlungClubAm'],
            array_column($audit, 'field')
        );
    }

    public function testMemberResourceKeepsOlderPaymentsAndUsesCurrentBeitragsjahr(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        self::insertZahlung(3, self::jahr(-1), 25);

        $before = $this->capture(static fn() => handleMemberResource(3, self::ADMIN))->payload['member'];
        $this->assertFalse($before['beitragClubBezahlt']);

        $this->request('PATCH', ['beitragClubBezahlt' => true, 'gezahlterBetragClub' => 30]);
        $this->capture(static fn() => handleMemberResource(3, self::ADMIN));

        $rows = db()->query(
            'SELECT beitragsjahr, gezahlter_betrag_club FROM mitglied_zahlung WHERE mitglied_id = 3 ORDER BY beitragsjahr'
        )->fetchAll();
        $this->assertSame([(string) self::jahr(-1), (string) self::jahr()], array_map(static fn(array $row): string => (string) $row['beitragsjahr'], $rows));
        $this->assertSame(['25.00', '30.00'], array_map(static fn(array $row): string => (string) $row['gezahlter_betrag_club'], $rows));
    }

    public function testMemberResourceDeletesEmptyCurrentPaymentButKeepsOlderYear(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        self::insertZahlung(3, self::jahr(-1), 25, '2024-11-15');
        self::insertZahlung(3, self::jahr(), 30, '2025-11-15');
        $this->request('PATCH', [
            'beitragClubBezahlt' => false,
            'gezahlterBetragClub' => 0,
            'einzahlungClubAm' => null,
        ]);

        $member = $this->capture(static fn() => handleMemberResource(3, self::ADMIN))->payload['member'];
        $years = db()->query('SELECT beitragsjahr FROM mitglied_zahlung WHERE mitglied_id = 3 ORDER BY beitragsjahr')->fetchAll();

        $this->assertFalse($member['beitragClubBezahlt']);
        $this->assertSame([(string) self::jahr(-1)], array_map(static fn(array $row): string => (string) $row['beitragsjahr'], $years));
    }

    public function testMemberListAndResourceIncludeAllBeitragsjahre(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        TestDatabase::insertMemberRow(4, 'Schmidt', 'Bert');
        self::insertZahlung(3, self::jahr(), 30, '2026-01-15');
        self::insertZahlung(3, self::jahr(1), 30);
        $this->request('GET');

        $members = $this->capture(static fn() => handleMembersCollection(self::ADMIN))->payload['members'];
        $member = $this->capture(static fn() => handleMemberResource(3, self::ADMIN))->payload['member'];

        $this->assertSame([self::jahr(1), self::jahr()], array_column($members[0]['zahlungen'], 'beitragsjahr'));
        $this->assertSame([], $members[1]['zahlungen']);
        $this->assertSame(
            ['beitragsjahr' => self::jahr(), 'gezahlterBetragClub' => 30.0, 'einzahlungClubAm' => '2026-01-15', 'gezahlterBetragComputer' => 0.0, 'einzahlungComputerAm' => null],
            $member['zahlungen'][1]
        );
    }

    public function testMemberResourceStoresOtherBeitragsjahrAndAuditsItWithYear(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        $this->request('PATCH', ['zahlungen' => [
            ['beitragsjahr' => self::jahr(1), 'gezahlterBetragClub' => 30, 'einzahlungClubAm' => '2026-12-01'],
        ]]);

        $member = $this->capture(static fn() => handleMemberResource(3, self::ADMIN))->payload['member'];
        $audit = json_decode((string) db()->query('SELECT aenderungen_json FROM mitglied_aenderung WHERE mitglied_id = 3')->fetchColumn(), true);

        $this->assertSame(0.0, $member['gezahlterBetragClub']);
        $this->assertSame(self::jahr(1), $member['zahlungen'][0]['beitragsjahr']);
        $this->assertSame(30.0, $member['zahlungen'][0]['gezahlterBetragClub']);
        $this->assertSame(['Gezahlter Betrag Club ' . self::jahr(1), 'Einzahlung Club am ' . self::jahr(1)], array_column($audit, 'label'));
    }

    public function testMemberResourceLetsFlatFieldsWinForCurrentBeitragsjahrAndDeletesEmptiedYear(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        self::insertZahlung(3, self::jahr(1), 30);
        $this->request('PUT', $this->validMember([
            'gezahlterBetragClub' => 30,
            'zahlungen' => [
                ['beitragsjahr' => self::jahr(), 'gezahlterBetragClub' => 10],
                ['beitragsjahr' => self::jahr(1), 'gezahlterBetragClub' => 0],
            ],
        ]));

        $member = $this->capture(static fn() => handleMemberResource(3, self::ADMIN))->payload['member'];

        $this->assertSame(30.0, $member['gezahlterBetragClub']);
        $this->assertSame([self::jahr()], array_column($member['zahlungen'], 'beitragsjahr'));
    }

    public function testMemberResourceRejectsChangesToAbgelaufeneBeitragsjahre(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        self::insertZahlung(3, self::jahr(-1), 25, '2025-02-01');

        $this->request('PATCH', ['zahlungen' => [['beitragsjahr' => self::jahr(1), 'gezahlterBetragClub' => 30]]]);
        $member = $this->capture(static fn() => handleMemberResource(3, self::ADMIN))->payload['member'];
        $this->assertSame([self::jahr(1), self::jahr(-1)], array_column($member['zahlungen'], 'beitragsjahr'));

        $this->request('PATCH', ['zahlungen' => [['beitragsjahr' => self::jahr(-1), 'gezahlterBetragClub' => 25, 'einzahlungClubAm' => '2025-02-01']]]);
        $this->assertApiError(400, 'abgeschlossen', static fn() => handleMemberResource(3, self::ADMIN));
        $this->request('POST', $this->validMember(['zahlungen' => [['beitragsjahr' => self::jahr(-1), 'gezahlterBetragClub' => 30]]]));
        $this->assertApiError(400, 'abgeschlossen', static fn() => handleMembersCollection(self::ADMIN));
        $this->assertSame(25.0, (float) db()->query('SELECT gezahlter_betrag_club FROM mitglied_zahlung WHERE beitragsjahr = ' . self::jahr(-1))->fetchColumn());
    }

    public function testMemberResourceRejectsInvalidZahlungen(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna');
        foreach ([
            'beitragsjahr' => [['gezahlterBetragClub' => 30]],
            'negativ' => [['beitragsjahr' => self::jahr(1), 'gezahlterBetragClub' => -1]],
            'Unbekannte Felder' => [['beitragsjahr' => self::jahr(1), 'beitragClubBezahlt' => true]],
            'Liste' => 'kaputt',
        ] as $message => $zahlungen) {
            $this->request('PATCH', ['zahlungen' => $zahlungen]);
            $this->assertApiError(400, $message, static fn() => handleMemberResource(3, self::ADMIN));
        }
        $this->assertSame(0, $this->countRows('mitglied_zahlung', 'mitglied_id = 3'));
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

    public function testMemberMergeTakesChosenFieldsAndMovesRelatedRows(): void
    {
        TestDatabase::insertMemberRow(10, 'Lieven', 'Alexander', ['strasse' => 'Lahrer Pfad 5', 'plz' => '13469', 'ort' => 'Berlin', 'eintrittsdatum' => '2022-10-01', 'austrittsdatum' => '2024-12-31', 'austrittsgrund_id' => 4]);
        TestDatabase::insertMemberRow(20, 'Lieven', 'Alexander', ['ort' => 'Oranienburg', 'eintrittsdatum' => '2025-06-01', 'handy' => '0157 1234567']);
        db()->exec('INSERT INTO mitglied_interessengruppe (mitglied_id, interessengruppe_id) VALUES (10, 1), (20, 4)');
        self::insertZahlung(10, self::jahr(-1), 30, self::jahr(-1) . '-02-01');
        self::insertZahlung(10, self::jahr(), 15, self::jahr() . '-01-10');
        self::insertZahlung(20, self::jahr(), 30, self::jahr() . '-02-05');
        db()->exec("INSERT INTO event_teilnehmer (event_id, name, vorname, essensauswahl, mitglied_id) VALUES (1, 'Lieven', 'Alexander', 'Rind', 10)");
        auditMemberChange(10, 'updated', [], self::ADMIN);
        $this->request('POST', ['sourceId' => 10, 'fromSource' => ['eintrittsdatum', 'strasse', 'plz']]);

        $member = $this->capture(static fn() => handleMemberMerge(20, self::ADMIN))->payload['member'];

        $this->assertSame('2022-10-01', $member['eintrittsdatum']);
        $this->assertSame('Lahrer Pfad 5', $member['strasse']);
        $this->assertSame('Oranienburg', $member['ort']);
        $this->assertNull($member['austrittsdatum']);
        $this->assertSame([4], $member['interessengruppen']);
        // Fehlendes Vorjahr zieht um, im aktuellen Jahr behaelt der Zieldatensatz seine Zahlung
        $this->assertEquals(30, $member['gezahlterBetragClub']);
        $this->assertSame([self::jahr(), self::jahr(-1)], array_map('intval', array_column($member['zahlungen'], 'beitragsjahr')));
        $this->assertSame(0, $this->countRows('mitglied', 'id = 10'));
        $this->assertSame(0, $this->countRows('mitglied_zahlung', 'mitglied_id = 10'));
        $this->assertSame(1, $this->countRows('event_teilnehmer', 'mitglied_id = 20'));
        $this->assertSame(2, $this->countRows('mitglied_aenderung', 'mitglied_id = 20'));
        $audit = json_decode((string) $this->fetchColumn("SELECT aenderungen_json FROM mitglied_aenderung WHERE mitglied_id = 20 AND aktion = 'merged'"), true);
        $this->assertContains('eintrittsdatum', array_column($audit, 'field'));
        $this->assertSame('Alexander Lieven (ID 10)', $audit[count($audit) - 1]['old']);
    }

    public function testMemberMergeCanTakeGroupsAndPhotoFromSource(): void
    {
        TestDatabase::insertMemberRow(10, 'Lieven', 'Alexander', ['passbild' => 'alt.png']);
        TestDatabase::insertMemberRow(20, 'Lieven', 'Alexander');
        db()->exec('INSERT INTO mitglied_interessengruppe (mitglied_id, interessengruppe_id) VALUES (10, 1)');
        db()->prepare("INSERT INTO mitglied_passbild (mitglied_id, dateiname, mime_type, groesse_bytes, inhalt) VALUES (10, 'alt.png', 'image/png', ?, ?)")
            ->execute([strlen(self::png()), self::png()]);
        $this->request('POST', ['sourceId' => 10, 'fromSource' => ['interessengruppen', 'passbild']]);

        $member = $this->capture(static fn() => handleMemberMerge(20, self::ADMIN))->payload['member'];

        $this->assertSame([1], $member['interessengruppen']);
        $this->assertSame('alt.png', $member['passbild']);
        $this->assertTrue($member['hasPassbildInDb']);
        $this->assertSame(self::png(), $this->fetchColumn('SELECT inhalt FROM mitglied_passbild WHERE mitglied_id = 20'));
    }

    public function testMemberMergeRejectsInvalidRequests(): void
    {
        TestDatabase::insertMemberRow(10, 'Lieven', 'Alexander');
        TestDatabase::insertMemberRow(20, 'Lieven', 'Alexander');

        $this->request('POST', ['sourceId' => 20, 'fromSource' => []]);
        $this->assertApiError(400, 'anderer Datensatz', static fn() => handleMemberMerge(20, self::ADMIN));
        $this->request('POST', ['sourceId' => 10, 'fromSource' => ['gezahlterBetragClub']]);
        $this->assertApiError(400, 'Nicht uebernehmbare Felder', static fn() => handleMemberMerge(20, self::ADMIN));
        $this->request('POST', ['sourceId' => 99, 'fromSource' => []]);
        $this->assertApiError(404, 'nicht gefunden', static fn() => handleMemberMerge(20, self::ADMIN));
        $this->request('GET');
        $this->assertApiError(405, '', static fn() => handleMemberMerge(20, self::ADMIN));
        $this->request('POST', ['sourceId' => 10, 'fromSource' => []]);
        $this->assertApiError(403, 'Administratorrechte', static fn() => handleMemberMerge(20, ['id' => 2, 'username' => 'anna', 'role' => 'user']));
        $this->assertSame(2, $this->countRows('mitglied', 'id IN (10, 20)'));
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

    public function testMemberUpdateRejectsImplausibleValuesButKeepsLegacyDataEditable(): void
    {
        TestDatabase::insertMemberRow(3, 'Müller', 'Anna', ['plz' => '1346']);
        $this->request('PATCH', ['plz' => '134']);
        $this->assertApiError(400, 'PLZ', static fn() => handleMemberResource(3, self::ADMIN));

        $this->request('PATCH', ['ort' => 'Potsdam']);
        $this->assertSame('Potsdam', $this->capture(static fn() => handleMemberResource(3, self::ADMIN))->payload['member']['ort']);
    }
}
