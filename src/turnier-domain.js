// Die Spielpläne und das Weiterkommen berechnet ausschließlich die PHP-API.
export const turnierTabelle = turnier => {
  const zeilen = new Map(turnier.teilnehmer.map(t => [t.id, { ...t, spiele: 0, siege: 0, unentschieden: 0, niederlagen: 0, fuer: 0, gegen: 0, punkte: 0 }]));
  for (const spiel of turnier.runden.flat()) {
    if (spiel.status !== "fertig") continue;
    const a = zeilen.get(spiel.a);
    const b = zeilen.get(spiel.b);
    a.spiele++; b.spiele++;
    a.fuer += spiel.punkteA; a.gegen += spiel.punkteB;
    b.fuer += spiel.punkteB; b.gegen += spiel.punkteA;
    if (spiel.punkteA === spiel.punkteB) {
      a.unentschieden++; b.unentschieden++; a.punkte++; b.punkte++;
    } else {
      const sieger = spiel.punkteA > spiel.punkteB ? a : b;
      const verlierer = sieger === a ? b : a;
      sieger.siege++; sieger.punkte += 3; verlierer.niederlagen++;
    }
  }
  const tt = turnier.sport === 'tischtennis-doppel';
  const gruppen = new Map();
  if (tt) {
    for (const z of zeilen.values()) {
      const key = `${z.siege}:${z.fuer - z.gegen}`;
      if (!gruppen.has(key)) gruppen.set(key, []);
      gruppen.get(key).push(z);
    }
    for (const gruppe of gruppen.values()) {
      const ids = new Set(gruppe.map(z => z.id));
      const direkte = turnier.runden.flat().filter(s => s.status === 'fertig' && ids.has(s.a) && ids.has(s.b));
      const komplett = direkte.length === gruppe.length * (gruppe.length - 1) / 2;
      for (const z of gruppe) z.direkt = komplett ? direkte.filter(s => s.sieger === z.id).length : 0;
    }
  }
  const wertung = (a, b) => tt
    ? b.siege - a.siege || (b.fuer - b.gegen) - (a.fuer - a.gegen) || b.direkt - a.direkt
    : b.punkte - a.punkte || (b.fuer - b.gegen) - (a.fuer - a.gegen) || b.fuer - a.fuer;
  const sortiert = [...zeilen.values()].sort((a, b) => wertung(a, b) || a.name.localeCompare(b.name, 'de') || a.id - b.id);
  let letzterRang = 0;
  return sortiert.map((zeile, i) => {
    const vorher = sortiert[i - 1];
    const gleich = vorher && wertung(zeile, vorher) === 0;
    if (!gleich) letzterRang = i + 1;
    return { ...zeile, rang: letzterRang };
  });
};

export const turnierFortschritt = turnier => {
  const spiele = turnier.runden.flat().filter(spiel => spiel.status !== "freilos");
  return { fertig: spiele.filter(spiel => spiel.status === "fertig").length, gesamt: spiele.length };
};
