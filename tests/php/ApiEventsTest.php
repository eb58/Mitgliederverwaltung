<?php
declare(strict_types=1);

final class ApiEventsTest extends DatabaseTestCase
{
    private function createEvent(array $settings): array
    {
        $this->request('POST', $settings);
        $response = $this->capture(static fn() => handleEventsCollection());
        $this->assertSame(201, $response->statusCode);
        return $response->payload['event'];
    }

    private function addParticipant(string $key, array $participant): array
    {
        $this->request('POST', $participant);
        return $this->capture(static fn() => handleEventParticipantCollection($key))->payload['participant'];
    }

    public function testCollectionListsSeededEventsWithSettings(): void
    {
        $this->request('GET');

        $events = $this->capture(static fn() => handleEventsCollection())->payload['events'];

        $this->assertSame(['eisbeinessen', 'warnemuende'], array_column($events, 'key'));
        $warnemuende = $events[1];
        $this->assertSame('Warnemünde', $warnemuende['label']);
        $this->assertSame('schiff', $warnemuende['symbol']);
        $this->assertSame(50, $warnemuende['maxSeats']);
        $this->assertSame(['Zander', 'Rind', 'Vegie'], $warnemuende['mealOptions']);
        $this->assertNull($warnemuende['datum']);
        $this->assertNull($warnemuende['preis']);
        $this->assertFalse($warnemuende['archiviert']);
        $this->assertSame('Selbstbeteiligung liegt bei 20 Euro.', $events[0]['pdfHinweis']);
    }

    public function testCollectionSortsByDateWithUndatedLast(): void
    {
        $this->createEvent(['label' => 'Herbstfahrt', 'datum' => '2027-09-01']);
        $this->createEvent(['label' => 'Frühlingsfest', 'datum' => '2027-04-01']);
        $this->request('GET');

        $events = $this->capture(static fn() => handleEventsCollection())->payload['events'];

        $this->assertSame(['fruehlingsfest', 'herbstfahrt', 'eisbeinessen', 'warnemuende'], array_column($events, 'key'));
    }

    public function testCreateBuildsKeyFromLabelAndStoresAllSettings(): void
    {
        $event = $this->createEvent([
            'label' => ' Sommerfest 2027 ',
            'datum' => '2027-07-03',
            'symbol' => 'feier',
            'maxSeats' => '80',
            'mealOptions' => [' Grillwurst ', '', 'Salat'],
            'preis' => '12.5',
            'pdfHinweis' => ' Bitte Geschirr mitbringen. ',
        ]);

        $this->assertSame('sommerfest2027', $event['key']);
        $this->assertSame('Sommerfest 2027', $event['label']);
        $this->assertSame('2027-07-03', $event['datum']);
        $this->assertSame('feier', $event['symbol']);
        $this->assertSame(80, $event['maxSeats']);
        $this->assertSame(['Grillwurst', 'Salat'], $event['mealOptions']);
        $this->assertSame(12.5, $event['preis']);
        $this->assertSame('Bitte Geschirr mitbringen.', $event['pdfHinweis']);
        $this->assertSame(0, $event['participantCount']);
    }

    public function testKeyReplacesUmlautsAndStaysUnique(): void
    {
        $first = $this->createEvent(['label' => 'Grünkohl-Essen']);
        $second = $this->createEvent(['label' => 'Grünkohl Essen!']);
        $empty = $this->createEvent(['label' => '§§§']);

        $this->assertSame('gruenkohlessen', $first['key']);
        $this->assertSame('gruenkohlessen2', $second['key']);
        $this->assertSame('event', $empty['key']);
    }

    public function testCreateRejectsInvalidSettings(): void
    {
        $cases = [
            [['label' => '  '], 400, 'Bezeichnung des Events fehlt'],
            [['label' => 'X', 'datum' => '2027-02-30'], 400, 'Datum'],
            [['label' => 'X', 'symbol' => 'rakete'], 400, 'Symbol'],
            [['label' => 'X', 'maxSeats' => 0], 400, 'Plaetze'],
            [['label' => 'X', 'maxSeats' => 2.5], 400, 'Plaetze'],
            [['label' => 'X', 'mealOptions' => 'Fisch'], 400, 'Liste'],
            [['label' => 'X', 'mealOptions' => ['Fisch', 'fisch']], 400, 'doppelt'],
            [['label' => 'X', 'preis' => -1], 400, 'Preis'],
            [['label' => 'X', 'farbe' => 'rot'], 400, 'Unbekannte Felder'],
        ];
        foreach ($cases as [$payload, $status, $message]) {
            $this->request('POST', $payload);
            $this->assertApiError($status, $message, static fn() => handleEventsCollection());
        }
        $this->assertSame(2, $this->countRows('event'));
    }

    public function testNewEventTakesParticipantsWithItsOwnMeals(): void
    {
        TestDatabase::insertMemberRow(439, 'Brandl', 'Erich');
        $event = $this->createEvent(['label' => 'Grillfest', 'mealOptions' => ['Rind', 'Rinderroulade'], 'maxSeats' => 2]);

        $participant = $this->addParticipant($event['key'], ['name' => 'Brandl', 'vorname' => 'Erich', 'essensauswahl' => 'rinderroulade']);

        // Der genaue Name geht vor dem Wortanfang - sonst wuerde aus der Roulade ein Rind.
        $this->assertSame('Rinderroulade', $participant['essensauswahl']);
        $this->assertSame(439, $participant['mitgliedId']);
        $this->assertSame(1, $this->countRows('event_teilnehmer', 'event_id = ?', [$event['id']]));
        $this->request('GET');
        $this->assertCount(0, $this->capture(static fn() => handleEventParticipantCollection('warnemuende'))->payload['participants']);
    }

    public function testParticipantCountIgnoresCancellations(): void
    {
        $event = $this->createEvent(['label' => 'Kegeln']);
        $this->addParticipant($event['key'], ['name' => 'Witt', 'vorname' => 'Gisela']);
        $this->addParticipant($event['key'], ['name' => 'Barz', 'vorname' => 'Peter', 'abgesagt' => true]);
        $this->request('GET');

        $this->assertSame(1, $this->capture(static fn() => handleEventResource($event['id']))->payload['event']['participantCount']);
    }

    public function testUpdateChangesSettingsButKeepsKey(): void
    {
        $event = $this->createEvent(['label' => 'Kegeln']);
        $this->request('PUT', ['label' => 'Kegelabend', 'datum' => '2027-11-11', 'symbol' => 'musik', 'maxSeats' => null, 'mealOptions' => [], 'preis' => null, 'pdfHinweis' => '', 'archiviert' => true]);

        $updated = $this->capture(static fn() => handleEventResource($event['id']))->payload['event'];

        $this->assertSame('kegeln', $updated['key']);
        $this->assertSame('Kegelabend', $updated['label']);
        $this->assertSame('2027-11-11', $updated['datum']);
        $this->assertTrue($updated['archiviert']);
        // Archivierte Events bleiben ueber ihren Schluessel erreichbar.
        $this->assertSame('Kegelabend', eventDefinition('kegeln')['label']);
    }

    public function testUpdateRefusesToDropMealStillChosen(): void
    {
        $this->addParticipant('warnemuende', ['name' => 'Witt', 'vorname' => 'Gisela', 'essensauswahl' => 'Vegie']);
        $this->request('PUT', ['label' => 'Warnemünde', 'mealOptions' => ['Zander', 'Rind', 'Scholle']]);

        $this->assertApiError(409, '"Vegie" haben noch 1 Teilnehmer gewaehlt', static fn() => handleEventResource(1));

        $this->request('PUT', ['label' => 'Warnemünde', 'mealOptions' => ['Zander', 'Rind', 'Vegie', 'Scholle']]);
        $this->assertSame(['Zander', 'Rind', 'Vegie', 'Scholle'], $this->capture(static fn() => handleEventResource(1))->payload['event']['mealOptions']);
    }

    /** Ohne Essensauswahl verschwindet das Feld aus der API, das gespeicherte Gericht aber nicht. */
    public function testSwitchingMealsOffKeepsStoredChoice(): void
    {
        $participant = $this->addParticipant('warnemuende', ['name' => 'Witt', 'vorname' => 'Gisela', 'essensauswahl' => 'Rind']);
        $this->request('PUT', ['label' => 'Warnemünde', 'mealOptions' => []]);
        $this->capture(static fn() => handleEventResource(1));

        $this->request('PATCH', ['bezahlt' => true]);
        $updated = $this->capture(static fn() => handleEventParticipantResource('warnemuende', $participant['id']))->payload['participant'];

        $this->assertArrayNotHasKey('essensauswahl', $updated);
        $this->assertSame('Rind', $this->fetchColumn('SELECT essensauswahl FROM event_teilnehmer WHERE id = ?', [$participant['id']]));
    }

    /** Nach Aus- und Wiedereinschalten der Essensauswahl bleibt das Gericht, auch wenn ein PUT es nicht mitschickt. */
    public function testPutWithoutMealKeepsStoredChoice(): void
    {
        $participant = $this->addParticipant('warnemuende', ['name' => 'Witt', 'vorname' => 'Gisela', 'essensauswahl' => 'Rind']);
        $this->request('PUT', ['name' => 'Witt', 'vorname' => 'Gisela', 'bezahlt' => true]);

        $updated = $this->capture(static fn() => handleEventParticipantResource('warnemuende', $participant['id']))->payload['participant'];

        $this->assertTrue($updated['bezahlt']);
        $this->assertSame('Rind', $updated['essensauswahl']);
    }

    public function testDeleteOnlyEmptyEvents(): void
    {
        $this->addParticipant('eisbeinessen', ['name' => 'Witt', 'vorname' => 'Gisela', 'abgesagt' => true]);
        $this->request('DELETE');
        $this->assertApiError(409, 'Eisbeinessen hat noch 1 Eintrag', static fn() => handleEventResource(2));

        $event = $this->createEvent(['label' => 'Versehen']);
        $this->request('DELETE');
        $this->assertSame(204, $this->capture(static fn() => handleEventResource($event['id']))->statusCode);
        $this->assertSame(0, $this->countRows('event', 'schluessel = ?', ['versehen']));
    }

    public function testUnknownEventIsRejected(): void
    {
        $this->request('GET');
        $this->assertApiError(404, 'Event nicht gefunden', static fn() => handleEventResource(4711));
        $this->assertApiError(404, 'Unbekanntes Event', static fn() => handleEventParticipantCollection('sommerfest'));
    }

    /** Wie vor dem Update: nur die alten Tabellen je Event. */
    private static function dropEventTables(): void
    {
        db()->exec('SET FOREIGN_KEY_CHECKS = 0');
        db()->exec('DROP TABLE event_teilnehmer');
        db()->exec('DROP TABLE event');
        db()->exec('DROP TABLE event_migration');
        db()->exec('SET FOREIGN_KEY_CHECKS = 1');
        clearSchemaCache();
    }

    /** Wie im Betrieb: Es gibt nur die alten Tabellen je Event; der erste Zugriff zieht sie um. */
    public function testLegacyTablesMigrateOnFirstAccess(): void
    {
        TestDatabase::insertMemberRow(80, 'Jeschon', 'Peter');
        self::dropEventTables();
        db()->exec("INSERT INTO warnemuende_teilnehmer (id, name, vorname, essensauswahl, bezahlt, abgesagt, bemerkung, mitglied_id) VALUES
            (7, 'Zuletzt', 'Zoe', 'Vegie', 0, 1, 'kommt nicht', NULL),
            (3, 'Jeschon', 'Peter', 'Rind', 1, 0, '', 80)");
        db()->exec("INSERT INTO eisbeinessen_teilnehmer (name, vorname, bezahlt) VALUES ('Witt', 'Gisela', 1)");
        clearSchemaCache();

        $this->request('GET');
        $events = $this->capture(static fn() => handleEventsCollection())->payload['events'];
        $warnemuende = $this->capture(static fn() => handleEventParticipantCollection('warnemuende'))->payload['participants'];
        $eisbein = $this->capture(static fn() => handleEventParticipantCollection('eisbeinessen'))->payload['participants'];

        $this->assertSame(['eisbeinessen', 'warnemuende'], array_column($events, 'key'));
        $this->assertSame([1, 1], array_column($events, 'participantCount'));
        $this->assertSame('Jeschon', $warnemuende[0]['name']);
        $this->assertSame('Rind', $warnemuende[0]['essensauswahl']);
        $this->assertTrue($warnemuende[0]['bezahlt']);
        $this->assertSame(80, $warnemuende[0]['mitgliedId']);
        $this->assertTrue($warnemuende[1]['abgesagt']);
        // Anmeldereihenfolge bleibt erhalten: die alte ID 3 kommt vor der 7.
        $this->assertLessThan($warnemuende[1]['id'], $warnemuende[0]['id']);
        $this->assertSame(['Witt'], array_column($eisbein, 'name'));
        $this->assertArrayNotHasKey('essensauswahl', $eisbein[0]);

        // Ein zweiter Durchlauf uebernimmt nichts doppelt.
        migrateLegacyEvents();
        $this->assertSame(3, $this->countRows('event_teilnehmer'));
        $this->assertSame(2, $this->countRows('warnemuende_teilnehmer'));
    }

    /** Scheitert die Uebernahme mittendrin, bleibt nichts halb liegen - der naechste Zugriff holt sie nach. */
    public function testInterruptedMigrationResumesOnNextAccess(): void
    {
        self::dropEventTables();
        db()->exec("INSERT INTO eisbeinessen_teilnehmer (name, vorname) VALUES ('Witt', 'Gisela')");
        // Verweist auf ein Mitglied, das es nicht gibt: der Fremdschluessel in event_teilnehmer laesst die Kopie scheitern.
        db()->exec('SET FOREIGN_KEY_CHECKS = 0');
        db()->exec("INSERT INTO warnemuende_teilnehmer (name, vorname, essensauswahl, mitglied_id) VALUES ('Geist', 'Gustav', 'Rind', 4711)");
        db()->exec('SET FOREIGN_KEY_CHECKS = 1');
        $this->request('GET');

        $this->assertApiError(503, 'Warnemünde konnte nicht uebernommen werden', static fn() => handleEventsCollection());
        $this->assertSame(0, $this->countRows('event', 'schluessel = ?', ['warnemuende']));
        $this->assertSame(0, $this->countRows('event_migration', 'schluessel = ?', ['warnemuende']));

        db()->exec('UPDATE warnemuende_teilnehmer SET mitglied_id = NULL');
        $events = $this->capture(static fn() => handleEventsCollection())->payload['events'];
        $participants = $this->capture(static fn() => handleEventParticipantCollection('warnemuende'))->payload['participants'];

        $this->assertSame(['eisbeinessen', 'warnemuende'], array_column($events, 'key'));
        $this->assertSame(['Geist'], array_column($participants, 'name'));
        $this->assertSame('Rind', $participants[0]['essensauswahl']);
        $this->assertSame(1, $this->countRows('event_teilnehmer', 'event_id = ?', [$events[0]['id']]));
    }

    /** Ein umgezogenes und danach geloeschtes Event kommt nicht aus der alten Tabelle zurueck. */
    public function testDeletedMigratedEventStaysDeleted(): void
    {
        db()->exec("INSERT INTO eisbeinessen_teilnehmer (name, vorname) VALUES ('Witt', 'Gisela')");
        $this->request('DELETE');
        $this->capture(static fn() => handleEventResource(2));

        $this->request('GET');
        $events = $this->capture(static fn() => handleEventsCollection())->payload['events'];

        $this->assertSame(['warnemuende'], array_column($events, 'key'));
        $this->assertSame(0, $this->countRows('event_teilnehmer'));
    }
}
