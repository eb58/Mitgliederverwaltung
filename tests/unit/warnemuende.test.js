import { describe, it } from "node:test";
import { expect } from "./assertions.js";

import { MAX_SEATS, mealOptions, numberParticipants, summarizeMeals, toParticipantPayload } from "../../src/warnemuende-domain.js";

describe("warnemuende", () => {
  it("bietet genau die drei Essensauswahlen der Teilnehmerliste", () => {
    expect(mealOptions).toEqual(["Zander", "Rind", "Vegie"]);
  });

  it("kennt die 49 Plaetze", () => {
    expect(MAX_SEATS).toBe(49);
  });

  it("nummeriert in Anmeldereihenfolge statt nach Namen", () => {
    const numbered = numberParticipants([
      { id: 30, name: "Abel" },
      { id: 7, name: "Zander" }
    ]);

    expect(numbered.map(participant => [participant.nr, participant.name])).toEqual([[1, "Zander"], [2, "Abel"]]);
  });

  it("markiert alles ab Platz 50 als Nachruecker", () => {
    const numbered = numberParticipants(Array.from({ length: 51 }, (unused, index) => ({ id: index + 1 })));

    expect(numbered.filter(participant => participant.nachruecker).map(participant => participant.nr)).toEqual([50, 51]);
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

  it("trimmt Namen und Bemerkung und macht aus einer leeren DB-ID null", () => {
    expect(toParticipantPayload({ name: "  Brandl ", vorname: " Erich", essensauswahl: "Rind", bemerkung: " kommt spaeter ", mitgliedId: "" }))
      .toEqual({ name: "Brandl", vorname: "Erich", essensauswahl: "Rind", bezahlt: false, bemerkung: "kommt spaeter", mitgliedId: null });
  });

  it("wandelt die DB-ID in eine Zahl und faellt auf Zander zurueck", () => {
    expect(toParticipantPayload({ name: "Barz", vorname: "Monika", bezahlt: true, mitgliedId: "7" }))
      .toEqual({ name: "Barz", vorname: "Monika", essensauswahl: "Zander", bezahlt: true, bemerkung: "", mitgliedId: 7 });
  });

  it("verwirft eine DB-ID kleiner eins", () => {
    expect(toParticipantPayload({ name: "Witt", vorname: "Gisela", mitgliedId: 0 }).mitgliedId).toBe(null);
  });
});
