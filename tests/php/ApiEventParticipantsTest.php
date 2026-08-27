<?php
declare(strict_types=1);

final class ApiEventParticipantsTest extends DatabaseTestCase
{
    private function insertParticipant(string $name, string $vorname, string $essensauswahl = 'Zander', ?int $mitgliedId = null): int
    {
        db()->prepare('INSERT INTO warnemuende_teilnehmer (name, vorname, essensauswahl, mitglied_id) VALUES (?, ?, ?, ?)')
            ->execute([$name, $vorname, $essensauswahl, $mitgliedId]);
        return (int) db()->lastInsertId();
    }

    public function testCollectionListsParticipantsSortedByName(): void
    {
        $this->insertParticipant('Zander', 'Anna');
        $this->insertParticipant('Barz', 'Peter', 'Rind');
        $this->request('GET');

        $participants = $this->capture(static fn() => handleEventParticipantCollection('warnemuende'))->payload['participants'];

        $this->assertSame(['Barz', 'Zander'], array_column($participants, 'name'));
        $this->assertSame(['id', 'name', 'vorname', 'essensauswahl', 'bezahlt', 'abgesagt', 'bemerkung', 'mitgliedId'], array_keys($participants[0]));
        $this->assertFalse($participants[0]['bezahlt']);
        $this->assertNull($participants[0]['mitgliedId']);
    }

    public function testCollectionCreatesParticipantWithMemberReference(): void
    {
        TestDatabase::insertMemberRow(439, 'Brandl', 'Erich');
        $this->request('POST', ['name' => ' Brandl ', 'vorname' => ' Erich ', 'essensauswahl' => 'Zander', 'mitgliedId' => 439]);

        $response = $this->capture(static fn() => handleEventParticipantCollection('warnemuende'));

        $this->assertSame(201, $response->statusCode);
        $this->assertSame('Brandl', $response->payload['participant']['name']);
        $this->assertSame('Erich', $response->payload['participant']['vorname']);
        $this->assertSame(439, $response->payload['participant']['mitgliedId']);
        $this->assertSame(1, $this->countRows('warnemuende_teilnehmer'));
    }

    public function testCreateAcceptsSpellingsOfThePaperList(): void
    {
        $this->request('POST', ['name' => 'Fisch', 'vorname' => 'Doris', 'essensauswahl' => 'Zanderfilet']);
        $this->assertSame('Zander', $this->capture(static fn() => handleEventParticipantCollection('warnemuende'))->payload['participant']['essensauswahl']);

        $this->request('POST', ['name' => 'Dreesen', 'vorname' => 'Bärbel', 'essensauswahl' => 'Rinderbäckchen']);
        $this->assertSame('Rind', $this->capture(static fn() => handleEventParticipantCollection('warnemuende'))->payload['participant']['essensauswahl']);
    }

    public function testCreateRejectsEmptyNameUnknownFieldsAndUnknownMeal(): void
    {
        $this->request('POST', ['name' => '  ', 'vorname' => 'Erich']);
        $this->assertApiError(400, 'Name und Vorname', static fn() => handleEventParticipantCollection('warnemuende'));

        $this->request('POST', ['name' => 'Brandl', 'vorname' => 'Erich', 'tischnummer' => 3]);
        $this->assertApiError(400, 'Unbekannte Felder', static fn() => handleEventParticipantCollection('warnemuende'));

        $this->request('POST', ['name' => 'Brandl', 'vorname' => 'Erich', 'essensauswahl' => 'Schnitzel']);
        $this->assertApiError(400, 'Essensauswahl', static fn() => handleEventParticipantCollection('warnemuende'));
    }

    public function testCreateRejectsUnknownMemberId(): void
    {
        $this->request('POST', ['name' => 'Brandl', 'vorname' => 'Erich', 'mitgliedId' => 4711]);

        $this->assertApiError(400, 'Unbekannte DB-ID', static fn() => handleEventParticipantCollection('warnemuende'));
        $this->assertSame(0, $this->countRows('warnemuende_teilnehmer'));
    }

    public function testCreateStoresPaymentFlagAndNote(): void
    {
        $this->request('POST', ['name' => 'Witt', 'vorname' => 'Gisela', 'bezahlt' => true, 'bemerkung' => '  zahlt im Bus  ']);

        $participant = $this->capture(static fn() => handleEventParticipantCollection('warnemuende'))->payload['participant'];

        $this->assertTrue($participant['bezahlt']);
        $this->assertSame('zahlt im Bus', $participant['bemerkung']);
    }

    public function testResourceUpdatesParticipant(): void
    {
        $id = $this->insertParticipant('Sachwel', 'Uschi', 'Rind');
        TestDatabase::insertMemberRow(386, 'Sachweh', 'Ursula');
        $this->request('PUT', ['name' => 'Sachweh', 'vorname' => 'Ursula', 'essensauswahl' => 'Vegie', 'mitgliedId' => 386]);

        $participant = $this->capture(static fn() => handleEventParticipantResource('warnemuende', $id))->payload['participant'];

        $this->assertSame(
            ['id' => $id, 'name' => 'Sachweh', 'vorname' => 'Ursula', 'essensauswahl' => 'Vegie', 'bezahlt' => false, 'abgesagt' => false, 'bemerkung' => '', 'mitgliedId' => 386],
            $participant
        );
    }

    public function testPatchKeepsUnsentFields(): void
    {
        $id = $this->insertParticipant('Barz', 'Monika', 'Zander');
        $this->request('PATCH', ['bezahlt' => true]);

        $participant = $this->capture(static fn() => handleEventParticipantResource('warnemuende', $id))->payload['participant'];

        $this->assertTrue($participant['bezahlt']);
        $this->assertSame('Zander', $participant['essensauswahl']);
        $this->assertSame('Monika', $participant['vorname']);
    }

    public function testUpdateClearsMemberReferenceWithZero(): void
    {
        TestDatabase::insertMemberRow(80, 'Jeschon', 'Peter');
        $id = $this->insertParticipant('Jeschon', 'Peter', 'Rind', 80);
        $this->request('PUT', ['name' => 'Jeschon', 'vorname' => 'Peter', 'essensauswahl' => 'Rind', 'mitgliedId' => 0]);

        $this->assertNull($this->capture(static fn() => handleEventParticipantResource('warnemuende', $id))->payload['participant']['mitgliedId']);
    }

    public function testAbsageBleibtInDerListe(): void
    {
        $id = $this->insertParticipant('Witt', 'Gisela');
        $this->request('PATCH', ['abgesagt' => true]);
        $this->capture(static fn() => handleEventParticipantResource('warnemuende', $id));

        $this->request('GET');
        $participants = $this->capture(static fn() => handleEventParticipantCollection('warnemuende'))->payload['participants'];

        $this->assertCount(1, $participants);
        $this->assertTrue($participants[0]['abgesagt']);
    }

    public function testResourceDeletesParticipant(): void
    {
        $id = $this->insertParticipant('Witt', 'Gisela');
        $this->request('DELETE');

        $this->assertSame(204, $this->capture(static fn() => handleEventParticipantResource('warnemuende', $id))->statusCode);
        $this->assertSame(0, $this->countRows('warnemuende_teilnehmer'));
    }

    public function testMissingTableIsCreatedOnDemand(): void
    {
        db()->exec('DROP TABLE warnemuende_teilnehmer');
        clearSchemaCache();
        $this->request('GET');

        $this->assertSame([], $this->capture(static fn() => handleEventParticipantCollection('warnemuende'))->payload['participants']);

        $this->request('POST', ['name' => 'Barz', 'vorname' => 'Peter', 'essensauswahl' => 'Rind']);
        $this->assertSame('Rind', $this->capture(static fn() => handleEventParticipantCollection('warnemuende'))->payload['participant']['essensauswahl']);
    }

    /** Ohne Essensauswahl darf die erzeugte Tabelle die Spalte auch nicht haben. */
    public function testEventWithoutMealsGetsTableWithoutMealColumn(): void
    {
        db()->exec('DROP TABLE eisbeinessen_teilnehmer');
        clearSchemaCache();
        $this->request('POST', ['name' => 'Witt', 'vorname' => 'Gisela']);

        $participant = $this->capture(static fn() => handleEventParticipantCollection('eisbeinessen'))->payload['participant'];

        $this->assertSame(['id', 'name', 'vorname', 'bezahlt', 'abgesagt', 'bemerkung', 'mitgliedId'], array_keys($participant));
        $this->assertFalse(tableHasColumn('eisbeinessen_teilnehmer', 'essensauswahl'));
    }

    public function testUnknownParticipantIsRejected(): void
    {
        $this->request('GET');
        $this->assertApiError(404, 'Teilnehmer nicht gefunden', static fn() => handleEventParticipantResource('warnemuende', 4711));
    }

    public function testDeletedMemberKeepsParticipantWithoutReference(): void
    {
        TestDatabase::insertMemberRow(136, 'Odorinszky', 'Dorothea');
        $id = $this->insertParticipant('Odorinszky', 'Dorothea', 'Zander', 136);
        db()->exec('DELETE FROM mitglied WHERE id = 136');
        $this->request('GET');

        $this->assertNull($this->capture(static fn() => handleEventParticipantResource('warnemuende', $id))->payload['participant']['mitgliedId']);
    }

    public function testUnknownEventIsRejected(): void
    {
        $this->request('GET');
        $this->assertApiError(404, 'Unbekanntes Event', static fn() => handleEventParticipantCollection('sommerfest'));
    }

    public function testEisbeinessenHatKeineEssensauswahl(): void
    {
        TestDatabase::insertMemberRow(439, 'Brandl', 'Erich');
        $this->request('POST', ['name' => ' Brandl ', 'vorname' => 'Erich', 'bezahlt' => true, 'bemerkung' => ' am Fenster ', 'mitgliedId' => 439]);

        $response = $this->capture(static fn() => handleEventParticipantCollection('eisbeinessen'));
        $participant = $response->payload['participant'];

        $this->assertSame(201, $response->statusCode);
        $this->assertSame(['id', 'name', 'vorname', 'bezahlt', 'abgesagt', 'bemerkung', 'mitgliedId'], array_keys($participant));
        $this->assertSame('Brandl', $participant['name']);
        $this->assertTrue($participant['bezahlt']);
        $this->assertSame('am Fenster', $participant['bemerkung']);
        $this->assertSame(439, $participant['mitgliedId']);
        $this->assertSame(1, $this->countRows('eisbeinessen_teilnehmer'));
    }

    public function testEisbeinessenLehntEssensauswahlAb(): void
    {
        $this->request('POST', ['name' => 'Brandl', 'vorname' => 'Erich', 'essensauswahl' => 'Eisbein']);

        $this->assertApiError(400, 'Unbekannte Felder', static fn() => handleEventParticipantCollection('eisbeinessen'));
    }

    public function testEisbeinessenAendertUndLoeschtTeilnehmer(): void
    {
        db()->prepare('INSERT INTO eisbeinessen_teilnehmer (name, vorname) VALUES (?, ?)')->execute(['Witt', 'Gisela']);
        $id = (int) db()->lastInsertId();

        $this->request('PATCH', ['abgesagt' => true]);
        $participant = $this->capture(static fn() => handleEventParticipantResource('eisbeinessen', $id))->payload['participant'];
        $this->assertTrue($participant['abgesagt']);
        $this->assertSame('Gisela', $participant['vorname']);

        $this->request('DELETE');
        $this->assertSame(204, $this->capture(static fn() => handleEventParticipantResource('eisbeinessen', $id))->statusCode);
        $this->assertSame(0, $this->countRows('eisbeinessen_teilnehmer'));
    }

    public function testEventsTeilenSichDieTabellenNicht(): void
    {
        $this->insertParticipant('Witt', 'Gisela');
        $this->request('GET');

        $this->assertCount(0, $this->capture(static fn() => handleEventParticipantCollection('eisbeinessen'))->payload['participants']);
    }
}
