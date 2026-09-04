import { describe, it } from "node:test";
import { expect } from "./assertions.js";

import { eventConfigs } from "../../src/event-config.js";
import { createEventDomain, findEventMemberMatches } from "../../src/event-domain.js";

const warnemuende = createEventDomain(eventConfigs.warnemuende);
const eisbeinessen = createEventDomain(eventConfigs.eisbeinessen);
const { numberParticipants, sortByAnmeldung, summarizeMeals, toParticipantPayload } = warnemuende;

describe("Events", () => {
  it("kennt Warnemuende mit drei Essensauswahlen und 49 Plaetzen", () => {
    expect(warnemuende.mealOptions).toEqual(["Zander", "Rind", "Vegie"]);
    expect(warnemuende.maxSeats).toBe(49);
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

  it("markiert alles ab Platz 50 als Nachruecker", () => {
    const numbered = numberParticipants(Array.from({ length: 51 }, (unused, index) => ({ id: index + 1 })));

    expect(numbered.filter(participant => participant.nachruecker).map(participant => participant.nr)).toEqual([50, 51]);
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
    const participants = Array.from({ length: 50 }, (unused, index) => ({ id: index + 1 }));

    expect(numberParticipants(participants)[49].nachruecker).toBe(true);

    participants[0].abgesagt = true;

    expect(numberParticipants(participants)[49].nachruecker).toBe(false);
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
