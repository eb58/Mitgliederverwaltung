<?php
declare(strict_types=1);

final class ApiReferenceDataTest extends DatabaseTestCase
{
    private const ADMIN = ['id' => 1, 'username' => 'admin', 'role' => 'admin'];
    private const USER = ['id' => 2, 'username' => 'anna', 'role' => 'user'];

    public function testOverviewReturnsAllFourListsForEveryLoggedInUser(): void
    {
        $this->request('GET');

        $payload = $this->capture(static fn() => handleReferenceDataOverview(self::USER))->payload;

        $this->assertSame(['interestGroups', 'functions', 'exitReasons', 'seniorClubs'], array_keys($payload));
        $this->assertNotEmpty($payload['interestGroups']);
        $this->assertArrayHasKey('label', $payload['interestGroups'][0]);
        $this->assertArrayHasKey('name', $payload['seniorClubs'][0]);
    }

    public function testOverviewHidesDeactivatedEntries(): void
    {
        db()->exec('UPDATE interessengruppe SET active = 0 WHERE id = 4');
        $this->request('GET');

        $labels = array_column($this->capture(static fn() => handleReferenceDataOverview(self::USER))->payload['interestGroups'], 'id');

        $this->assertNotContains(4, $labels);
    }

    public function testCollectionShowsDeactivatedEntriesToAdmin(): void
    {
        db()->exec('UPDATE interessengruppe SET active = 0 WHERE id = 4');
        $this->request('GET');

        $items = $this->capture(static fn() => handleReferenceDataCollection(self::ADMIN, 'interest-groups'))->payload['items'];

        $this->assertContains(4, array_column($items, 'id'));
        $this->assertFalse(array_column($items, 'active', 'id')[4]);
    }

    public function testCollectionAndResourceRequireAdmin(): void
    {
        $this->request('GET');
        $this->assertApiError(403, 'Administratorrechte', static fn() => handleReferenceDataCollection(self::USER, 'interest-groups'));

        $this->request('PUT', ['label' => 'Neu']);
        $this->assertApiError(403, 'Administratorrechte', static fn() => handleReferenceDataResource(self::USER, 'interest-groups', 4));
    }

    public function testUnknownReferenceTypeIsRejected(): void
    {
        $this->request('GET');
        $this->assertApiError(404, 'Unbekannte Stammdatenart', static fn() => handleReferenceDataCollection(self::ADMIN, 'gibt-es-nicht'));
    }

    public function testCollectionCreatesNewEntry(): void
    {
        $this->request('POST', ['id' => 777, 'label' => 'Bogenschießen']);

        $response = $this->capture(static fn() => handleReferenceDataCollection(self::ADMIN, 'interest-groups'));

        $this->assertSame(201, $response->statusCode);
        $this->assertSame(['id' => 777, 'label' => 'Bogenschießen', 'active' => true], $response->payload['item']);
        $this->assertSame(1, $this->countRows('interessengruppe', 'id = 777 AND bezeichnung = ?', ['Bogenschießen']));
    }

    public function testCollectionReactivatesAndRenamesExistingEntry(): void
    {
        db()->exec('UPDATE interessengruppe SET active = 0 WHERE id = 4');
        $this->request('POST', ['id' => 4, 'label' => 'Computer neu']);

        $this->capture(static fn() => handleReferenceDataCollection(self::ADMIN, 'interest-groups'));

        $this->assertSame(1, $this->countRows('interessengruppe', 'id = 4 AND bezeichnung = ? AND active = 1', ['Computer neu']));
    }

    public function testCollectionRejectsIncompletePayload(): void
    {
        $this->request('POST', ['label' => 'Ohne ID']);
        $this->assertApiError(400, 'ID und Bezeichnung', static fn() => handleReferenceDataCollection(self::ADMIN, 'interest-groups'));
    }

    public function testResourceRenamesEntryAndKeepsActiveState(): void
    {
        $this->request('PUT', ['label' => 'Umbenannt']);

        $response = $this->capture(static fn() => handleReferenceDataResource(self::ADMIN, 'senior-clubs', 1));

        $this->assertSame(['id' => 1, 'label' => 'Umbenannt', 'active' => true], $response->payload['item']);
        $this->assertSame(1, $this->countRows('seniorenclub', 'id = 1 AND name = ?', ['Umbenannt']));
    }

    public function testResourceCanDeactivateViaUpdate(): void
    {
        $this->request('PUT', ['label' => 'Skat', 'active' => false]);

        $response = $this->capture(static fn() => handleReferenceDataResource(self::ADMIN, 'interest-groups', 4));

        $this->assertFalse($response->payload['item']['active']);
        $this->assertSame(1, $this->countRows('interessengruppe', 'id = 4 AND active = 0'));
    }

    public function testResourceRejectsEmptyLabelAndUnknownId(): void
    {
        $this->request('PUT', ['label' => '  ']);
        $this->assertApiError(400, 'Bezeichnung ist erforderlich', static fn() => handleReferenceDataResource(self::ADMIN, 'interest-groups', 4));

        $this->request('PUT', ['label' => 'Neu']);
        $this->assertApiError(404, 'Stammdatensatz nicht gefunden', static fn() => handleReferenceDataResource(self::ADMIN, 'interest-groups', 999999));
    }

    public function testResourceDeleteOnlyDeactivates(): void
    {
        $this->request('DELETE');

        $this->assertSame(204, $this->capture(static fn() => handleReferenceDataResource(self::ADMIN, 'functions', 1))->statusCode);
        $this->assertSame(1, $this->countRows('funktion', 'id = 1 AND active = 0'));

        $this->request('DELETE');
        $this->assertApiError(404, 'Stammdatensatz nicht gefunden', static fn() => handleReferenceDataResource(self::ADMIN, 'functions', 999999));
    }

    public function testUnsupportedMethodsAreRejected(): void
    {
        $this->request('DELETE');
        $this->assertApiError(405, 'Methode nicht erlaubt', static fn() => handleReferenceDataCollection(self::ADMIN, 'interest-groups'));

        $this->request('POST');
        $this->assertApiError(405, 'Methode nicht erlaubt', static fn() => handleReferenceDataResource(self::ADMIN, 'interest-groups', 4));

        $this->request('POST');
        $this->assertApiError(405, 'Methode nicht erlaubt', static fn() => handleReferenceDataOverview(self::ADMIN));
    }
}
