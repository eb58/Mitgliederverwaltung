import { formatMemberName, isActiveMember } from './member-domain.js';
import { turnierFortschritt, turnierTabelle } from './turnier-domain.js';

const el = (tag, text, klasse = '') => {
  const n = document.createElement(tag); if (text !== undefined) n.textContent = text; n.className = klasse; return n;
};
const modusName = modus => modus === 'ko' ? 'K.-o.-Modus' : 'Jeder gegen jeden';
export const createTurnierAdmin = ({ request, getMembers }) => {
  let turniere = [], ausgewaehlt = null, generation = 0, busy = false;
  const pane = document.getElementById('turniere-pane');
  const auswahl = document.getElementById('turnierAuswahl');
  const details = document.getElementById('turnierDetails');
  const form = document.getElementById('turnierForm');
  const errorBox = document.getElementById('turnierError');
  const paare = document.getElementById('turnierPaare');
  const meldung = text => { errorBox.textContent = text; errorBox.hidden = !text; };
  const setBusy = value => {
    busy = value; pane.setAttribute('aria-busy', String(value));
    pane.querySelectorAll('button, input, select').forEach(n => { n.disabled = value; });
    paare.querySelectorAll('.turnier-person').forEach(p => { p.querySelector('input').disabled = value || Boolean(p.querySelector('select').value); });
  };
  const zaehlen = () => { document.getElementById('turnierAnzahl').textContent = `${paare.children.length} Doppelpaare · erlaubt: 5 bis 32`; };
  const members = () => getMembers().filter(isActiveMember).sort((a, b) => formatMemberName(a).localeCompare(formatMemberName(b), 'de'));
  const person = (nummer, position) => {
    const box = el('div', undefined, 'turnier-person');
    const select = el('select', undefined, 'form-select');
    select.setAttribute('aria-label', `Paar ${nummer}, Spieler ${position}: Mitglied`);
    const frei = el('option', 'Freien Namen eingeben'); frei.value = ''; select.append(frei);
    for (const m of members()) { const o = el('option', `${formatMemberName(m)} (Nr. ${m.id})`); o.value = m.id; select.append(o); }
    const input = el('input', undefined, 'form-control'); input.placeholder = `Name Spieler ${position}`;
    input.required = true; input.maxLength = 100; input.setAttribute('aria-label', `Paar ${nummer}, Spieler ${position}: Name`);
    select.addEventListener('change', () => { input.disabled = Boolean(select.value); input.required = !select.value; });
    box.append(select, input); return box;
  };
  const addPaar = () => {
    if (paare.children.length >= 32) return;
    const nummer = paare.children.length + 1;
    const box = el('fieldset', undefined, 'turnier-paar'); box.append(el('legend', `Paar ${nummer}`, 'h6'), person(nummer, 1), person(nummer, 2));
    paare.append(box); zaehlen();
  };
  const renderMitglieder = () => {
    // Auswahl erhalten, wenn Mitgliedsdaten neu geladen werden.
    const vorhandene = [...paare.querySelectorAll('.turnier-person')].map(p => ({ id: p.querySelector('select').value, name: p.querySelector('input').value }));
    const anzahl = paare.children.length || 8; paare.replaceChildren();
    for (let i = 0; i < anzahl; i++) addPaar();
    [...paare.querySelectorAll('.turnier-person')].forEach((p, i) => {
      if (!vorhandene[i]) return;
      p.querySelector('select').value = vorhandene[i].id; p.querySelector('input').value = vorhandene[i].name;
      p.querySelector('input').disabled = Boolean(p.querySelector('select').value);
      p.querySelector('input').required = !p.querySelector('select').value;
    });
  };
  const renderTabelle = t => {
    const wrap = el('div', undefined, 'table-responsive'), table = el('table', undefined, 'table table-sm align-middle');
    const tt = t.sport === 'tischtennis-doppel';
    table.append(el('caption', tt ? 'Rangfolge: Siege, Satzdifferenz, direkter Vergleich. Gleiche Werte teilen einen Rang. Der direkte Vergleich wird erst gewertet, wenn alle Begegnungen der gleichstehenden Paare abgeschlossen sind.' : 'Wertung: Sieg 3 Punkte, Unentschieden 1 Punkt. Rangfolge: Punkte, Differenz, erzielte Spielpunkte.'));
    const head = el('thead'), tr = el('tr');
    for (const text of ['Rang', tt ? 'Doppelpaar' : 'Teilnehmer', 'Spiele', 'Siege', 'Niederlagen', tt ? 'Sätze' : 'Spielpunkte', 'Differenz', ...(tt ? [] : ['Punkte'])]) { const th = el('th', text); th.scope = 'col'; tr.append(th); }
    head.append(tr); table.append(head); const body = el('tbody');
    for (const z of turnierTabelle(t)) { const row = el('tr'); for (const text of [z.rang, z.name, z.spiele, z.siege, z.niederlagen, `${z.fuer}:${z.gegen}`, z.fuer - z.gegen, ...(tt ? [] : [z.punkte])]) row.append(el('td', text)); body.append(row); }
    table.append(body); wrap.append(table); return wrap;
  };
  const mutation = async (t, path, body) => {
    if (busy) return;
    const aktuell = generation; setBusy(true); meldung('');
    try {
      const result = await request(`/api/turniere/${t.id}/${path}`, { method: 'PUT', body: { version: t.version, ...body } });
      if (aktuell !== generation) return;
      turniere = turniere.map(x => x.id === t.id ? result.turnier : x); render();
    } catch (e) { if (aktuell === generation) meldung(e.message); }
    finally { if (aktuell === generation) setBusy(false); }
  };
  const speichern = (t, spiel, body) => {
    if (t.modus === 'ko' && spiel.status === 'fertig' && !window.confirm('Ergebnis ändern? Bei geändertem Sieger werden betroffene Folgespiele zurückgesetzt.')) return;
    void mutation(t, `ergebnisse/${spiel.id}`, body);
  };
  const renderDetails = () => {
    details.replaceChildren(); const t = turniere.find(x => x.id === ausgewaehlt);
    if (!t) { details.append(el('p', 'Noch kein Turnier angelegt. Stelle die Doppelpaare zusammen und lege ein Turnier an.', 'text-muted')); return; }
    const tt = t.sport === 'tischtennis-doppel'; const { fertig, gesamt } = turnierFortschritt(t);
    details.append(el('h2', t.titel, 'h4'), el('p', `${modusName(t.modus)} · ${t.teilnehmer.length} ${tt ? 'Doppelpaare · 3 Gewinnsätze' : 'Teilnehmer'} · ${fertig} von ${gesamt} Spielen abgeschlossen`, 'text-muted'));
    const tischForm = el('form', undefined, 'turnier-toolbar'); const label = el('label', 'Verfügbare Tische (optional)');
    const tischInput = el('input', undefined, 'form-control'); tischInput.type = 'number'; tischInput.min = '1'; tischInput.max = '32'; tischInput.step = '1'; tischInput.value = t.anzahlTische ?? ''; tischInput.placeholder = 'Noch offen'; tischInput.setAttribute('aria-label', 'Verfügbare Tische');
    const tischSave = el('button', 'Tischanzahl speichern', 'btn btn-outline-primary'); tischSave.type = 'submit'; label.append(tischInput); tischForm.append(label, tischSave);
    tischForm.addEventListener('submit', e => { e.preventDefault(); void mutation(t, 'tische', { anzahlTische: tischInput.value ? Number(tischInput.value) : null }); }); details.append(tischForm);
    const names = new Map(t.teilnehmer.map(x => [x.id, x.name]));
    if (t.modus === 'jeder-gegen-jeden') { details.append(el('h3', 'Tabelle', 'h5'), renderTabelle(t)); if (fertig === gesamt) details.append(el('p', 'Turnier abgeschlossen.', 'alert alert-success')); }
    else { const finale = t.runden.at(-1)[0]; if (finale.sieger !== null) details.append(el('p', `Turniersieger: ${names.get(finale.sieger)}`, 'alert alert-success')); }
    const runden = el('div', undefined, t.modus === 'ko' ? 'turnier-runden turnier-runden--ko' : 'turnier-runden');
    for (const [r, runde] of t.runden.entries()) {
      const section = el('section', undefined, 'turnier-runde'); const rest = t.runden.length - r;
      const titel = t.modus === 'ko' ? (rest === 1 ? 'Finale' : rest === 2 ? 'Halbfinale' : rest === 3 ? 'Viertelfinale' : `Runde ${r + 1}`) : `Runde ${r + 1}`;
      section.append(el('h3', titel, 'h6'));
      if (t.modus === 'jeder-gegen-jeden') { const dabei = new Set(runde.flatMap(s => [s.a, s.b])); const pause = t.teilnehmer.filter(x => !dabei.has(x.id)); if (pause.length) section.append(el('p', `Pause: ${pause.map(x => x.name).join(', ')}`, 'small text-muted')); }
      let termin = 0;
      for (const spiel of runde) {
        const card = el('div', undefined, 'turnier-spiel'); card.append(el('p', `${names.get(spiel.a) ?? 'Sieger der Vorrunde'} – ${names.get(spiel.b) ?? (spiel.status === 'freilos' ? 'Freilos' : 'Sieger der Vorrunde')}`, 'turnier-paarung'));
        if (spiel.status !== 'freilos') { card.append(el('p', t.anzahlTische ? `Durchgang ${Math.floor(termin / t.anzahlTische) + 1} · Tisch ${termin % t.anzahlTische + 1}` : 'Tisch noch offen', 'small text-muted')); termin++; }
        if (['freilos', 'wartet'].includes(spiel.status)) card.append(el('p', spiel.status === 'freilos' ? 'Automatisch weiter' : 'Vorherige Spiele sind noch offen', 'small text-muted'));
        else {
          const ef = el('form', undefined, 'turnier-ergebnis'); ef.dataset.spielId = spiel.id;
          if (tt) {
            for (let i = 0; i < 5; i++) {
              const zeile = el('div', undefined, 'turnier-satz'); zeile.append(el('span', `Satz ${i + 1}`));
              for (const key of ['a', 'b']) { const input = el('input', undefined, 'form-control form-control-sm'); input.type = 'number'; input.min = '0'; input.max = '999'; input.step = '1'; input.name = `satz${i}${key}`; input.value = spiel.saetze?.[i]?.[key] ?? ''; input.setAttribute('aria-label', `${titel}, ${spiel.id}, Satz ${i + 1}, ${names.get(spiel[key])}`); zeile.append(input); }
              ef.append(zeile);
            }
          } else for (const key of ['punkteA', 'punkteB']) { const input = el('input', undefined, 'form-control form-control-sm'); input.type = 'number'; input.min = '0'; input.max = '99999'; input.required = true; input.name = key; input.value = spiel[key] ?? ''; input.setAttribute('aria-label', key); ef.append(input); }
          const save = el('button', 'Speichern', 'btn btn-sm btn-primary'); save.type = 'submit'; ef.append(save);
          ef.addEventListener('submit', e => {
            e.preventDefault();
            if (!tt) { speichern(t, spiel, { punkteA: Number(ef.elements.punkteA.value), punkteB: Number(ef.elements.punkteB.value) }); return; }
            const saetze = []; let leer = false;
            for (let i = 0; i < 5; i++) { const a = ef.elements[`satz${i}a`].value, b = ef.elements[`satz${i}b`].value;
              if (a === '' && b === '') { leer = true; continue; }
              if (leer || a === '' || b === '') { meldung('Bitte beide Satzpunkte ohne Lücken eingeben. Nicht benötigte Sätze bleiben leer.'); return; }
              saetze.push({ a: Number(a), b: Number(b) });
            }
            if (!saetze.length) { meldung('Bitte das Satzergebnis eingeben.'); return; }
            speichern(t, spiel, { saetze });
          });
          if (spiel.status === 'fertig') { card.append(el('p', `${tt ? `Sätze ${spiel.punkteA}:${spiel.punkteB} · ` : ''}Sieger: ${names.get(spiel.sieger) ?? 'Unentschieden'}`, 'small text-success')); const reset = el('button', 'Zurücksetzen', 'btn btn-sm btn-outline-secondary'); reset.type = 'button'; reset.addEventListener('click', () => speichern(t, spiel, tt ? { saetze: [] } : { punkteA: null, punkteB: null })); ef.append(reset); }
          card.append(ef);
        }
        section.append(card);
      }
      runden.append(section);
    }
    details.append(runden);
  };
  const render = () => {
    auswahl.replaceChildren(); for (const t of turniere) { const o = el('option', `${t.titel} · ${modusName(t.modus)}`); o.value = t.id; auswahl.append(o); }
    if (!turniere.some(t => t.id === ausgewaehlt)) ausgewaehlt = turniere[0]?.id ?? null; auswahl.value = ausgewaehlt ?? ''; renderDetails();
  };
  const load = async () => {
    if (busy) return; const aktuell = ++generation; setBusy(true); meldung('');
    try { const result = await request('/api/turniere'); if (aktuell === generation) { turniere = result.turniere; render(); } }
    catch (e) { if (aktuell === generation) meldung(e.message); } finally { if (aktuell === generation) setBusy(false); }
  };
  const init = () => {
    // Temporärer Testzustand für den lokalen Docker-Build; vor dem Merge wieder auf DEV begrenzen.
    {
      const beispiel = el('button', 'Beispielturnier anlegen (Testhilfe)', 'btn btn-outline-secondary');
      beispiel.type = 'button';
      beispiel.id = 'turnierBeispielBtn';
      beispiel.addEventListener('click', () => {
        if (busy) return;
        const namen = ['Lena Kiesel', 'Jonas Wolkenbach', 'Mira Sonnenfels', 'Felix Birkenau',
          'Nora Wiesenberg', 'Emil Fichtenhain', 'Clara Morgenwald', 'Theo Lindenfels',
          'Alina Bachwiese', 'Paul Sternfeld', 'Jule Regenhain', 'Leon Sommerfels',
          'Maja Winterbach', 'Finn Rosenwald', 'Ella Abendhain', 'Ben Lichtwiese'];
        form.elements.titel.value = 'Beispielturnier – Tischtennis-Doppel';
        form.elements.modus.value = 'jeder-gegen-jeden';
        paare.replaceChildren();
        for (let i = 0; i < 8; i++) addPaar();
        paare.querySelectorAll('.turnier-person input').forEach((input, i) => { input.value = namen[i]; });
        document.getElementById('turnierAnlegen').open = true;
        meldung('');
        form.elements.titel.focus();
      });
      document.getElementById('turnierPaarHinzufuegen').parentElement.append(beispiel,
        el('span', 'Temporäre Testhilfe: 16 erfundene Gastnamen, keine Vereinsmitgliedschaft nötig. Erst „Turnier anlegen“ speichert das Beispiel.', 'small text-muted'));
    }
    document.getElementById('turnierNeuLaden').addEventListener('click', () => { void load(); });
    document.getElementById('turnierPaarHinzufuegen').addEventListener('click', addPaar);
    document.getElementById('turnierPaarEntfernen').addEventListener('click', () => { if (paare.children.length > 5) { paare.lastElementChild.remove(); zaehlen(); } });
    auswahl.addEventListener('change', () => { ausgewaehlt = Number(auswahl.value); renderDetails(); });
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (busy) return;
      const ids = new Set(), freie = new Set(); const teilnehmer = [];
      for (const paar of paare.children) {
        const spieler = [];
        for (const box of paar.querySelectorAll('.turnier-person')) {
          const id = box.querySelector('select').value; const m = getMembers().find(m => m.id === Number(id)); const name = id && m ? formatMemberName(m) : box.querySelector('input').value.trim();
          if (!name) { meldung('Bitte für jeden Spieler ein Mitglied oder einen Namen angeben.'); return; }
          const key = name.toLocaleLowerCase('de');
          if (id ? ids.has(id) : freie.has(key)) { meldung('Ein Spieler darf nur in einem Doppel teilnehmen. Bei gleichnamigen Gästen bitte einen unterscheidbaren Namen eingeben.'); return; }
          if (id) ids.add(id); else freie.add(key); spieler.push({ name, mitgliedId: id ? Number(id) : null });
        }
        teilnehmer.push({ spieler });
      }
      const aktuell = generation; setBusy(true); meldung('');
      try {
        const result = await request('/api/turniere', { method: 'POST', body: { titel: form.elements.titel.value.trim(), modus: form.elements.modus.value, sport: 'tischtennis-doppel', teilnehmer, anzahlTische: null } });
        if (aktuell !== generation) return; turniere.unshift(result.turnier); ausgewaehlt = result.turnier.id; render();
        form.reset(); paare.replaceChildren(); renderMitglieder(); document.getElementById('turnierAnlegen').open = false;
      } catch (error) { if (aktuell === generation) meldung(error.message); } finally { if (aktuell === generation) setBusy(false); }
    });
  };
  const reset = () => { generation++; turniere = []; ausgewaehlt = null; form.reset(); paare.replaceChildren(); render(); meldung(''); setBusy(false); };
  return { init, load, renderMitglieder, reset };
};
