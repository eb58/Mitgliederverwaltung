import { describe, expect, it } from "vitest";

import {
  asBoolean,
  calculateAge,
  createMemberApiUrlForBase,
  ensureMinimumAge,
  formatCurrency,
  formatDateDE,
  formatIsoDate,
  getBirthDateRangeForAgeBucket,
  getBusinessYearRange,
  getNextId,
  isDateInRange,
  normalizeGroupText,
  normalizePhotoFileName,
  parseIsoDate,
  parseLegacyCashAmount,
  parseLegacyCurrency,
  parseLegacyDate,
  percent,
  roundCurrency,
  sumPaymentsInBusinessYear
} from "../../member-utils.js";

describe("Datumslogik", () => {
  it("bestimmt das Geschäftsjahr von November bis Oktober", () => {
    expect(getBusinessYearRange(new Date(2026, 0, 15))).toEqual({ from: "2025-11-01", to: "2026-10-31" });
    expect(getBusinessYearRange(new Date(2026, 10, 1))).toEqual({ from: "2026-11-01", to: "2027-10-31" });
  });

  it("behandelt die Grenzen des Geschäftsjahres inklusive", () => {
    expect(isDateInRange("2025-11-01", "2025-11-01", "2026-10-31")).toBe(true);
    expect(isDateInRange("2026-10-31", "2025-11-01", "2026-10-31")).toBe(true);
    expect(isDateInRange("2026-11-01", "2025-11-01", "2026-10-31")).toBe(false);
    expect(isDateInRange("31.10.2026", "2025-11-01", "2026-10-31")).toBe(false);
  });

  it("summiert nur Zahlungen im gewählten Geschäftsjahr", () => {
    const members = [
      { amount: 10, paidAt: "2025-10-31" },
      { amount: "12.50", paidAt: "2025-11-01" },
      { amount: 7.5, paidAt: "2026-10-31" },
      { amount: 99, paidAt: "2026-11-01" }
    ];
    expect(sumPaymentsInBusinessYear(members, "amount", "paidAt", { from: "2025-11-01", to: "2026-10-31" })).toBe(20);
  });

  it("normalisiert deutsche und ISO-Datumswerte", () => {
    expect(parseLegacyDate("03.04.1965")).toBe("1965-04-03");
    expect(parseLegacyDate("3/4/65")).toBe("1965-04-03");
    expect(parseLegacyDate("1965-04-03")).toBe("1965-04-03");
    expect(parseLegacyDate("unbekannt")).toBe("");
    expect(formatDateDE("1965-04-03")).toBe("03.04.1965");
  });

  it("weist ungültige ISO-Kalendertage zurück", () => {
    expect(parseIsoDate("2024-02-29")).toBeInstanceOf(Date);
    expect(parseIsoDate("2023-02-29")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
  });

  it("berechnet das Alter vor und nach dem Geburtstag", () => {
    expect(calculateAge("1965-08-08", new Date(2026, 7, 7))).toBe(60);
    expect(calculateAge("1965-08-08", new Date(2026, 7, 8))).toBe(61);
    expect(calculateAge("2030-01-01", new Date(2026, 7, 7))).toBeNull();
  });

  it("liefert den Geburtsdatumsbereich eines Alterssegments", () => {
    expect(getBirthDateRangeForAgeBucket({ min: 55, max: 59 }, new Date(2026, 7, 7)))
      .toEqual({ from: "1966-08-08", to: "1971-08-07" });
    expect(getBirthDateRangeForAgeBucket({ min: 95, max: Infinity }, new Date(2026, 7, 7)))
      .toEqual({ from: "1900-01-01", to: "1931-08-07" });
  });

  it("begrenzt zu junge importierte Geburtstage auf das Mindestalter", () => {
    expect(ensureMinimumAge("1980-01-01", 55, new Date(2026, 7, 7))).toBe("1971-08-07");
    expect(ensureMinimumAge("1960-01-01", 55, new Date(2026, 7, 7))).toBe("1960-01-01");
  });

  it("lässt nicht normalisierbare Geburtstage unverändert", () => {
    expect(ensureMinimumAge("unbekannt", 55, new Date(2026, 7, 7))).toBe("unbekannt");
  });

  it("weist Tage und Monate außerhalb des gültigen Bereichs zurück", () => {
    expect(parseLegacyDate("32.01.2026")).toBe("");
    expect(parseLegacyDate("01.13.2026")).toBe("");
    expect(parseLegacyDate("00.01.2026")).toBe("");
    expect(parseLegacyDate("12.2026")).toBe("");
  });

  it("interpretiert zweistellige Jahre als 19xx", () => {
    expect(parseLegacyDate("15.06.99")).toBe("1999-06-15");
  });

  it("formatiert Kalenderdaten mit führenden Nullen", () => {
    expect(formatIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatIsoDate(new Date(2026, 10, 23))).toBe("2026-11-23");
  });

  it("liefert null für nicht auswertbare oder zukünftige Geburtstage", () => {
    expect(calculateAge("unbekannt", new Date(2026, 7, 7))).toBeNull();
    expect(calculateAge("", new Date(2026, 7, 7))).toBeNull();
  });
});

describe("Import- und Anzeigeformate", () => {
  it("liest deutsche Währungswerte und rundet auf Cent", () => {
    expect(parseLegacyCurrency("1.234,567 €")).toBe(1234.57);
    expect(parseLegacyCurrency("-20,00")).toBe(-20);
    expect(parseLegacyCurrency("kein Betrag")).toBe(0);
    expect(formatCurrency(12.5)).toContain("12,50");
  });

  it("übernimmt bei altem -1-Barwert den bereits gezahlten Betrag", () => {
    expect(parseLegacyCashAmount(-1, "30,00 €")).toBe(30);
    expect(parseLegacyCashAmount("5,00 €", "30,00 €")).toBe(5);
  });

  it("normalisiert historische Wahrheitswerte", () => {
    [true, 1, -1, "true", "YES", " -1 "].forEach(value => expect(asBoolean(value)).toBe(true));
    [false, 0, null, "nein", ""].forEach(value => expect(asBoolean(value)).toBe(false));
  });

  it("normalisiert Gruppentexte ohne Umlaute und Großschreibung", () => {
    expect(normalizeGroupText("  PC Grundlagen ÄÖÜ  ")).toBe("  pc grundlagen aou  ");
  });

  it("akzeptiert nur unterstützte Passbild-Dateien", () => {
    expect(normalizePhotoFileName("C:\\Bilder\\Passbild.JPEG")).toBe("Passbild.JPEG");
    expect(normalizePhotoFileName("/tmp/passbild.png")).toBe("passbild.png");
    expect(normalizePhotoFileName("virus.exe")).toBe("");
  });

  it("prüft die Dateiendung nach dem letzten Punkt, nicht nur irgendeinen Treffer", () => {
    expect(normalizePhotoFileName("archiv.tar.gz")).toBe("");
    expect(normalizePhotoFileName("")).toBe("");
    expect(normalizePhotoFileName("ohneEndung")).toBe("");
  });

  it("rundet Beträge auf Cent", () => {
    expect(roundCurrency(10.126)).toBe(10.13);
    expect(roundCurrency(-5.129)).toBe(-5.13);
    expect(roundCurrency(3.14159)).toBe(3.14);
  });
});

describe("API- und Listenhilfen", () => {
  it("baut URLs für PHP-PATH_INFO mit Query-Parametern", () => {
    expect(createMemberApiUrlForBase(
      "http://localhost/mitgliederverwaltung/php-api/index.php",
      "/api/members",
      { limit: 500, offset: 0, ignored: "" }
    )).toBe("http://localhost/mitgliederverwaltung/php-api/index.php/api/members?limit=500&offset=0");
  });

  it("baut URLs auch für verzeichnisbasierte APIs", () => {
    expect(createMemberApiUrlForBase("https://example.test/api/", "/members/12"))
      .toBe("https://example.test/api/members/12");
  });

  it("behält den Parameterwert 0, verwirft aber leere Strings", () => {
    const url = createMemberApiUrlForBase(
      "http://localhost/mitgliederverwaltung/php-api/index.php",
      "/api/members",
      { limit: 0, offset: 5, search: "" }
    );
    expect(url).toBe("http://localhost/mitgliederverwaltung/php-api/index.php/api/members?limit=0&offset=5");
  });

  it("überschreibt eine bereits in der Basis-URL vorhandene Query gleichen Namens", () => {
    const url = createMemberApiUrlForBase(
      "http://localhost/mitgliederverwaltung/php-api/index.php?limit=999",
      "/api/members",
      { limit: 50 }
    );
    expect(url).toBe("http://localhost/mitgliederverwaltung/php-api/index.php/api/members?limit=50");
  });

  it("ermittelt die nächste freie Mitglieds-ID", () => {
    expect(getNextId([])).toBe(1);
    expect(getNextId([{ id: 4 }, { id: 9 }, { id: 2 }])).toBe(10);
  });

  it("rutscht bei ausschließlich negativen IDs nicht unter 1", () => {
    expect(getNextId([{ id: -5 }, { id: -1 }])).toBe(1);
  });

  it("berechnet Prozentwerte defensiv", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(4, 0)).toBe(0);
  });
});
