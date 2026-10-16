import { describe, it } from "node:test";
import { expect } from "./assertions.js";

import {
  CONTACT_CATEGORY_COLORS,
  UNCATEGORIZED_LABEL,
  contactAddressLine,
  contactCategoryColor,
  contactCategoryOptions,
  contactDisplayName,
  contactInitials,
  filterContacts,
  groupContactsByCategory,
  mapHref,
  phoneHref,
  summarizeContactCategories,
  toContactPayload,
  toVCard,
  toVCardFile,
  vCardFileName,
  websiteHref,
  websiteLabel
} from "../../src/contact-domain.js";

const bezirksamt = { id: 1, kategorie: "Bezirksamt", firma: "Bezirksamt Reinickendorf", name: "Sommer", vorname: "Petra", zustaendigkeit: "Seniorenarbeit", telefon: "030 90294-0", email: "p.sommer@example.org", ort: "Berlin" };
const musiker = { id: 2, kategorie: "Musiker", firma: "", name: "Spielmann", vorname: "Franz", handy: "0171 1234567", favorit: false };
const band = { id: 3, kategorie: "musiker", firma: "Alt-Lübarser Blaskapelle", name: "", vorname: "", favorit: true };
const vermieter = { id: 4, kategorie: "", firma: "Wohnbau Nord", strasse: "Alt-Lübars 8", plz: "13469", ort: "Berlin" };

describe("Adressverwaltung: Namen", () => {
  it("zeigt Firmen unter ihrem Namen und Personen als Vorname Name", () => {
    expect(contactDisplayName(bezirksamt)).toBe("Bezirksamt Reinickendorf");
    expect(contactDisplayName(musiker)).toBe("Franz Spielmann");
    expect(contactDisplayName({ name: "Solo" })).toBe("Solo");
  });

  it("bildet Initialen aus erstem und letztem Wort", () => {
    expect(contactInitials(bezirksamt)).toBe("BR");
    expect(contactInitials(musiker)).toBe("FS");
    expect(contactInitials(band)).toBe("AB");
    expect(contactInitials({ firma: "Ölmühle" })).toBe("Ö");
    expect(contactInitials({})).toBe("?");
  });

  it("baut die Anschrift aus Strasse, PLZ und Ort", () => {
    expect(contactAddressLine(vermieter)).toBe("Alt-Lübars 8, 13469 Berlin");
    expect(contactAddressLine({ ort: "Berlin" })).toBe("Berlin");
    expect(contactAddressLine({})).toBe("");
  });

  it("schneidet Eingaben fuer die API zu", () => {
    expect(toContactPayload({ firma: "  Blitzblank  ", favorit: "on", unbekannt: "x" })).toMatchObject({ firma: "Blitzblank", name: "", bemerkung: "", favorit: true });
    expect(Object.keys(toContactPayload({}))).toEqual(["kategorie", "firma", "name", "vorname", "zustaendigkeit", "strasse", "plz", "ort", "telefon", "handy", "email", "webseite", "bemerkung", "favorit"]);
  });
});

describe("Adressverwaltung: Kategorien", () => {
  it("fasst Kategorien ohne Ruecksicht auf Gross-/Kleinschreibung zusammen", () => {
    expect(summarizeContactCategories([bezirksamt, musiker, band, vermieter])).toEqual([
      { label: "Bezirksamt", count: 1 },
      { label: "Musiker", count: 2 },
      { label: UNCATEGORIZED_LABEL, count: 1 }
    ]);
  });

  it("gruppiert nach Kategorie und stellt Favoriten nach vorn", () => {
    const groups = groupContactsByCategory([musiker, vermieter, band, bezirksamt]);

    expect(groups.map(group => group.label)).toEqual(["Bezirksamt", "Musiker", UNCATEGORIZED_LABEL]);
    expect(groups[1].contacts.map(contact => contact.id)).toEqual([3, 2]);
  });

  it("gibt bekannten Kategorien eine feste und freien eine stabile Farbe", () => {
    expect(contactCategoryColor("Musiker")).toBe(0);
    expect(contactCategoryColor("BEZIRKSAMT")).toBe(1);
    expect(contactCategoryColor("")).toBe(CONTACT_CATEGORY_COLORS - 1);
    expect(contactCategoryColor(UNCATEGORIZED_LABEL)).toBe(CONTACT_CATEGORY_COLORS - 1);
    const free = contactCategoryColor("Fotografen");
    expect(free >= 0 && free < CONTACT_CATEGORY_COLORS).toBe(true);
    expect(contactCategoryColor("fotografen")).toBe(free);
  });

  it("schlaegt feste und schon benutzte Kategorien vor", () => {
    const options = contactCategoryOptions([musiker, { kategorie: "Fotografen" }, { kategorie: "fotografen" }]);

    expect(options.slice(0, 2)).toEqual(["Musiker", "Bezirksamt"]);
    expect(options.filter(option => option.toLowerCase() === "fotografen")).toEqual(["Fotografen"]);
    expect(options.filter(option => option === "Musiker")).toEqual(["Musiker"]);
  });
});

describe("Adressverwaltung: Suche", () => {
  const contacts = [bezirksamt, musiker, band, vermieter];

  it("findet ueber alle Felder, ohne Akzente und mit mehreren Woertern", () => {
    expect(filterContacts(contacts, { search: "LÜBARS" }).map(contact => contact.id)).toEqual([3, 4]);
    expect(filterContacts(contacts, { search: "lubars" }).map(contact => contact.id)).toEqual([3, 4]);
    expect(filterContacts(contacts, { search: "bezirksamt sommer" }).map(contact => contact.id)).toEqual([1]);
    expect(filterContacts(contacts, { search: "0171" }).map(contact => contact.id)).toEqual([2]);
    expect(filterContacts(contacts, { search: "  " }).length).toBe(4);
  });

  it("filtert nach Kategorie und Favoriten", () => {
    expect(filterContacts(contacts, { category: "MUSIKER" }).map(contact => contact.id)).toEqual([2, 3]);
    expect(filterContacts(contacts, { category: UNCATEGORIZED_LABEL }).map(contact => contact.id)).toEqual([4]);
    expect(filterContacts(contacts, { favoritesOnly: true }).map(contact => contact.id)).toEqual([3]);
  });
});

describe("Adressverwaltung: Links", () => {
  it("waehlt Telefonnummern ohne Trennzeichen", () => {
    expect(phoneHref("030 / 902 94-0")).toBe("tel:030902940");
    expect(phoneHref("+49 (30) 123")).toBe("tel:+4930123");
    expect(phoneHref("ab 9 Uhr")).toBe("");
  });

  it("verlinkt nur http- und https-Adressen", () => {
    expect(websiteHref("www.example.org")).toBe("https://www.example.org/");
    expect(websiteHref("http://example.org/kontakt")).toBe("http://example.org/kontakt");
    expect(websiteHref("javascript:alert(1)")).toBe("");
    expect(websiteHref("")).toBe("");
    expect(websiteLabel("https://www.example.org/")).toBe("www.example.org");
  });

  it("sucht die Anschrift auf OpenStreetMap", () => {
    expect(mapHref(vermieter)).toBe("https://www.openstreetmap.org/search?query=Alt-L%C3%BCbars%208%2C%2013469%20Berlin");
    expect(mapHref(musiker)).toBe("");
  });
});

describe("Adressverwaltung: vCard", () => {
  it("schreibt alle gefuellten Felder und maskiert Sonderzeichen", () => {
    const vcard = toVCard({ ...bezirksamt, bemerkung: "Mo; Di\nnur vormittags", strasse: "Eichborndamm 215" });

    expect(vcard.split("\r\n")).toEqual([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Sommer;Petra;;;",
      "FN:Petra Sommer",
      "ORG:Bezirksamt Reinickendorf",
      "TITLE:Seniorenarbeit",
      "TEL;TYPE=WORK,VOICE:030 90294-0",
      "EMAIL;TYPE=INTERNET:p.sommer@example.org",
      "ADR;TYPE=WORK:;;Eichborndamm 215;Berlin;;;",
      "CATEGORIES:Bezirksamt",
      "NOTE:Mo\\; Di\\nnur vormittags",
      "END:VCARD"
    ]);
  });

  it("nimmt bei Firmen ohne Ansprechpartner den Firmennamen als Anzeigenamen", () => {
    expect(toVCard(band).split("\r\n")).toContain("FN:Alt-Lübarser Blaskapelle");
  });

  it("haengt mehrere Kontakte in eine Datei", () => {
    expect(toVCardFile([musiker, band]).match(/BEGIN:VCARD/g).length).toBe(2);
    expect(vCardFileName(band)).toBe("alt-lubarser-blaskapelle.vcf");
    expect(vCardFileName({})).toBe("kontakt.vcf");
  });
});
