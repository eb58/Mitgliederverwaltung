import { describe, it } from "node:test";
import { expect } from "./assertions.js";
import { isValidEmail, isValidPhone, isValidPlz, validateMember } from "../../src/member-domain.js";

const today = new Date(2026, 9, 2);
const base = { id: 1, name: "Müller", vorname: "Anna", geburtstag: "1950-02-03", eintrittsdatum: "2020-01-01", strasse: "Alt-Lübars 8", plz: "13469", ort: "Berlin" };
const check = (changes, options = {}) => validateMember({ ...base, ...changes }, { today, ...options });
const fields = list => list.map(entry => entry.field);

describe("validateMember", () => {
  it("akzeptiert einen plausiblen Datensatz", () => {
    expect(check({})).toEqual({ errors: [], warnings: [] });
  });

  it("verlangt Name und Vorname", () => {
    expect(fields(check({ name: "", vorname: "" }).errors)).toEqual(["name", "vorname"]);
  });

  it("lehnt ungueltige und unplausible Daten ab", () => {
    expect(fields(check({ geburtstag: "0026-02-27" }).errors)).toEqual(["geburtstag"]);
    expect(fields(check({ austrittsdatum: "2024-02-30" }).errors)).toEqual(["austrittsdatum"]);
    expect(check({ geburtstag: "2027-01-01" }).errors[0].message).toContain("Zukunft");
    expect(check({ eintrittsdatum: "1949-12-31" }).errors[0]).toMatchObject({ field: "eintrittsdatum", message: "Eintritt liegt vor der Geburt." });
    expect(check({ austrittsdatum: "2019-12-31", austrittsgrund: 3 }).errors[0]).toMatchObject({ field: "austrittsdatum" });
  });

  it("prueft PLZ, E-Mail und Betraege", () => {
    expect(fields(check({ plz: "1346" }).errors)).toEqual(["plz"]);
    expect(fields(check({ email: "anna@" }).errors)).toEqual(["email"]);
    expect(fields(check({ gezahlterBetragClub: -30 }).errors)).toEqual(["gezahlterBetragClub"]);
    expect(isValidPlz(" 13469 ")).toBe(true);
    expect(isValidEmail("anna.mueller@example.de")).toBe(true);
    expect(isValidPhone("030 / 123 45-67")).toBe(true);
    expect(isValidPhone("+49 171 1234567")).toBe(true);
    expect(isValidPhone("Tochter anrufen")).toBe(false);
    expect(isValidPhone("12")).toBe(false);
  });

  it("warnt bei auffaelligem Alter, Austritt und Zahlungsdatum", () => {
    expect(check({ geburtstag: "1915-01-01" }).warnings[0].message).toContain("111 Jahren");
    expect(check({ geburtstag: "1990-01-01" }).warnings[0].message).toContain("36 Jahren");
    expect(fields(check({ austrittsdatum: "2025-01-01" }).warnings)).toEqual(["austrittsgrund"]);
    expect(fields(check({ austrittsgrund: 3 }).warnings)).toEqual(["austrittsdatum"]);
    expect(fields(check({ einzahlungClubAm: "2026-12-01" }).warnings)).toEqual(["einzahlungClubAm"]);
    expect(fields(check({ telefon: "abends" }).warnings)).toEqual(["telefon"]);
  });

  it("warnt bei unvollstaendiger Anschrift", () => {
    expect(fields(check({ plz: "", ort: "" }).warnings)).toEqual(["plz", "ort"]);
    expect(fields(check({ strasse: "Alt-Lübars" }).warnings)).toEqual(["strasse"]);
  });

  it("warnt vor moeglichen Doppelten", () => {
    const members = [{ id: 2, name: "müller", vorname: "anna", geburtstag: "1950-02-03" }];
    expect(check({}, { members }).warnings[0].message).toContain("geb. 03.02.1950");
    expect(check({}, { members: [{ ...members[0], geburtstag: "1960-01-01" }] }).warnings).toEqual([]);
    expect(check({}, { members: [{ ...base }] }).warnings).toEqual([]);
  });

  it("warnt nur bei geaenderten Feldern, Fehler gelten immer", () => {
    const original = { ...base, geburtstag: "1990-01-01", telefon: "abends", plz: "1346" };
    const result = validateMember({ ...original, bemerkung: "neu" }, { original, today });
    expect(result.warnings).toEqual([]);
    expect(fields(result.errors)).toEqual(["plz"]);
  });
});
