import { describe, it } from "node:test";
import { expect } from "./assertions.js";

import { buildWarnemuendePdf, pdfToBytes } from "../../src/warnemuende-pdf.js";

const participant = (id, overrides = {}) => ({
  id,
  name: `Name${id}`,
  vorname: `Vorname${id}`,
  essensauswahl: "Zander",
  bezahlt: false,
  abgesagt: false,
  bemerkung: "",
  ...overrides
});

describe("Warnemuende-PDF", () => {
  it("liefert ein gueltiges PDF-Geruest", () => {
    const pdf = buildWarnemuendePdf([participant(1)]);

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/Type /Catalog");
    expect(pdf).toContain("/MediaBox [0 0 841.8898 595.2756]");
    expect(pdf).toContain("/BaseFont /Helvetica-Bold");
  });

  it("nennt die xref-Positionen der Objekte", () => {
    const pdf = buildWarnemuendePdf([participant(1)]);
    const startxref = Number(pdf.match(/startxref\n(\d+)/)[1]);

    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
    const firstOffset = Number(pdf.match(/\n(\d{10}) 00000 n /)[1]);
    expect(pdf.slice(firstOffset, firstOffset + 7)).toBe("1 0 obj");
  });

  it("schreibt Titel, Spaltenkoepfe und Teilnehmer in den Inhalt", () => {
    const pdf = buildWarnemuendePdf([participant(1, { name: "Odorinszky", vorname: "Dorothea" })]);

    expect(pdf).toContain("(Teilnehmerliste Warnem\\374nde) Tj");
    expect(pdf).toContain("(Essensauswahl) Tj");
    expect(pdf).toContain("(Odorinszky) Tj");
    expect(pdf).toContain("(Dorothea) Tj");
  });

  it("kodiert Umlaute oktal und maskiert Klammern", () => {
    const pdf = buildWarnemuendePdf([participant(1, { name: "Brätz", bemerkung: "zahlt (bar)" })]);

    expect(pdf).toContain("(Br\\344tz) Tj");
    expect(pdf).toContain("(zahlt \\(bar\\)) Tj");
  });

  it("zeigt bezahlte Teilnehmer mit ja", () => {
    expect(buildWarnemuendePdf([participant(1, { bezahlt: true })])).toContain("(ja) Tj");
    expect(buildWarnemuendePdf([participant(1)]).includes("(ja) Tj")).toBe(false);
  });

  it("zaehlt Abgesagte weder in der Fusszeile noch in den Portionen", () => {
    const pdf = buildWarnemuendePdf(
      [participant(1), participant(2, { abgesagt: true }), participant(3)],
      { date: new Date(2026, 7, 24) }
    );

    expect(pdf).toContain("(2 Teilnehmer   Zander: 2   Rind: 0   Vegie: 0   bezahlt: 0   Stand: 24.8.2026) Tj");
  });

  it("verteilt mehr als 52 Teilnehmer auf zwei Seiten", () => {
    const participants = Array.from({ length: 53 }, (unused, index) => participant(index + 1));

    expect(buildWarnemuendePdf(participants)).toContain("/Count 2");
    expect(buildWarnemuendePdf(participants.slice(0, 52))).toContain("/Count 1");
  });

  it("erzeugt auch ohne Teilnehmer eine Seite", () => {
    expect(buildWarnemuendePdf([])).toContain("/Count 1");
  });

  it("kuerzt zu lange Bemerkungen auf die Spaltenbreite", () => {
    const pdf = buildWarnemuendePdf([participant(1, { bemerkung: "eine wirklich sehr lange Bemerkung zum Sitzplatz" })]);

    expect(pdf).toContain("(eine wirklich sehr.) Tj");
  });

  it("schreibt Bytes als Latin-1, nicht als UTF-8", () => {
    const bytes = pdfToBytes("Aä");

    expect([...bytes]).toEqual([65, 228]);
  });
});
