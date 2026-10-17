import { describe, it } from "node:test";
import { expect } from "./assertions.js";

import {
  activeEvents,
  archivedEvents,
  createEventDomain,
  describeEvent,
  describeMemberMatch,
  eventDomId,
  findEventMemberMatches,
  formatMealOptions,
  isUnambiguousMatch,
  parseMealOptions,
  sortEvents,
  summarizePayments,
  toEventPayload
} from "../../src/event-domain.js";

// So liefert sie die API (/api/events) nach der Uebernahme der alten Listen.
const eventConfigs = {
  warnemuende: { id: 1, key: "warnemuende", label: "Warnemünde", mealOptions: ["Zander", "Rind", "Vegie"], maxSeats: 50, preis: null },
  eisbeinessen: { id: 2, key: "eisbeinessen", label: "Eisbeinessen", mealOptions: [], maxSeats: 30, preis: null }
};
const warnemuende = createEventDomain(eventConfigs.warnemuende);
const eisbeinessen = createEventDomain(eventConfigs.eisbeinessen);
const { numberParticipants, sortByAnmeldung, summarizeMeals, toParticipantPayload } = warnemuende;

describe("Events", () => {
  it("kennt Warnemuende mit drei Essensauswahlen und 50 Plaetzen", () => {
    expect(warnemuende.mealOptions).toEqual(["Zander", "Rind", "Vegie"]);
    expect(warnemuende.maxSeats).toBe(50);
  });

  it("kennt das Eisbeinessen ohne Essensauswahl mit 30 Plaetzen", () => {
    expect(eisbeinessen.mealOptions).toEqual([]);
    expect(eisbeinessen.maxSeats).toBe(30);
  });
});

describe("Teilnehmernummerierung", () => {
  it("nummeriert von oben nach unten in der uebergebenen Reihenfolge", () => {
    const numbered = numberParticipants([
      { id: 30, name: "Abel" },
      { id: 7, name: "Zander" }
    ]);

    expect(numbered.map(participant => [participant.nr, participant.name])).toEqual([[1, "Abel"], [2, "Zander"]]);
  });

  it("sortiert die Anmeldereihenfolge nach id", () => {
    expect(sortByAnmeldung([{ id: 30 }, { id: 7 }]).map(participant => participant.id)).toEqual([7, 30]);
  });

  it("markiert alles ab Platz 51 als Nachruecker", () => {
    const numbered = numberParticipants(Array.from({ length: 52 }, (unused, index) => ({ id: index + 1 })));

    expect(numbered.filter(participant => participant.nachruecker).map(participant => participant.nr)).toEqual([51, 52]);
  });

  it("nutzt je Event die eigene Platzzahl", () => {
    const numbered = eisbeinessen.numberParticipants(Array.from({ length: 31 }, (unused, index) => ({ id: index + 1 })));

    expect(numbered.filter(participant => participant.nachruecker).map(participant => participant.nr)).toEqual([31]);
  });

  it("laesst Abgesagte an ihrem Platz, aber ohne Nummer", () => {
    const numbered = numberParticipants([
      { id: 1, name: "Erste" },
      { id: 2, name: "Abgesagte", abgesagt: true },
      { id: 3, name: "Dritte" }
    ]);

    expect(numbered.map(participant => participant.nr)).toEqual([1, null, 2]);
    expect(numbered.map(participant => participant.name)).toEqual(["Erste", "Abgesagte", "Dritte"]);
  });

  it("laesst durch eine Absage den ersten Nachruecker aufruecken", () => {
    const participants = Array.from({ length: 51 }, (unused, index) => ({ id: index + 1 }));

    expect(numberParticipants(participants)[50].nachruecker).toBe(true);

    participants[0].abgesagt = true;

    expect(numberParticipants(participants)[50].nachruecker).toBe(false);
  });
});

describe("Essensportionen", () => {
  it("zaehlt Abgesagte nicht in die Essensportionen", () => {
    const participants = [
      { id: 1, essensauswahl: "Zander" },
      { id: 2, essensauswahl: "Zander", abgesagt: true }
    ];

    expect(summarizeMeals(participants)).toBe("Zander: 1 · Rind: 0 · Vegie: 0");
  });

  it("zaehlt die Essensauswahl je Gericht", () => {
    const participants = [
      { essensauswahl: "Zander" },
      { essensauswahl: "Zander" },
      { essensauswahl: "Rind" }
    ];

    expect(summarizeMeals(participants)).toBe("Zander: 2 · Rind: 1 · Vegie: 0");
  });

  it("zaehlt bei leerer Liste ueberall null", () => {
    expect(summarizeMeals([])).toBe("Zander: 0 · Rind: 0 · Vegie: 0");
  });

  it("bleibt ohne Essensauswahl leer", () => {
    expect(eisbeinessen.summarizeMeals([{ id: 1 }])).toBe("");
  });
});

describe("Teilnehmer-Payload", () => {
  it("trimmt Namen und Bemerkung und macht aus einer leeren DB-ID null", () => {
    expect(toParticipantPayload({ name: "  Brandl ", vorname: " Erich", essensauswahl: "Rind", bemerkung: " kommt spaeter ", mitgliedId: "" }))
      .toEqual({ name: "Brandl", vorname: "Erich", essensauswahl: "Rind", bezahlt: false, abgesagt: false, bemerkung: "kommt spaeter", mitgliedId: null });
  });

  it("wandelt die DB-ID in eine Zahl und faellt auf Zander zurueck", () => {
    expect(toParticipantPayload({ name: "Barz", vorname: "Monika", bezahlt: true, mitgliedId: "7" }))
      .toEqual({ name: "Barz", vorname: "Monika", essensauswahl: "Zander", bezahlt: true, abgesagt: false, bemerkung: "", mitgliedId: 7 });
  });

  it("verwirft eine DB-ID kleiner eins", () => {
    expect(toParticipantPayload({ name: "Witt", vorname: "Gisela", mitgliedId: 0 }).mitgliedId).toBe(null);
  });

  it("schickt ohne Essensauswahl auch kein Essensfeld mit", () => {
    expect(eisbeinessen.toParticipantPayload({ name: " Witt ", vorname: "Gisela", essensauswahl: "Zander" }))
      .toEqual({ name: "Witt", vorname: "Gisela", bezahlt: false, abgesagt: false, bemerkung: "", mitgliedId: null });
  });
});

describe("Mitgliederabgleich fuer neue Teilnehmer", () => {
  const members = [
    { id: 1, name: "Müller", vorname: "Anna", clubzugehoerigkeit: 9 },
    { id: 2, name: "Mueller", vorname: "Anne", clubzugehoerigkeit: 8 },
    { id: 3, name: "Brandl", vorname: "Erich", clubzugehoerigkeit: 9 }
  ];

  it("erkennt einen eindeutigen Namen auch in der ae-Schreibweise exakt", () => {
    const result = findEventMemberMatches(members, { name: "MUELLER", vorname: "anna" });

    expect(result.kind).toBe("exact");
    expect(result.candidates.map(member => member.id)).toEqual([1]);
  });

  it("liefert mehrere aehnliche Mitglieder und Gaeste nach Trefferqualitaet", () => {
    const result = findEventMemberMatches(members, { name: "Muler", vorname: "Ana" });

    expect(result.kind).toBe("fuzzy");
    expect(result.candidates.map(member => member.id)).toEqual([1, 2]);
  });

  it("sucht bei fehlendem Vornamen allein nach dem Nachnamen", () => {
    const result = findEventMemberMatches(members, { name: "Müller", vorname: "" });

    expect(result.kind).toBe("fuzzy");
    expect(result.candidates.map(member => member.id)).toEqual([1, 2]);
  });

  it("meldet bei einem unpassenden Namen keinen Treffer", () => {
    expect(findEventMemberMatches(members, { name: "Schmidt", vorname: "Peter" }))
      .toEqual({ kind: "none", candidates: [] });
  });
});

describe("describeMemberMatch", () => {
  it("fragt im Singular, wenn nur eine Person zur Auswahl steht", () => {
    expect(describeMemberMatch({ kind: "fuzzy", count: 1, enteredName: "ewald" }))
      .toBe("Kein exakter Treffer für „ewald“. Ist diese Person gemeint?");
  });

  it("fragt im Plural bei mehreren unscharfen Treffern", () => {
    expect(describeMemberMatch({ kind: "fuzzy", count: 3, enteredName: "ewald" }))
      .toBe("Kein exakter Treffer für „ewald“. Ist eine dieser Personen gemeint?");
  });

  it("weist bei exakten Namensgleichen auf die Mehrdeutigkeit hin", () => {
    expect(describeMemberMatch({ kind: "exact", count: 2, enteredName: "Erika Doppelt" }))
      .toBe("Mehrere Personen passen zu „Erika Doppelt“. Welche ist gemeint?");
  });
});

describe("isUnambiguousMatch", () => {
  const mitglieder = [
    { id: 443, vorname: "Frauke", name: "Ewald" },
    { id: 7, vorname: "Monika", name: "Barz" },
    { id: 8, vorname: "Peter", name: "Barz" }
  ];
  const pruefe = eingabe => {
    const treffer = findEventMemberMatches(mitglieder, eingabe);
    return { treffer, eindeutig: isUnambiguousMatch(treffer, eingabe) };
  };

  it("uebernimmt einen einzelnen Namensvetter ohne Rueckfrage", () => {
    const { treffer, eindeutig } = pruefe({ vorname: "", name: "Ewald" });
    expect(treffer.candidates.length).toBe(1);
    expect(eindeutig).toBe(true);
  });

  it("fragt nach, wenn sich mehrere denselben Nachnamen teilen", () => {
    const { treffer, eindeutig } = pruefe({ vorname: "", name: "Barz" });
    expect(treffer.candidates.length).toBe(2);
    expect(eindeutig).toBe(false);
  });

  it("fragt bei einem Tippfehler im Nachnamen nach", () => {
    const { treffer, eindeutig } = pruefe({ vorname: "Frauke", name: "Ewaldd" });
    expect(treffer.kind).toBe("fuzzy");
    expect(treffer.candidates.length).toBe(1);
    expect(eindeutig).toBe(false);
  });

  it("uebernimmt einen vollstaendig passenden Namen ohne Rueckfrage", () => {
    const { eindeutig } = pruefe({ vorname: "Frauke", name: "Ewald" });
    expect(eindeutig).toBe(true);
  });
});

describe("Event-Einstellungen", () => {
  it("rechnet ohne Platzgrenze mit unbegrenzt vielen Plaetzen", () => {
    const offen = createEventDomain({ mealOptions: [], maxSeats: null });
    expect(offen.maxSeats).toBe(Infinity);
    expect(offen.numberParticipants([{ id: 1 }, { id: 2 }]).some(participant => participant.nachruecker)).toBe(false);
  });

  it("zaehlt bezahlte Teilnehmer und mit Preis auch den Betrag", () => {
    const participants = [
      { id: 1, bezahlt: true },
      { id: 2, bezahlt: true, abgesagt: true },
      { id: 3, bezahlt: false }
    ];
    expect(summarizePayments(participants)).toBe("bezahlt: 1");
    expect(summarizePayments(participants, 12.5).replace(/\s/g, " ")).toBe("bezahlt: 1 (12,50 €)");
    expect(createEventDomain({ mealOptions: [], preis: 20 }).summarizePayments([{ bezahlt: true }, { bezahlt: true }]).replace(/\s/g, " ")).toBe("bezahlt: 2 (40,00 €)");
  });

  it("liest die Essensauswahl mit Komma, Semikolon oder je Zeile", () => {
    expect(parseMealOptions(" Zander, Rind;Vegie\n\nSuppe ,")).toEqual(["Zander", "Rind", "Vegie", "Suppe"]);
    expect(parseMealOptions("")).toEqual([]);
    expect(parseMealOptions(undefined)).toEqual([]);
    expect(formatMealOptions(["Zander", "Rind"])).toBe("Zander, Rind");
    expect(formatMealOptions(undefined)).toBe("");
  });

  it("baut DOM-Ids mit Praefix, damit sie nicht mit festen Ids kollidieren", () => {
    expect(eventDomId("member", "form")).toBe("event-member-form");
  });

  it("trennt aktive und archivierte Events", () => {
    const events = [{ id: 1, archiviert: false }, { id: 2, archiviert: true }];
    expect(activeEvents(events).map(event => event.id)).toEqual([1]);
    expect(archivedEvents(events).map(event => event.id)).toEqual([2]);
  });

  it("sortiert nach Datum, Events ohne Datum zuletzt, dann nach Bezeichnung", () => {
    const events = [
      { id: 1, label: "Warnemünde", datum: null },
      { id: 2, label: "Herbstfahrt", datum: "2027-09-01" },
      { id: 3, label: "Eisbeinessen", datum: null },
      { id: 4, label: "Frühlingsfest", datum: "2027-04-01" }
    ];
    expect(sortEvents(events).map(event => event.id)).toEqual([4, 2, 3, 1]);
    expect(events[0].id).toBe(1);
  });

  it("beschreibt Datum, Preis und Hinweis in einer Zeile", () => {
    expect(describeEvent({ datum: "2027-07-03", preis: 12.5, pdfHinweis: " Geschirr mitbringen " }).replace(/\s/g, " "))
      .toBe("03.07.2027 · 12,50 € pro Person · Geschirr mitbringen");
    expect(describeEvent({ datum: null, preis: null, pdfHinweis: "Selbstbeteiligung liegt bei 20 Euro." })).toBe("Selbstbeteiligung liegt bei 20 Euro.");
    expect(describeEvent({})).toBe("");
  });

  it("macht aus den Formularwerten die Daten fuer die API", () => {
    expect(toEventPayload({
      label: " Sommerfest ",
      datum: "2027-07-03",
      symbol: "feier",
      maxSeats: "80",
      mealOptions: "Grillwurst, Salat",
      preis: "12,50",
      pdfHinweis: " Bitte Geschirr mitbringen ",
      archiviert: false
    })).toEqual({
      label: "Sommerfest",
      datum: "2027-07-03",
      symbol: "feier",
      maxSeats: 80,
      mealOptions: ["Grillwurst", "Salat"],
      preis: 12.5,
      pdfHinweis: "Bitte Geschirr mitbringen",
      archiviert: false
    });
    expect(toEventPayload({ label: "Kegeln", datum: "", maxSeats: " ", preis: "", archiviert: "on" })).toEqual({
      label: "Kegeln",
      datum: null,
      symbol: "kalender",
      maxSeats: null,
      mealOptions: [],
      preis: null,
      pdfHinweis: "",
      archiviert: true
    });
  });
});
