<?php
declare(strict_types=1);

final class ApiTurnierTest extends DatabaseTestCase
{
    private function payload(): array
    {
        $paare = [];
        for ($i = 0; $i < 7; $i++) $paare[] = ['spieler' => [['name' => 'A' . $i], ['name' => 'B' . $i]]];
        return ['titel' => 'Herbstturnier', 'modus' => 'jeder-gegen-jeden', 'sport' => 'tischtennis-doppel', 'teilnehmer' => $paare];
    }
    private function anlegen(?array $payload = null): array
    {
        $this->request('POST', $payload ?? $this->payload());
        $response = $this->capture(fn() => handleTurniere());
        self::assertSame(201, $response->statusCode);
        return $response->payload['turnier'];
    }
    public function testDoppelSpeichertSaetzeUndTische(): void
    {
        $t = $this->anlegen(); $spiel = $t['runden'][0][0]['id'];
        $saetze = [['a' => 11, 'b' => 8], ['a' => 12, 'b' => 10], ['a' => 11, 'b' => 0]];
        $this->request('PUT', ['version' => 1, 'saetze' => $saetze]);
        $response = $this->capture(fn() => handleTurnierErgebnis($t['id'], $spiel));
        self::assertSame(2, $response->payload['turnier']['version']);
        self::assertSame(3, $response->payload['turnier']['runden'][0][0]['punkteA']);
        $this->request('PUT', ['version' => 2, 'anzahlTische' => 2]);
        $this->capture(fn() => handleTurnierTische($t['id']));
        $this->request('GET');
        $geladen = $this->capture(fn() => handleTurniere())->payload['turniere'][0];
        self::assertSame($saetze, $geladen['runden'][0][0]['saetze']);
        self::assertSame(2, $geladen['anzahlTische']);
        self::assertSame(3, $geladen['version']);
    }
    public function testVeralteteVersionUeberschreibtNichts(): void
    {
        $t = $this->anlegen();
        $this->request('PUT', ['version' => 1, 'anzahlTische' => 2]);
        $this->capture(fn() => handleTurnierTische($t['id']));
        $this->request('PUT', ['version' => 1, 'anzahlTische' => 3]);
        $this->assertApiError(409, 'inzwischen', fn() => handleTurnierTische($t['id']));
        $this->request('PUT', ['version' => 1, 'saetze' => [['a' => 11, 'b' => 0], ['a' => 11, 'b' => 0], ['a' => 11, 'b' => 0]]]);
        $this->assertApiError(409, 'inzwischen', fn() => handleTurnierErgebnis($t['id'], $t['runden'][0][0]['id']));
        $this->request('GET');
        $geladen = $this->capture(fn() => handleTurniere())->payload['turniere'][0];
        self::assertSame(2, $geladen['anzahlTische']);
        self::assertSame('offen', $geladen['runden'][0][0]['status']);
    }
    public function testMitgliedsnamenWerdenAlsMomentaufnahmeUebernommen(): void
    {
        TestDatabase::insertMemberRow(100, 'Müller', 'Anna');
        $payload = $this->payload(); $payload['teilnehmer'][0]['spieler'][0] = ['name' => 'Falscher Name', 'mitgliedId' => 100];
        $t = $this->anlegen($payload);
        self::assertSame('Anna Müller / B0', $t['teilnehmer'][0]['name']);
        self::assertSame(100, $t['teilnehmer'][0]['spieler'][0]['mitgliedId']);
        db()->exec("UPDATE mitglied SET name = 'Neu' WHERE id = 100");
        $this->request('GET');
        self::assertSame('Anna Müller / B0', $this->capture(fn() => handleTurniere())->payload['turniere'][0]['teilnehmer'][0]['name']);
    }
    public function testUnbekanntesMitgliedLegtKeinTurnierAn(): void
    {
        $payload = $this->payload(); $payload['teilnehmer'][0]['spieler'][0]['mitgliedId'] = 99999;
        $this->request('POST', $payload);
        $this->assertApiError(400, 'Mitglied nicht gefunden', fn() => handleTurniere());
        self::assertSame(0, $this->countRows('turnier'));
    }
    public function testFehlendeTabelleWirdAutomatischAngelegt(): void
    {
        db()->exec('DROP TABLE turnier'); clearSchemaCache();
        $this->anlegen(); self::assertSame(1, $this->countRows('turnier'));
    }
    public function testUngueltigesErgebnisBleibtUngespeichert(): void
    {
        $t = $this->anlegen();
        $this->request('PUT', ['version' => 1, 'saetze' => [['a' => 11, 'b' => 10], ['a' => 11, 'b' => 0], ['a' => 11, 'b' => 0]]]);
        $this->assertApiError(400, 'Satz', fn() => handleTurnierErgebnis($t['id'], $t['runden'][0][0]['id']));
        $this->request('GET');
        self::assertSame(1, $this->capture(fn() => handleTurniere())->payload['turniere'][0]['version']);
    }
}
