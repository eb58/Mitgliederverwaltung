<?php
declare(strict_types=1);

final class ApiWarnemuendeTest extends DatabaseTestCase
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

        $participants = $this->capture(static fn() => handleWarnemuendeCollection())->payload['participants'];

        $this->assertSame(['Barz', 'Zander'], array_column($participants, 'name'));
        $this->assertSame(['id', 'name', 'vorname', 'essensauswahl', 'bezahlt', 'abgesagt', 'bemerkung', 'mitgliedId'], array_keys($participants[0]));
        $this->assertFalse($participants[0]['bezahlt']);
        $this->assertNull($participants[0]['mitgliedId']);
    }

    public function testCollectionCreatesParticipantWithMemberReference(): void
    {
        TestDatabase::insertMemberRow(439, 'Brandl', 'Erich');
        $this->request('POST', ['name' => ' Brandl ', 'vorname' => ' Erich ', 'essensauswahl' => 'Zander', 'mitgliedId' => 439]);

        $response = $this->capture(static fn() => handleWarnemuendeCollection());

        $this->assertSame(201, $response->statusCode);
        $this->assertSame('Brandl', $response->payload['participant']['name']);
        $this->assertSame('Erich', $response->payload['participant']['vorname']);
        $this->assertSame(439, $response->payload['participant']['mitgliedId']);
        $this->assertSame(1, $this->countRows('warnemuende_teilnehmer'));
    }

    public function testCreateAcceptsSpellingsOfThePaperList(): void
    {
        $this->request('POST', ['name' => 'Fisch', 'vorname' => 'Doris', 'essensauswahl' => 'Zanderfilet']);
        $this->assertSame('Zander', $this->capture(static fn() => handleWarnemuendeCollection())->payload['participant']['essensauswahl']);

        $this->request('POST', ['name' => 'Dreesen', 'vorname' => 'Bärbel', 'essensauswahl' => 'Rinderbäckchen']);
        $this->assertSame('Rind', $this->capture(static fn() => handleWarnemuendeCollection())->payload['participant']['essensauswahl']);
    }

    public function testCreateRejectsEmptyNameUnknownFieldsAndUnknownMeal(): void
    {
        $this->request('POST', ['name' => '  ', 'vorname' => 'Erich']);
        $this->assertApiError(400, 'Name und Vorname', static fn() => handleWarnemuendeCollection());

        $this->request('POST', ['name' => 'Brandl', 'vorname' => 'Erich', 'tischnummer' => 3]);
        $this->assertApiError(400, 'Unbekannte Felder', static fn() => handleWarnemuendeCollection());

        $this->request('POST', ['name' => 'Brandl', 'vorname' => 'Erich', 'essensauswahl' => 'Schnitzel']);
        $this->assertApiError(400, 'Essensauswahl', static fn() => handleWarnemuendeCollection());
    }

    public function testCreateRejectsUnknownMemberId(): void
    {
        $this->request('POST', ['name' => 'Brandl', 'vorname' => 'Erich', 'mitgliedId' => 4711]);

        $this->assertApiError(400, 'Unbekannte DB-ID', static fn() => handleWarnemuendeCollection());
        $this->assertSame(0, $this->countRows('warnemuende_teilnehmer'));
    }

    public function testCreateStoresPaymentFlagAndNote(): void
    {
        $this->request('POST', ['name' => 'Witt', 'vorname' => 'Gisela', 'bezahlt' => true, 'bemerkung' => '  zahlt im Bus  ']);

        $participant = $this->capture(static fn() => handleWarnemuendeCollection())->payload['participant'];

        $this->assertTrue($participant['bezahlt']);
        $this->assertSame('zahlt im Bus', $participant['bemerkung']);
    }

    public function testResourceUpdatesParticipant(): void
    {
        $id = $this->insertParticipant('Sachwel', 'Uschi', 'Rind');
        TestDatabase::insertMemberRow(386, 'Sachweh', 'Ursula');
        $this->request('PUT', ['name' => 'Sachweh', 'vorname' => 'Ursula', 'essensauswahl' => 'Vegie', 'mitgliedId' => 386]);

        $participant = $this->capture(static fn() => handleWarnemuendeResource($id))->payload['participant'];

        $this->assertSame(
            ['id' => $id, 'name' => 'Sachweh', 'vorname' => 'Ursula', 'essensauswahl' => 'Vegie', 'bezahlt' => false, 'abgesagt' => false, 'bemerkung' => '', 'mitgliedId' => 386],
            $participant
        );
    }

    public function testPatchKeepsUnsentFields(): void
    {
        $id = $this->insertParticipant('Barz', 'Monika', 'Zander');
        $this->request('PATCH', ['bezahlt' => true]);

        $participant = $this->capture(static fn() => handleWarnemuendeResource($id))->payload['participant'];

        $this->assertTrue($participant['bezahlt']);
        $this->assertSame('Zander', $participant['essensauswahl']);
        $this->assertSame('Monika', $participant['vorname']);
    }

    public function testUpdateClearsMemberReferenceWithZero(): void
    {
        TestDatabase::insertMemberRow(80, 'Jeschon', 'Peter');
        $id = $this->insertParticipant('Jeschon', 'Peter', 'Rind', 80);
        $this->request('PUT', ['name' => 'Jeschon', 'vorname' => 'Peter', 'essensauswahl' => 'Rind', 'mitgliedId' => 0]);

        $this->assertNull($this->capture(static fn() => handleWarnemuendeResource($id))->payload['participant']['mitgliedId']);
    }

    public function testAbsageBleibtInDerListe(): void
    {
        $id = $this->insertParticipant('Witt', 'Gisela');
        $this->request('PATCH', ['abgesagt' => true]);
        $this->capture(static fn() => handleWarnemuendeResource($id));

        $this->request('GET');
        $participants = $this->capture(static fn() => handleWarnemuendeCollection())->payload['participants'];

        $this->assertCount(1, $participants);
        $this->assertTrue($participants[0]['abgesagt']);
    }

    public function testResourceDeletesParticipant(): void
    {
        $id = $this->insertParticipant('Witt', 'Gisela');
        $this->request('DELETE');

        $this->assertSame(204, $this->capture(static fn() => handleWarnemuendeResource($id))->statusCode);
        $this->assertSame(0, $this->countRows('warnemuende_teilnehmer'));
    }

    public function testMissingTableIsReportedReadably(): void
    {
        db()->exec('DROP TABLE warnemuende_teilnehmer');
        clearSchemaCache();
        $this->request('GET');

        $this->assertApiError(503, 'warnemuende_teilnehmer fehlt', static fn() => handleWarnemuendeCollection());
    }

    public function testUnknownParticipantIsRejected(): void
    {
        $this->request('GET');
        $this->assertApiError(404, 'Teilnehmer nicht gefunden', static fn() => handleWarnemuendeResource(4711));
    }

    public function testDeletedMemberKeepsParticipantWithoutReference(): void
    {
        TestDatabase::insertMemberRow(136, 'Odorinszky', 'Dorothea');
        $id = $this->insertParticipant('Odorinszky', 'Dorothea', 'Zander', 136);
        db()->exec('DELETE FROM mitglied WHERE id = 136');
        $this->request('GET');

        $this->assertNull($this->capture(static fn() => handleWarnemuendeResource($id))->payload['participant']['mitgliedId']);
    }
}
