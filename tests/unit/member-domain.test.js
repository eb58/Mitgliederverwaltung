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
  angezeigteBeitragsjahre,
  beitragImJahr,
  beitragsjahrOptionen,
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
  getEntriesPerYear,
  findDuplicateGroups,
  findMemberIssues,
  mergeFieldDiffs,
  suggestMergeTarget,
  getExitsPerYear,
  getMemberEmails,
  getMemberFunctionIds,
  getMemberInterestGroupText,
  getNewestMembers,
  getNextBirthday,
  zahlungenNachJahr,
  getRoundBirthdays,
  getUpcomingBirthday,
  interestGroupFormatter,
  isActiveMember,
  istBeitragBezahlt,
  isComputerGroupMember,
  isGuestMember,
  isOpenClubPaymentMember,
  matchesPaymentMetricFilter,
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

  it("uebernimmt den Geburtstag unveraendert, auch wenn er ein junges Alter ergibt", () => {
    expect(normalizeMember({ geburtstag: "01.02.1950" }).geburtstag).toBe("1950-02-01");
    // Frueher wurde hier stillschweigend auf das Mindestalter angehoben - das hat
    // vertippte Jahreszahlen durch ein erfundenes Datum ersetzt.
    expect(normalizeMember({ geburtstag: "2020-01-01" }).geburtstag).toBe("2020-01-01");
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

  it("normalisiert historische Wahrheitswerte", () => {
    const member = normalizeMember({ auswahl: -1, ausweisErteilt: "YES", beitragClubBezahlt: 0, wnEssenBezahlt: "nein" });
    expect(member.auswahl).toBe(true);
    expect(member.ausweisErteilt).toBe(true);
    expect(member.beitragClubBezahlt).toBe(false);
    expect(member.wnEssenBezahlt).toBe(false);
  });

  it("leitet beide Beitragshaken ausschliesslich aus dem Zahlbetrag ab", () => {
    const member = normalizeMember({
      beitragClubBezahlt: false,
      gezahlterBetragClub: "7,50 €",
      beitragComputerBezahlt: true,
      gezahlterBetragComputer: 0
    });
    expect(member.beitragClubBezahlt).toBe(true);
    expect(member.beitragComputerBezahlt).toBe(false);
    expect(istBeitragBezahlt(0)).toBe(false);
    expect(istBeitragBezahlt(20)).toBe(true);
  });

  it("akzeptiert nur unterstützte Passbilder und entfernt den Pfad", () => {
    expect(normalizeMember({ passbild: "C:\\Bilder\\p.JPG" }).passbild).toBe("p.JPG");
    expect(normalizeMember({ passbild: "schad.exe" }).passbild).toBe("");
  });
});

describe("Zahlungen je Beitragsjahr", () => {
  it("normalisiert die Jahresliste und sortiert das neueste Jahr nach vorn", () => {
    const member = normalizeMember({ zahlungen: [
      { beitragsjahr: "2026", gezahlterBetragClub: "30,00", einzahlungClubAm: null },
      { beitragsjahr: 2027, gezahlterBetragComputer: 20, einzahlungComputerAm: "2027-01-10" }
    ] });
    expect(member.zahlungen.map(zahlung => zahlung.beitragsjahr)).toEqual([2027, 2026]);
    expect(member.zahlungen[1]).toEqual({ beitragsjahr: 2026, gezahlterBetragClub: 30, einzahlungClubAm: "", gezahlterBetragComputer: 0, einzahlungComputerAm: "" });
    expect(normalizeMember({}).zahlungen).toEqual([]);
  });

  it("nimmt das aktuelle Jahr aus den flachen Feldern statt aus der Liste", () => {
    const jahre = zahlungenNachJahr({
      gezahlterBetragClub: 30,
      einzahlungClubAm: "2026-02-01",
      zahlungen: [{ beitragsjahr: 2026, gezahlterBetragClub: 10 }, { beitragsjahr: 2027, gezahlterBetragClub: 25 }]
    }, 2026);
    expect(jahre.get(2026)).toMatchObject({ gezahlterBetragClub: 30, einzahlungClubAm: "2026-02-01" });
    expect(jahre.get(2027).gezahlterBetragClub).toBe(25);
  });

  it("bietet ab dem ersten Beitragsjahr bis zum Folgejahr an, dazu Jahre mit Daten", () => {
    expect(beitragsjahrOptionen([], 2026)).toEqual([2026, 2027]);
    expect(beitragsjahrOptionen([], 2028)).toEqual([2026, 2027, 2028, 2029]);
    expect(beitragsjahrOptionen([2031], 2026)).toEqual([2026, 2027, 2031]);
  });

  it("zeigt in der Uebersicht alle Jahre ab dem ersten Beitragsjahr bis heute", () => {
    expect(angezeigteBeitragsjahre(2026)).toEqual([2026]);
    expect(angezeigteBeitragsjahre(2027)).toEqual([2026, 2027]);
    expect(angezeigteBeitragsjahre(2025)).toEqual([2025]);
  });

  it("liest den Beitrag eines Jahres aus flachen Feldern oder der Jahresliste", () => {
    const member = { gezahlterBetragClub: 30, gezahlterBetragComputer: "", zahlungen: [{ beitragsjahr: 2026, gezahlterBetragClub: 25, gezahlterBetragComputer: 20 }] };
    expect(beitragImJahr(member, 2027, "Club", 2027)).toBe(30);
    expect(beitragImJahr(member, 2027, "Computer", 2027)).toBe(0);
    expect(beitragImJahr(member, 2026, "Club", 2027)).toBe(25);
    expect(beitragImJahr(member, 2026, "Computer", 2027)).toBe(20);
    expect(beitragImJahr({ gezahlterBetragClub: 30 }, 2026, "Club", 2027)).toBe(0);
  });
});

describe("createEmptyMember und cloneMember", () => {
  it("legt ein leeres Mitglied mit Vorgabewerten an", () => {
    expect(createEmptyMember()).toMatchObject({
      id: 0,
      name: "",
      geschlecht: "w",
      ort: "Berlin",
      clubzugehoerigkeit: MEMBER_CLUB_ID,
      interessengruppen: [],
      ausweisErteilt: false,
      austrittsgrund: null,
      tischnummer: 0,
      zahlungen: []
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

describe("Dashboard-Beitragsfilter", () => {
  const paidMember = { beitragClubBezahlt: true, beitragComputerBezahlt: true };
  const openMember = { beitragClubBezahlt: false, beitragComputerBezahlt: false };

  it("filtert bezahlte und offene Beiträge", () => {
    expect(matchesPaymentMetricFilter(paidMember, "club-paid")).toBe(true);
    expect(matchesPaymentMetricFilter(openMember, "club-paid")).toBe(false);
    expect(matchesPaymentMetricFilter(paidMember, "computer-paid")).toBe(true);
    expect(matchesPaymentMetricFilter(openMember, "computer-open")).toBe(true);
  });

  it("lässt Mitglieder ohne Dashboard-Filter durch", () => {
    expect(matchesPaymentMetricFilter(openMember, null)).toBe(true);
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

  it("sammelt E-Mail-Adressen nach Namen sortiert ohne Doppelte", () => {
    const result = getMemberEmails([
      { vorname: "Uwe", name: "Zander", email: "uwe@example.org" },
      { vorname: "Anna", name: "Berg", email: " anna@example.org " },
      { vorname: "Uwe", name: "Zander-Alt", email: "UWE@example.org" },
      { vorname: "Olga", name: "Ohne", email: "" }
    ]);
    expect(result.emails).toEqual(["anna@example.org", "uwe@example.org"]);
    expect(result.withoutEmail.map(member => member.vorname)).toEqual(["Olga"]);
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

describe("getEntriesPerYear", () => {
  it("zaehlt Eintritte fuer das laufende und die neun vorherigen Kalenderjahre", () => {
    const entries = getEntriesPerYear([
      { eintrittsdatum: "2016-12-31" },
      { eintrittsdatum: "2017-01-01" },
      { eintrittsdatum: "2025-05-10" },
      { eintrittsdatum: "2025-11-02" },
      { eintrittsdatum: "2026-01-03" },
      { eintrittsdatum: "2027-01-01" },
      { eintrittsdatum: "unbekannt" }
    ], new Date(2026, 8, 4));

    expect(entries.map(entry => entry.year)).toEqual([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(entries.map(entry => entry.count)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 2, 1]);
  });

  it("liefert fuer null Jahre eine leere Auswertung", () => {
    expect(getEntriesPerYear([{ eintrittsdatum: "2026-01-03" }], new Date(2026, 8, 4), 0)).toEqual([]);
  });
});

describe("getExitsPerYear", () => {
  it("zaehlt nur gueltige Austrittsdaten innerhalb der letzten zehn Jahre", () => {
    const exits = getExitsPerYear([
      { austrittsdatum: "2017-01-01" },
      { austrittsdatum: "2024-05-10" },
      { austrittsdatum: "2024-11-02" },
      { austrittsdatum: "2026-01-03" },
      { austrittsdatum: "" },
      { austrittsdatum: "2026-02-30" }
    ], new Date(2026, 8, 4));

    expect(exits.map(exit => exit.count)).toEqual([1, 0, 0, 0, 0, 0, 0, 2, 0, 1]);
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

describe("findMemberIssues", () => {
  const today = new Date("2026-10-12T12:00:00");
  const base = { name: "Muster", vorname: "Max", geburtstag: "1950-01-01", eintrittsdatum: "2020-01-01", clubzugehoerigkeit: MEMBER_CLUB_ID, zahlungen: [] };
  const issuesOf = (members, id) => findMemberIssues(members, { today }).find(entry => entry.member.id === id)?.issues || [];

  it("laesst unauffaellige Datensaetze weg", () => {
    expect(findMemberIssues([{ ...base, id: 1 }], { today })).toEqual([]);
  });

  it("uebernimmt Fehler und Warnungen der Maske und sortiert Fehler nach vorn", () => {
    const issues = issuesOf([{ ...base, id: 1, email: "ohne", austrittsdatum: "2024-01-01" }], 1);
    expect(issues[0]).toEqual({ level: "fehler", message: "Keine gültige E-Mail-Adresse." });
    expect(issues.some(issue => issue.message === "Austrittsdatum ohne Austrittsgrund.")).toBe(true);
  });

  it("ignoriert die fehlende Hausnummer bei Ehemaligen", () => {
    const members = [
      { ...base, id: 1, name: "Aktiv", strasse: "Benekendorfstr.", plz: "13469", ort: "Berlin" },
      { ...base, id: 2, name: "Ehemalig", strasse: "Benekendorfstr.", plz: "13469", ort: "Berlin", austrittsdatum: "2024-01-01", austrittsgrund: 1 }
    ];
    expect(issuesOf(members, 1)).toEqual([{ level: "warnung", message: "Hausnummer fehlt." }]);
    expect(issuesOf(members, 2)).toEqual([]);
  });

  it("laesst die fruehere Funktion von Ehemaligen stehen", () => {
    expect(issuesOf([{ ...base, id: 1, austrittsdatum: "2024-01-01", austrittsgrund: 1, funktionen: [1] }], 1)).toEqual([]);
  });

  it("prueft Zahlungen auf Datum, Betrag und Austritt", () => {
    // Intl setzt ein geschuetztes Leerzeichen vor das Euro-Zeichen
    const messages = id => issuesOf(members, id).map(issue => issue.message.replace(/\s/g, " "));
    const members = [
      { ...base, id: 1, name: "Eins", gezahlterBetragClub: 30, einzahlungClubAm: "", einzahlungComputerAm: "2026-01-21" },
      { ...base, id: 2, name: "Zwei", clubzugehoerigkeit: 8, gezahlterBetragClub: 15, einzahlungClubAm: "2026-02-01" },
      { ...base, id: 3, name: "Drei", austrittsdatum: "2025-06-30", austrittsgrund: 1, zahlungen: [{ beitragsjahr: 2025, gezahlterBetragClub: 30, einzahlungClubAm: "2025-08-01" }] }
    ];
    expect(messages(1)).toEqual(["Club 2026: 30,00 € ohne Einzahlungsdatum.", "Computer 2026: Einzahlung am 21.01.2026 ohne Betrag."]);
    expect(messages(2)).toEqual(["Club 2026: 15,00 € statt 30,00 €."]);
    expect(messages(3)).toEqual(["Club-Einzahlung 01.08.2025 nach dem Austritt."]);
  });

  it("meldet gleiche Anschrift mit unterschiedlicher PLZ und PLZ ausserhalb Berlins", () => {
    const members = [
      { ...base, id: 1, name: "Kalweit", strasse: "Oranienburger Str. 157", plz: "13433", ort: "Berlin" },
      { ...base, id: 2, name: "Pliet", strasse: "Oranienburger Straße 157", plz: "13437", ort: "Berlin" },
      { ...base, id: 3, name: "Fern", strasse: "Hauptstr. 1", plz: "16515", ort: "Berlin" }
    ];
    expect(issuesOf(members, 1).map(issue => issue.message)).toEqual(["Gleiche Anschrift wie Max Pliet (13437), aber andere PLZ."]);
    expect(issuesOf(members, 3).map(issue => issue.message)).toEqual(["PLZ 16515 liegt nicht in Berlin."]);
  });

  it("gibt Hinweise auf fehlende Daten nur bei aktiven Mitgliedern", () => {
    const members = [
      { ...base, id: 1, name: "Eins", geburtstag: "", eintrittsdatum: "" },
      { ...base, id: 2, name: "Zwei", geburtstag: "", eintrittsdatum: "", clubzugehoerigkeit: 8 }
    ];
    expect(issuesOf(members, 1)).toEqual([{ level: "hinweis", message: "Eintrittsdatum fehlt." }, { level: "hinweis", message: "Geburtstag fehlt." }]);
    expect(issuesOf(members, 2)).toEqual([]);
  });
});

describe("Doppelte zusammenfuehren", () => {
  const alt = { id: 383, name: "Lieven", vorname: "Alexander", geburtstag: "1959-05-09", eintrittsdatum: "2022-10-01", austrittsdatum: "2024-12-31", austrittsgrund: 1, strasse: "Lahrer Pfad 5", ort: "Berlin", interessengruppen: [1], hasPassbildInDb: true, passbild: "lieven.jpg" };
  const neu = { id: 463, name: "Lieven", vorname: "Alexander", geburtstag: "1959-05-09", eintrittsdatum: "2025-06-01", austrittsdatum: "", austrittsgrund: null, strasse: "", ort: "Oranienburg", interessengruppen: [3], hasPassbildInDb: false, passbild: "" };

  it("gruppiert gleiche Namen ohne widersprechenden Geburtstag", () => {
    const groups = findDuplicateGroups([
      neu, alt,
      { id: 1, name: "lieven ", vorname: "alexander", geburtstag: "" },
      { id: 2, name: "Bredlau", vorname: "Henry", geburtstag: "1956-01-26" },
      { id: 3, name: "Bredlau", vorname: "Henry", geburtstag: "1960-01-01" }
    ]);
    expect(groups.map(group => group.map(member => member.id))).toEqual([[1, 383, 463]]);
  });

  it("schlaegt den aktiven, sonst den juengeren Datensatz als Ziel vor", () => {
    expect(suggestMergeTarget([alt, neu]).id).toBe(463);
    expect(suggestMergeTarget([{ ...alt, austrittsdatum: "", austrittsgrund: null }, neu]).id).toBe(463);
    expect(suggestMergeTarget([{ ...neu, austrittsdatum: "2025-12-31", austrittsgrund: 1 }, { ...alt, id: 500 }]).id).toBe(463);
  });

  it("listet nur abweichende Felder und waehlt frueheren Eintritt und fehlendes Passbild vor", () => {
    const diffs = mergeFieldDiffs(neu, alt);
    expect(diffs.map(diff => diff.key)).toEqual(["strasse", "ort", "eintrittsdatum", "austrittsdatum", "austrittsgrund", "interessengruppen", "passbild"]);
    expect(diffs.filter(diff => diff.fromSource).map(diff => diff.key)).toEqual(["eintrittsdatum", "passbild"]);
    expect(diffs.find(diff => diff.key === "eintrittsdatum")).toEqual({ key: "eintrittsdatum", label: "Eintrittsdatum", targetText: "01.06.2025", sourceText: "01.10.2022", fromSource: true });
    expect(diffs.find(diff => diff.key === "strasse").targetText).toBe("–");
    expect(diffs.find(diff => diff.key === "interessengruppen").sourceText).toBe("Skat");
  });

  it("nimmt Doppelte aus den Einzelkarten der Auffaelligkeiten heraus", () => {
    const issues = findMemberIssues([{ ...neu, id: 1, clubzugehoerigkeit: MEMBER_CLUB_ID }, { ...neu, id: 2, clubzugehoerigkeit: MEMBER_CLUB_ID }], { today: new Date("2026-10-12") });
    expect(issues.flatMap(entry => entry.issues).some(issue => issue.message.startsWith("Es gibt bereits"))).toBe(false);
  });
});
