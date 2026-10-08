<?php
declare(strict_types=1);

const TURNIER_TABLE_DDL = 'CREATE TABLE IF NOT EXISTS turnier (
  id INT NOT NULL AUTO_INCREMENT,
  daten LONGTEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

function turnierText(mixed $value, int $max): string
{
    if (!is_string($value) || trim($value) === '' || strlen(trim($value)) > $max) {
        throw new ApiError('Bitte einen gültigen Namen eingeben (maximal ' . $max . ' Bytes).', 400);
    }
    return trim($value);
}

function neuesTurnier(array $payload): array
{
    $titel = turnierText($payload['titel'] ?? null, 200);
    $modus = $payload['modus'] ?? '';
    if (!in_array($modus, ['jeder-gegen-jeden', 'ko'], true)) throw new ApiError('Unbekannter Turniermodus.', 400);
    $eingaben = $payload['teilnehmer'] ?? null;
    if (!is_array($eingaben) || count($eingaben) < 5 || count($eingaben) > 32 || array_keys($eingaben) !== range(0, count($eingaben) - 1)) {
        throw new ApiError('Ein Turnier benötigt 5 bis 32 Teilnehmer.', 400);
    }
    $doppel = ($payload['sport'] ?? '') === 'tischtennis-doppel';
    $teilnehmer = [];
    $mitgliedIds = [];
    $gastNamen = [];
    foreach ($eingaben as $i => $eingabe) {
        if (!is_array($eingabe)) throw new ApiError('Ungültiger Teilnehmer.', 400);
        $spielerEingaben = $doppel ? ($eingabe['spieler'] ?? null) : [$eingabe];
        if (!is_array($spielerEingaben) || count($spielerEingaben) !== ($doppel ? 2 : 1) || array_keys($spielerEingaben) !== range(0, count($spielerEingaben) - 1)) {
            throw new ApiError('Jedes Doppel benötigt genau zwei Spieler.', 400);
        }
        $spieler = [];
        foreach ($spielerEingaben as $person) {
            if (!is_array($person)) throw new ApiError('Ungültiger Spieler.', 400);
            $mitgliedId = $person['mitgliedId'] ?? null;
            if ($mitgliedId !== null) {
                if (!is_int($mitgliedId) || $mitgliedId < 1) throw new ApiError('Ungültige Mitgliedsnummer.', 400);
                if (in_array($mitgliedId, $mitgliedIds, true)) throw new ApiError('Ein Mitglied darf nur in einem Doppel teilnehmen.', 400);
                $mitgliedIds[] = $mitgliedId;
            }
            $name = turnierText($person['name'] ?? null, 240);
            if ($doppel && $mitgliedId === null) {
                $key = function_exists('mb_strtolower') ? mb_strtolower($name, 'UTF-8') : strtolower($name);
                if (in_array($key, $gastNamen, true)) throw new ApiError('Ein Gastname darf nur einmal vorkommen. Gleichnamige Personen bitte unterscheidbar benennen.', 400);
                $gastNamen[] = $key;
            }
            $spieler[] = ['name' => $name, 'mitgliedId' => $mitgliedId];
        }
        $teilnehmer[] = $doppel
            ? ['id' => $i + 1, 'name' => implode(' / ', array_column($spieler, 'name')), 'spieler' => $spieler, 'mitgliedId' => null]
            : ['id' => $i + 1, 'name' => $spieler[0]['name'], 'mitgliedId' => $spieler[0]['mitgliedId']];
    }
    $tische = turnierTischanzahl($payload['anzahlTische'] ?? null);
    $turnier = ['titel' => $titel, 'modus' => $modus, 'teilnehmer' => $teilnehmer, 'runden' => [], 'sport' => $doppel ? 'tischtennis-doppel' : '', 'anzahlTische' => $tische];
    $ids = array_column($teilnehmer, 'id');
    if ($modus === 'jeder-gegen-jeden') {
        // Kreisverfahren: pro Runde spielt jeder höchstens einmal.
        if (count($ids) % 2) $ids[] = null;
        $anzahl = count($ids);
        for ($r = 0; $r < $anzahl - 1; $r++) {
            $runde = [];
            for ($s = 0; $s < $anzahl / 2; $s++) {
                $a = $ids[$s];
                $b = $ids[$anzahl - 1 - $s];
                if ($a !== null && $b !== null) $runde[] = turnierSpiel($r, count($runde), $a, $b);
            }
            $turnier['runden'][] = $runde;
            $letzter = array_pop($ids);
            array_splice($ids, 1, 0, [$letzter]);
        }
    } else {
        $groesse = 1;
        while ($groesse < count($ids)) $groesse *= 2;
        $freilose = $groesse - count($ids);
        $index = 0;
        for ($r = 0, $spiele = $groesse / 2; $spiele >= 1; $r++, $spiele /= 2) {
            $runde = [];
            for ($s = 0; $s < $spiele; $s++) {
                $a = $r === 0 ? $ids[$index++] : null;
                $b = $r === 0 && $s >= $freilose ? $ids[$index++] : null;
                $runde[] = turnierSpiel($r, $s, $a, $b);
            }
            $turnier['runden'][] = $runde;
        }
    }
    return berechneTurnier($turnier);
}

function turnierSpiel(int $runde, int $spiel, ?int $a, ?int $b): array
{
    return ['id' => 'r' . ($runde + 1) . '-s' . ($spiel + 1), 'a' => $a, 'b' => $b,
        'saetze' => [], 'punkteA' => null, 'punkteB' => null, 'sieger' => null, 'status' => 'offen'];
}

function berechneTurnier(array $turnier): array
{
    foreach ($turnier['runden'] as $r => $runde) {
        foreach ($runde as $s => $spiel) {
            $bereit = true;
            if ($turnier['modus'] === 'ko' && $r > 0) {
                $links = $turnier['runden'][$r - 1][$s * 2];
                $rechts = $turnier['runden'][$r - 1][$s * 2 + 1];
                $a = $links['sieger'];
                $b = $rechts['sieger'];
                if ($spiel['a'] !== $a || $spiel['b'] !== $b) {
                    $spiel['punkteA'] = $spiel['punkteB'] = null;
                    $spiel['saetze'] = [];
                }
                $spiel['a'] = $a;
                $spiel['b'] = $b;
                $bereit = $a !== null && $b !== null;
            }
            $spiel['sieger'] = null;
            $spiel['status'] = $bereit ? 'offen' : 'wartet';
            if ($turnier['modus'] === 'ko' && $r === 0 && $spiel['b'] === null) {
                $spiel['sieger'] = $spiel['a'];
                $spiel['status'] = 'freilos';
            } elseif ($bereit && $spiel['punkteA'] !== null && $spiel['punkteB'] !== null) {
                $spiel['status'] = 'fertig';
                $spiel['sieger'] = $spiel['punkteA'] === $spiel['punkteB'] ? null
                    : ($spiel['punkteA'] > $spiel['punkteB'] ? $spiel['a'] : $spiel['b']);
            }
            $turnier['runden'][$r][$s] = $spiel;
        }
    }
    return $turnier;
}

function turnierErgebnis(array $turnier, string $spielId, array $payload): array
{
    $saetze = null;
    if (($turnier['sport'] ?? '') === 'tischtennis-doppel') {
        $saetze = $payload['saetze'] ?? null;
        if (!is_array($saetze) || array_keys($saetze) !== ($saetze ? range(0, count($saetze) - 1) : [])) throw new ApiError('Bitte Sätze eingeben.', 400);
        [$a, $b] = validiereTischtennisSaetze($saetze);
        $payload['punkteA'] = $saetze ? $a : null;
        $payload['punkteB'] = $saetze ? $b : null;
    }
    $a = $payload['punkteA'] ?? null;
    $b = $payload['punkteB'] ?? null;
    $zuruecksetzen = array_key_exists('punkteA', $payload) && array_key_exists('punkteB', $payload) && $a === null && $b === null;
    if (!$zuruecksetzen && (!is_int($a) || !is_int($b) || $a < 0 || $b < 0 || $a > 99999 || $b > 99999)) {
        throw new ApiError('Ergebnisse müssen ganze Zahlen zwischen 0 und 99999 sein.', 400);
    }
    if (!$zuruecksetzen && $turnier['modus'] === 'ko' && $a === $b) throw new ApiError('Im K.-o.-Modus muss es einen Sieger geben.', 400);
    foreach ($turnier['runden'] as $r => $runde) {
        foreach ($runde as $s => $spiel) {
            if ($spiel['id'] !== $spielId) continue;
            if ($spiel['status'] === 'wartet' || $spiel['status'] === 'freilos') {
                throw new ApiError('Dieses Spiel kann noch nicht gespielt werden oder ist ein Freilos.', 400);
            }
            if ($saetze !== null) $turnier['runden'][$r][$s]['saetze'] = $saetze;
            $turnier['runden'][$r][$s]['punkteA'] = $a;
            $turnier['runden'][$r][$s]['punkteB'] = $b;
            return berechneTurnier($turnier);
        }
    }
    throw new ApiError('Spiel nicht gefunden.', 404);
}

function ensureTurnierTable(): void
{
    if (tableExists('turnier')) return;
    try {
        db()->exec(TURNIER_TABLE_DDL);
    } catch (PDOException $error) {
        error_log((string) $error);
        throw new ApiError('Die Turniertabelle fehlt. Bitte server/db/turnier.mysql.sql einspielen.', 503);
    }
    clearSchemaCache();
}

function turnierRowToApi(array $row): array
{
    return array_merge(json_decode($row['daten'], true, 512, JSON_THROW_ON_ERROR), ['id' => (int) $row['id'], 'version' => (int) $row['version']]);
}

function handleTurniere(): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    assertMethodAllowed($method, ['GET', 'POST']);
    ensureTurnierTable();
    if ($method === 'GET') {
        jsonResponse(['turniere' => array_map('turnierRowToApi', db()->query('SELECT id, daten, version FROM turnier ORDER BY id DESC')->fetchAll())]);
    }
    $turnier = neuesTurnier(readJsonBody());
    // Mitgliedsnamen stammen aus der Datenbank; der Turnierstand bewahrt sie als Momentaufnahme.
    foreach ($turnier['teilnehmer'] as &$teilnehmer) {
        if (($turnier['sport'] ?? '') === 'tischtennis-doppel') {
            foreach ($teilnehmer['spieler'] as &$spieler) $spieler = turnierMitgliedsname($spieler);
            unset($spieler);
            $teilnehmer['name'] = implode(' / ', array_column($teilnehmer['spieler'], 'name'));
        } else {
            $teilnehmer = array_merge($teilnehmer, turnierMitgliedsname($teilnehmer));
        }
    }
    unset($teilnehmer);
    db()->prepare('INSERT INTO turnier (daten) VALUES (?)')->execute([json_encode($turnier, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)]);
    jsonResponse(['turnier' => array_merge($turnier, ['id' => (int) db()->lastInsertId(), 'version' => 1])], 201);
}

function handleTurnierErgebnis(int $id, string $spielId): void
{
    assertMethodAllowed($_SERVER['REQUEST_METHOD'], ['PUT']);
    ensureTurnierTable();
    $payload = readJsonBody();
    if (!isset($payload['version']) || !is_int($payload['version']) || $payload['version'] < 1) throw new ApiError('Turnierversion fehlt.', 400);
    $stmt = db()->prepare('SELECT id, daten, version FROM turnier WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) throw new ApiError('Turnier nicht gefunden.', 404);
    if ((int) $row['version'] !== $payload['version']) throw new ApiError('Das Turnier wurde inzwischen geändert. Bitte neu laden.', 409);
    $turnier = turnierErgebnis(json_decode($row['daten'], true, 512, JSON_THROW_ON_ERROR), $spielId, $payload);
    $stmt = db()->prepare('UPDATE turnier SET daten = ?, version = version + 1 WHERE id = ? AND version = ?');
    $stmt->execute([json_encode($turnier, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), $id, $payload['version']]);
    if ($stmt->rowCount() !== 1) throw new ApiError('Das Turnier wurde inzwischen geändert. Bitte neu laden.', 409);
    jsonResponse(['turnier' => array_merge($turnier, ['id' => $id, 'version' => $payload['version'] + 1])]);
}


function turnierMitgliedsname(array $person): array
{
    if ($person['mitgliedId'] === null) return $person;
    $stmt = db()->prepare('SELECT name, vorname FROM mitglied WHERE id = ?');
    $stmt->execute([$person['mitgliedId']]);
    $mitglied = $stmt->fetch();
    if (!$mitglied) throw new ApiError('Mitglied nicht gefunden.', 400);
    $person['name'] = trim($mitglied['vorname'] . ' ' . $mitglied['name']);
    return $person;
}

function validiereTischtennisSaetze(array $saetze): array
{
    if (!$saetze) return [0, 0];
    if (count($saetze) < 3 || count($saetze) > 5) throw new ApiError('Eine Begegnung benötigt 3 bis 5 Sätze und endet bei 3 Gewinnsätzen.', 400);
    $a = $b = 0;
    foreach ($saetze as $satz) {
        if (!is_array($satz)) throw new ApiError('Ungültiger Satz.', 400);
        if ($a === 3 || $b === 3) throw new ApiError('Nach dem dritten Gewinnsatz darf kein weiterer Satz folgen.', 400);
        $x = $satz['a'] ?? null; $y = $satz['b'] ?? null;
        if (!is_int($x) || !is_int($y) || $x < 0 || $y < 0 || $x > 999 || $y > 999) throw new ApiError('Satzpunkte müssen ganze Zahlen von 0 bis 999 sein.', 400);
        $max = max($x, $y); $min = min($x, $y);
        if ($max < 11 || ($max === 11 ? $min > 9 : $max - $min !== 2)) throw new ApiError('Ein Satz endet bei 11 Punkten, danach mit genau 2 Punkten Vorsprung.', 400);
        if ($x > $y) $a++; else $b++;
    }
    if ($a !== 3 && $b !== 3) throw new ApiError('Die Begegnung endet erst bei 3 Gewinnsätzen.', 400);
    return [$a, $b];
}

function turnierTischanzahl(mixed $anzahl): ?int
{
    if ($anzahl === null) return null;
    if (!is_int($anzahl) || $anzahl < 1 || $anzahl > 32) throw new ApiError('Bitte 1 bis 32 Tische angeben oder die Anzahl offen lassen.', 400);
    return $anzahl;
}

function handleTurnierTische(int $id): void
{
    assertMethodAllowed($_SERVER['REQUEST_METHOD'], ['PUT']);
    ensureTurnierTable();
    $payload = readJsonBody();
    $anzahl = turnierTischanzahl($payload['anzahlTische'] ?? null);
    $stmt = db()->prepare('SELECT id, daten, version FROM turnier WHERE id = ?');
    $stmt->execute([$id]); $row = $stmt->fetch();
    if (!$row) throw new ApiError('Turnier nicht gefunden.', 404);
    if (!is_int($payload['version'] ?? null) || (int) $row['version'] !== $payload['version']) throw new ApiError('Das Turnier wurde inzwischen geändert. Bitte neu laden.', 409);
    $turnier = json_decode($row['daten'], true, 512, JSON_THROW_ON_ERROR);
    $turnier['anzahlTische'] = $anzahl;
    $stmt = db()->prepare('UPDATE turnier SET daten = ?, version = version + 1 WHERE id = ? AND version = ?');
    $stmt->execute([json_encode($turnier, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), $id, $payload['version']]);
    if ($stmt->rowCount() !== 1) throw new ApiError('Das Turnier wurde inzwischen geändert. Bitte neu laden.', 409);
    jsonResponse(['turnier' => array_merge($turnier, ['id' => $id, 'version' => $payload['version'] + 1])]);
}
