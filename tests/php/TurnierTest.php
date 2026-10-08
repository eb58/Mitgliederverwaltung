<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class TurnierTest extends TestCase
{
    private function anlegen(int $anzahl, string $modus = 'ko'): array
    {
        return neuesTurnier(['titel' => 'Testturnier', 'modus' => $modus, 'teilnehmer' => array_map(
            static fn(int $id): array => ['name' => 'Teilnehmer ' . $id, 'mitgliedId' => $id], range(1, $anzahl)
        )]);
    }

    public function testJedesPaarSpieltGenauEinmalFuerAlleTeilnehmerzahlen(): void
    {
        for ($n = 5; $n <= 32; $n++) {
            $t = $this->anlegen($n, 'jeder-gegen-jeden');
            $paare = [];
            foreach ($t['runden'] as $runde) {
                $eingesetzt = [];
                foreach ($runde as $spiel) {
                    self::assertNotContains($spiel['a'], $eingesetzt);
                    self::assertNotContains($spiel['b'], $eingesetzt);
                    $eingesetzt[] = $spiel['a']; $eingesetzt[] = $spiel['b'];
                    $paar = [$spiel['a'], $spiel['b']]; sort($paar);
                    $key = implode('-', $paar);
                    self::assertArrayNotHasKey($key, $paare);
                    $paare[$key] = true;
                }
            }
            self::assertCount((int) ($n * ($n - 1) / 2), $paare);
        }
    }

    public function testKoErmitteltMitNMinusEinsSpielenEinenSiegerFuerAlleTeilnehmerzahlen(): void
    {
        for ($n = 5; $n <= 32; $n++) {
            $t = $this->anlegen($n);
            $eingesetzt = [];
            foreach ($t['runden'][0] as $spiel) {
                $eingesetzt[] = $spiel['a'];
                if ($spiel['b'] !== null) $eingesetzt[] = $spiel['b'];
            }
            sort($eingesetzt); self::assertSame(range(1, $n), $eingesetzt);
            $gespielt = 0;
            foreach (array_keys($t['runden']) as $r) {
                foreach (array_keys($t['runden'][$r]) as $s) {
                    $spiel = $t['runden'][$r][$s];
                    if ($spiel['status'] === 'freilos') continue;
                    self::assertSame('offen', $spiel['status']);
                    $t = turnierErgebnis($t, $spiel['id'], ['punkteA' => 1, 'punkteB' => 0]);
                    $gespielt++;
                }
            }
            self::assertSame($n - 1, $gespielt);
            self::assertNotNull($t['runden'][count($t['runden']) - 1][0]['sieger']);
        }
    }

    public function testKorrekturSetztNurBetroffeneFolgespieleZurueck(): void
    {
        $t = $this->anlegen(8);
        foreach (array_keys($t['runden']) as $r) {
            foreach ($t['runden'][$r] as $spiel) $t = turnierErgebnis($t, $spiel['id'], ['punkteA' => 3, 'punkteB' => 0]);
        }
        $gleich = turnierErgebnis($t, 'r1-s1', ['punkteA' => 4, 'punkteB' => 0]);
        self::assertSame('fertig', $gleich['runden'][2][0]['status']);
        $t = turnierErgebnis($gleich, 'r1-s1', ['punkteA' => 0, 'punkteB' => 1]);
        self::assertSame('offen', $t['runden'][1][0]['status']);
        self::assertNull($t['runden'][1][0]['punkteA']);
        self::assertSame('fertig', $t['runden'][1][1]['status']);
        self::assertSame('wartet', $t['runden'][2][0]['status']);
        self::assertNull($t['runden'][2][0]['punkteA']);
    }

    public function testZuruecksetzenEntferntFolgeergebnisse(): void
    {
        $t = $this->anlegen(5);
        $t = turnierErgebnis($t, 'r1-s4', ['punkteA' => 2, 'punkteB' => 0]);
        $t = turnierErgebnis($t, 'r2-s2', ['punkteA' => 1, 'punkteB' => 0]);
        $t = turnierErgebnis($t, 'r1-s4', ['punkteA' => null, 'punkteB' => null]);
        self::assertSame('wartet', $t['runden'][1][1]['status']);
        self::assertNull($t['runden'][1][1]['punkteA']);
    }

    public function testRemisIstImLigamodusErlaubt(): void
    {
        $t = $this->anlegen(5, 'jeder-gegen-jeden');
        $t = turnierErgebnis($t, $t['runden'][0][0]['id'], ['punkteA' => 0, 'punkteB' => 0]);
        self::assertSame('fertig', $t['runden'][0][0]['status']);
        self::assertNull($t['runden'][0][0]['sieger']);
    }

    public function testKoLehntRemisAb(): void
    {
        $this->expectException(ApiError::class);
        turnierErgebnis($this->anlegen(8), 'r1-s1', ['punkteA' => 1, 'punkteB' => 1]);
    }

    public function testWartendesSpielKannNichtGespieltWerden(): void
    {
        $this->expectException(ApiError::class);
        turnierErgebnis($this->anlegen(8), 'r2-s1', ['punkteA' => 1, 'punkteB' => 0]);
    }

    public function testFreilosKannNichtGespieltWerden(): void
    {
        $this->expectException(ApiError::class);
        turnierErgebnis($this->anlegen(5), 'r1-s1', ['punkteA' => 1, 'punkteB' => 0]);
    }

    public function testDoppelteMitgliederWerdenAbgelehnt(): void
    {
        $this->expectException(ApiError::class);
        neuesTurnier(['titel' => 'Test', 'modus' => 'ko', 'teilnehmer' => array_fill(0, 5, ['name' => 'Anna', 'mitgliedId' => 1])]);
    }

    public function testTeilnehmergrenzeWirdGeprueft(): void
    {
        $this->expectException(ApiError::class);
        $this->anlegen(33);
    }

    public function testNegativeErgebnisseWerdenAbgelehnt(): void
    {
        $this->expectException(ApiError::class);
        turnierErgebnis($this->anlegen(8), 'r1-s1', ['punkteA' => -1, 'punkteB' => 0]);
    }
    public function testDoppelHatZweiSpielerUndSiebenOderAchtRunden(): void
    {
        foreach ([7 => 21, 8 => 28] as $n => $spiele) {
            $paare = [];
            for ($i = 0; $i < $n; $i++) $paare[] = ['spieler' => [['name' => 'A' . $i, 'mitgliedId' => $i * 2 + 1], ['name' => 'B' . $i, 'mitgliedId' => $i * 2 + 2]]];
            $t = neuesTurnier(['titel' => 'Doppel', 'modus' => 'jeder-gegen-jeden', 'sport' => 'tischtennis-doppel', 'teilnehmer' => $paare]);
            self::assertCount(7, $t['runden']);
            self::assertSame($spiele, array_sum(array_map('count', $t['runden'])));
            self::assertCount(2, $t['teilnehmer'][0]['spieler']);
            $id = $t['runden'][0][0]['id'];
            $t = turnierErgebnis($t, $id, ['saetze' => [['a' => 11, 'b' => 8], ['a' => 9, 'b' => 11], ['a' => 12, 'b' => 10], ['a' => 11, 'b' => 0]]]);
            self::assertSame(3, $t['runden'][0][0]['punkteA']);
            self::assertSame(1, $t['runden'][0][0]['punkteB']);
            self::assertSame('fertig', $t['runden'][0][0]['status']);
            $t = turnierErgebnis($t, $id, ['saetze' => []]);
            self::assertSame('offen', $t['runden'][0][0]['status']);
            self::assertNull($t['runden'][0][0]['punkteA']);
        }
    }

    public function testUngueltigeSaetzeWerdenAbgelehnt(): void
    {
        foreach ([
            [['a' => 11, 'b' => 10], ['a' => 11, 'b' => 0], ['a' => 11, 'b' => 0]],
            [['a' => 13, 'b' => 9], ['a' => 11, 'b' => 0], ['a' => 11, 'b' => 0]],
            [['a' => 10, 'b' => 8], ['a' => 11, 'b' => 0], ['a' => 11, 'b' => 0]],
            [['a' => 11, 'b' => 0], ['a' => 0, 'b' => 11], ['a' => 11, 'b' => 0]],
            [['a' => 11, 'b' => 0], ['a' => 11, 'b' => 0], ['a' => 11, 'b' => 0], ['a' => 11, 'b' => 0]],
        ] as $saetze) {
            try { validiereTischtennisSaetze($saetze); self::fail('Ungültiges Ergebnis akzeptiert.'); }
            catch (ApiError $e) { self::assertSame(400, $e->statusCode); }
        }
        self::assertSame([3, 2], validiereTischtennisSaetze([['a' => 0, 'b' => 11], ['a' => 11, 'b' => 0], ['a' => 14, 'b' => 12], ['a' => 12, 'b' => 14], ['a' => 11, 'b' => 1]]));
    }

    public function testEinSpielerDarfNichtZweiPaarenAngehoeren(): void
    {
        $paare = [];
        for ($i = 0; $i < 5; $i++) $paare[] = ['spieler' => [['name' => 'A' . $i, 'mitgliedId' => $i + 1], ['name' => 'B' . $i, 'mitgliedId' => $i + 6]]];
        $paare[1]['spieler'][1]['mitgliedId'] = 1;
        $this->expectException(ApiError::class);
        neuesTurnier(['titel' => 'Doppel', 'modus' => 'ko', 'sport' => 'tischtennis-doppel', 'teilnehmer' => $paare]);
    }

    public function testTischanzahlIstOptionalUndBegrenzt(): void
    {
        self::assertNull(turnierTischanzahl(null));
        self::assertSame(3, turnierTischanzahl(3));
        $this->expectException(ApiError::class);
        turnierTischanzahl(0);
    }
    public function testDoppelKoKorrekturLoeschtFolgesaetze(): void
    {
        $paare = [];
        for ($i = 0; $i < 8; $i++) $paare[] = ['spieler' => [['name' => 'A' . $i], ['name' => 'B' . $i]]];
        $t = neuesTurnier(['titel' => 'Doppel-Ko', 'modus' => 'ko', 'sport' => 'tischtennis-doppel', 'teilnehmer' => $paare]);
        $saetze = [['a' => 11, 'b' => 0], ['a' => 11, 'b' => 0], ['a' => 11, 'b' => 0]];
        foreach (array_keys($t['runden']) as $r) foreach ($t['runden'][$r] as $spiel) $t = turnierErgebnis($t, $spiel['id'], ['saetze' => $saetze]);
        self::assertSame('fertig', $t['runden'][2][0]['status']);
        $t = turnierErgebnis($t, 'r1-s1', ['saetze' => [['a' => 0, 'b' => 11], ['a' => 0, 'b' => 11], ['a' => 0, 'b' => 11]]]);
        self::assertSame([], $t['runden'][1][0]['saetze']);
        self::assertSame([], $t['runden'][2][0]['saetze']);
        self::assertSame($saetze, $t['runden'][1][1]['saetze']);
    }
}
