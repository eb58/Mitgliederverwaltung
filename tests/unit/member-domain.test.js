import { before, describe, it } from "node:test";
import { expect } from "./assertions.js";

import {
  MEMBER_CLUB_ID,
  austrittsgrundMap,
  funktionsMap,
  interestGroups,
  refreshReferenceOptions,
  replaceArrayContents,
  replaceObjectContents
} from "../../src/member-config.js";
import { formatIsoDate } from "../../src/member-utils.js";
import {
  christmasFormatter,
  cloneMember,
  compareIsoDateToFilterDate,
  createEmptyMember,
  currencyFormatter,
  dateFormatter,
  formatDateTimeDE,
  formatFunctions,
  formatInterestGroups,
  formatMemberName,
  getMemberFunctionIds,
  getMemberInterestGroupText,
  getNewestMembers,
  getNextBirthday,
  getRoundBirthdays,
  getUpcomingBirthday,
  interestGroupFormatter,
  isActiveMember,
  isComputerGroupMember,
  isGuestMember,
  isOpenClubPaymentMember,
  normalizeMember
} from "../../src/member-domain.js";

// Die Referenzdaten kommen zur Laufzeit vom Server; für Unit-Tests werden sie hier gesetzt.
before(() => {
  replaceArrayContents(interestGroups, [
    { id: 1, label: "Skat" },
    { id: 2, label: "PC Grundlagen" },
    { id: 3, label: "Wandern" }
  ]);
  replaceObjectContents(austrittsgrundMap, [[1, "Umzug"], [2, "verstorben"]]);
  replaceObjectContents(funktionsMap, [[1, "Vorstand"], [2, "Kassenwart"]]);
  refreshReferenceOptions();
});

describe("normalizeMember", () => {
  it("füllt fehlende Felder mit Standardwerten", () => {
    expect(normalizeMember({})).toMatchObject({
      id: 0,
      name: "",
      vorname: "",
      geschlecht: "w",
      passbild: "",
      ort: "Berlin",
      austrittsgrund: null,
      interessengruppen: [],
      clubzugehoerigkeit: 0,
      tischnummer: 0
    });
  });

  it("lässt das Original unverändert", () => {
    const raw = { id: "7", name: " Meier " };
    expect(normalizeMember(raw).name).toBe("Meier");
    expect(raw.name).toBe(" Meier ");
  });

  it("wandelt IDs in Zahlen und ersetzt ungültige durch 0", () => {
    expect(normalizeMember({ id: "42" }).id).toBe(42);
    expect(normalizeMember({ id: -3 }).id).toBe(0);
    expect(normalizeMember({ id: "abc" }).id).toBe(0);
  });

  it("normalisiert Alt-Datumsformate", () => {
    const member = normalizeMember({ eintrittsdatum: "03.04.1999", austrittsdatum: "kein Datum" });
    expect(member.eintrittsdatum).toBe("1999-04-03");
    expect(member.austrittsdatum).toBe("");
  });

  it("hebt zu junge Geburtstage auf das Mindestalter an", () => {
    const today = new Date();
    const minBirthday = formatIsoDate(new Date(today.getFullYear() - 55, today.getMonth(), today.getDate()));
    expect(normalizeMember({ geburtstag: "01.02.1950" }).geburtstag).toBe("1950-02-01");
    expect(normalizeMember({ geburtstag: "2020-01-01" }).geburtstag).toBe(minBirthday);
  });

  it("unterscheidet leeren Austrittsgrund von der Ziffer 0", () => {
    expect(normalizeMember({ austrittsgrund: "" }).austrittsgrund).toBeNull();
    expect(normalizeMember({ austrittsgrund: null }).austrittsgrund).toBeNull();
    expect(normalizeMember({ austrittsgrund: "2" }).austrittsgrund).toBe(2);
    expect(normalizeMember({ austrittsgrund: 0 }).austrittsgrund).toBe(0);
  });

  it("verwirft nicht numerische Interessengruppen", () => {
    expect(normalizeMember({ interessengruppen: ["1", 2, "x", null] }).interessengruppen).toEqual([1, 2]);
    expect(normalizeMember({ interessengruppen: "1,2" }).interessengruppen).toEqual([]);
  });

  it("übernimmt bei Barwert -1 den gezahlten Betrag", () => {
    const member = normalizeMember({ betragClubBar: -1, gezahlterBetragClub: "30,00 €", betragComputerBar: "5,00" });
    expect(member.betragClubBar).toBe(30);
    expect(member.betragComputerBar).toBe(5);
    expect(member.gezahlterBetragClub).toBe(30);
  });

  it("normalisiert historische Wahrheitswerte", () => {
    const member = normalizeMember({ auswahl: -1, ausweisErteilt: "YES", beitragClubBezahlt: 0, wnEssenBezahlt: "nein" });
    expect(member.auswahl).toBe(true);
    expect(member.ausweisErteilt).toBe(true);
    expect(member.beitragClubBezahlt).toBe(false);
    expect(member.wnEssenBezahlt).toBe(false);
  });

  it("akzeptiert nur unterstützte Passbilder und entfernt den Pfad", () => {
    expect(normalizeMember({ passbild: "C:\\Bilder\\p.JPG" }).passbild).toBe("p.JPG");
    expect(normalizeMember({ passbild: "schad.exe" }).passbild).toBe("");
  });
});

describe("createEmptyMember und cloneMember", () => {
  it("legt ein leeres Mitglied mit Vorgabewerten an", () => {
    expect(createEmptyMember(17)).toMatchObject({
      id: 17,
      name: "",
      geschlecht: "w",
      ort: "Berlin",
      clubzugehoerigkeit: MEMBER_CLUB_ID,
      interessengruppen: [],
      ausweisErteilt: false,
      austrittsgrund: null,
      tischnummer: 0
    });
  });

  it("kopiert Mitglieder tief", () => {
    const member = { id: 1, interessengruppen: [1, 2] };
    const copy = cloneMember(member);
    copy.interessengruppen.push(3);
    expect(member.interessengruppen).toEqual([1, 2]);
    expect(cloneMember(null)).toBeNull();
    expect(cloneMember(undefined)).toBeNull();
  });
});

describe("Mitgliedsstatus", () => {
  it("gilt ohne Austrittsdatum und ohne bekannten Austrittsgrund als aktiv", () => {
    expect(isActiveMember({ austrittsdatum: "", austrittsgrund: null })).toBe(true);
    expect(isActiveMember({ austrittsdatum: "2026-01-01", austrittsgrund: null })).toBe(false);
    expect(isActiveMember({ austrittsdatum: "", austrittsgrund: 1 })).toBe(false);
    expect(isActiveMember({ austrittsdatum: "", austrittsgrund: 99 })).toBe(true);
  });

  it("erkennt Gäste an einer abweichenden Clubzugehörigkeit", () => {
    expect(isGuestMember({ clubzugehoerigkeit: MEMBER_CLUB_ID })).toBe(false);
    expect(isGuestMember({ clubzugehoerigkeit: "9" })).toBe(false);
    expect(isGuestMember({ clubzugehoerigkeit: 3 })).toBe(true);
    expect(isGuestMember(null)).toBe(true);
  });

  it("meldet offene Clubbeiträge nur für eigene Mitglieder", () => {
    expect(isOpenClubPaymentMember({ clubzugehoerigkeit: MEMBER_CLUB_ID, beitragClubBezahlt: false })).toBe(true);
    expect(isOpenClubPaymentMember({ clubzugehoerigkeit: MEMBER_CLUB_ID, beitragClubBezahlt: -1 })).toBe(false);
    expect(isOpenClubPaymentMember({ clubzugehoerigkeit: 3, beitragClubBezahlt: false })).toBe(false);
  });
});

describe("Gruppen und Funktionen", () => {
  it("setzt den Gruppentext aus den Referenzdaten zusammen", () => {
    expect(getMemberInterestGroupText({ interessengruppen: [1, 3] })).toBe("Skat Wandern");
    expect(getMemberInterestGroupText({ interessengruppen: [99] })).toBe("");
    expect(getMemberInterestGroupText(null)).toBe("");
  });

  it("erkennt Computergruppen unabhängig von Umlauten und Groß-/Kleinschreibung", () => {
    expect(isComputerGroupMember({ interessengruppen: [2] })).toBe(true);
    expect(isComputerGroupMember({ interessengruppen: [1, 3] })).toBe(false);
    expect(isComputerGroupMember({})).toBe(false);
  });

  it("bevorzugt die Funktionsliste vor dem alten Textfeld", () => {
    expect(getMemberFunctionIds({ funktionen: [2], funktion: "1" })).toEqual([2]);
    expect(getMemberFunctionIds({ funktionen: [], funktion: "1;2" })).toEqual([1, 2]);
    expect(getMemberFunctionIds({ funktion: "1, 2" })).toEqual([1, 2]);
    expect(getMemberFunctionIds({ funktion: "0;x;" })).toEqual([]);
    expect(getMemberFunctionIds(null)).toEqual([]);
  });

  it("formatiert Gruppen- und Funktionslisten mit Rückfall auf die ID", () => {
    expect(formatInterestGroups([1, 99])).toBe("Skat, ID 99");
    expect(formatInterestGroups([])).toBe("");
    expect(formatInterestGroups(undefined)).toBe("");
    expect(formatFunctions([1, 2])).toBe("Vorstand, Kassenwart");
    expect(formatFunctions(null)).toBe("");
  });
});

describe("getNewestMembers", () => {
  const members = [
    { name: "Alt", vorname: "Otto", eintrittsdatum: "2020-01-01" },
    { name: "Zander", vorname: "Uwe", eintrittsdatum: "2026-03-01" },
    { name: "Auer", vorname: "Eva", eintrittsdatum: "2026-03-01" },
    { name: "Neu", vorname: "Ina", eintrittsdatum: "2026-06-15" },
    { name: "Ohne", vorname: "Karl", eintrittsdatum: "" },
    { name: "Kaputt", vorname: "Rolf", eintrittsdatum: "unbekannt" }
  ];

  it("sortiert nach Eintrittsdatum absteigend, bei Gleichstand nach Name", () => {
    expect(getNewestMembers(members).map(member => member.name)).toEqual(["Neu", "Auer", "Zander", "Alt"]);
  });

  it("begrenzt auf die gewünschte Anzahl", () => {
    expect(getNewestMembers(members, 2).map(member => member.name)).toEqual(["Neu", "Auer"]);
    expect(getNewestMembers(members, 0)).toEqual([]);
  });

  it("lässt die Eingabeliste unverändert", () => {
    const input = [...members];
    getNewestMembers(input);
    expect(input[0].name).toBe("Alt");
    expect(input.length).toBe(6);
  });

  it("kommt mit einer leeren Liste zurecht", () => {
    expect(getNewestMembers([])).toEqual([]);
  });
});

describe("Anzeigeformate", () => {
  it("setzt den Anzeigenamen zusammen", () => {
    expect(formatMemberName({ vorname: "Anna", name: "Meier" })).toBe("Anna Meier");
    expect(formatMemberName({ name: "Meier" })).toBe("Meier");
    expect(formatMemberName({})).toBe("Mitglied");
    expect(formatMemberName(null)).toBe("Mitglied");
  });

  it("formatiert Zeitstempel deutsch und gibt Unlesbares unverändert zurück", () => {
    expect(formatDateTimeDE("2026-04-03 14:30:00")).toContain("03.04.2026");
    expect(formatDateTimeDE("2026-04-03 14:30:00")).toContain("14:30");
    expect(formatDateTimeDE("kein Datum")).toBe("kein Datum");
    expect(formatDateTimeDE("")).toBe("");
  });

  it("reicht Grid-Zellwerte an die Formatierer durch", () => {
    expect(dateFormatter({ value: "1965-04-03" })).toBe("03.04.1965");
    expect(currencyFormatter({ value: 12.5 })).toContain("12,50");
    expect(interestGroupFormatter({ value: [1] })).toBe("Skat");
    expect(christmasFormatter({ value: 2 })).toBe("Ja + Gast");
    expect(christmasFormatter({ value: null })).toBe("Nein");
    expect(christmasFormatter({ value: "keine Angabe" })).toBe("Nein");
  });

  it("vergleicht Zellwerte mit dem Filterdatum", () => {
    const filter = new Date(2026, 3, 3);
    expect(compareIsoDateToFilterDate(filter, "2026-04-03")).toBe(0);
    expect(compareIsoDateToFilterDate(filter, "2026-04-02")).toBe(-1);
    expect(compareIsoDateToFilterDate(filter, "2026-04-04")).toBe(1);
    expect(compareIsoDateToFilterDate(filter, "")).toBe(-1);
  });
});

describe("Geburtstage", () => {
  const today = new Date(2026, 7, 8);

  it("ermittelt den nächsten Geburtstag im laufenden Jahr", () => {
    expect(getNextBirthday({ geburtstag: "1946-09-01" }, today)).toMatchObject({
      daysUntil: 24,
      age: 80,
      isoDate: "2026-09-01"
    });
  });

  it("zählt einen bereits vergangenen Geburtstag für das Folgejahr", () => {
    expect(getNextBirthday({ geburtstag: "1946-08-07" }, today)).toMatchObject({
      daysUntil: 364,
      age: 81,
      isoDate: "2027-08-07"
    });
  });

  it("wertet den heutigen Geburtstag als 0 Tage", () => {
    expect(getNextBirthday({ geburtstag: "1946-08-08" }, today)).toMatchObject({ daysUntil: 0, age: 80 });
  });

  it("liefert null ohne auswertbaren Geburtstag", () => {
    expect(getNextBirthday({ geburtstag: "" }, today)).toBeNull();
    expect(getNextBirthday({ geburtstag: "unbekannt" }, today)).toBeNull();
    expect(getNextBirthday({}, today)).toBeNull();
  });

  it("meldet nur Geburtstage innerhalb der nächsten 10 Tage", () => {
    expect(getUpcomingBirthday({ geburtstag: "1946-08-18" }, today)).toMatchObject({ daysUntil: 10 });
    expect(getUpcomingBirthday({ geburtstag: "1946-08-19" }, today)).toBeNull();
  });

  it("sammelt runde Geburtstage ab 80 für ein halbes Jahr, sortiert nach Datum und Name", () => {
    const members = [
      { name: "Zander", vorname: "Uwe", geburtstag: "1941-10-01" },
      { name: "Auer", vorname: "Eva", geburtstag: "1941-10-01" },
      { name: "Jung", vorname: "Tim", geburtstag: "1946-09-01" },
      { name: "ZuJung", vorname: "Lea", geburtstag: "1951-09-01" },
      { name: "Krumm", vorname: "Ida", geburtstag: "1944-09-01" },
      { name: "ZuSpaet", vorname: "Rolf", geburtstag: "1941-03-01" }
    ];
    expect(getRoundBirthdays(members, today).map(item => item.member.name)).toEqual(["Jung", "Auer", "Zander"]);
  });

  it("ignoriert Mitglieder ohne auswertbaren Geburtstag", () => {
    expect(getRoundBirthdays([{ name: "Ohne", geburtstag: "" }], today)).toEqual([]);
  });
});
