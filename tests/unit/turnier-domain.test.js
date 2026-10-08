import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnierTabelle, turnierFortschritt } from '../../src/turnier-domain.js';

const teilnehmer = [1, 2, 3, 4, 5].map(id => ({ id, name: `Teilnehmer ${id}` }));
const spiel = (a, b, punkteA, punkteB) => ({ a, b, punkteA, punkteB, status: 'fertig' });

test('Tabelle wertet Siege, Remis, Niederlagen und Spielpunkte aus', () => {
  const t = { teilnehmer, runden: [[spiel(1, 2, 4, 1), spiel(1, 3, 2, 2)], [spiel(2, 3, 3, 0), { a: 4, b: 5, status: 'offen' }]] };
  const tab = turnierTabelle(t);
  assert.deepEqual(tab.map(z => z.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(tab.map(z => z.punkte), [4, 3, 1, 0, 0]);
  assert.deepEqual(tab.map(z => z.rang), [1, 2, 3, 4, 4]);
  assert.equal(tab[0].spiele, 2); assert.equal(tab[0].fuer, 6); assert.equal(tab[0].gegen, 3);
  assert.equal(tab[0].siege, 1); assert.equal(tab[0].unentschieden, 1);
  assert.equal(tab[1].niederlagen, 1);
});

test('Gleichstände teilen auch bei mehr als zwei Teilnehmern einen Rang', () => {
  const tab = turnierTabelle({ teilnehmer, runden: [] });
  assert.deepEqual(tab.map(z => z.rang), [1, 1, 1, 1, 1]);
});

test('Rangfolge verwendet Differenz, dann erzielte Spielpunkte', () => {
  const tab = turnierTabelle({ teilnehmer, runden: [[spiel(1, 4, 5, 3), spiel(2, 5, 3, 0), spiel(3, 4, 6, 4)]] });
  assert.deepEqual(tab.slice(0, 3).map(z => z.id), [2, 3, 1]);
});

test('Fortschritt zählt Freilose nicht als gespielte Begegnungen', () => {
  assert.deepEqual(turnierFortschritt({ runden: [[{ status: 'freilos' }, { status: 'fertig' }], [{ status: 'wartet' }]] }), { fertig: 1, gesamt: 2 });
});


test('Tischtennis sortiert nach Siegen statt 3-Punkte-Wertung und nutzt direkten Vergleich', () => {
  const t = { sport: 'tischtennis-doppel', teilnehmer: teilnehmer.slice(0, 3), runden: [[
    { ...spiel(1, 2, 3, 1), sieger: 1 },
    { ...spiel(2, 3, 3, 0), sieger: 2 },
    { ...spiel(3, 1, 3, 2), sieger: 3 }
  ]] };
  const tab = turnierTabelle(t);
  // 1 und 2 haben je einen Sieg und +1 Satzdifferenz; 1 gewinnt den direkten Vergleich.
  assert.deepEqual(tab.map(z => z.id), [1, 2, 3]);
  assert.deepEqual(tab.map(z => z.rang), [1, 2, 3]);
});
