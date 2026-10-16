import { germanCollator } from "./member-config.js";
import { normalizeGroupText } from "./member-utils.js";

/**
 * Fachlogik der Adressverwaltung (Tabelle externe_kontakte): Musiker, Bezirksamt,
 * Reinigungsfirma, Vermieter und alle anderen Ansprechpartner ausserhalb des Clubs.
 */

// Feste Kategorien, zusaetzlich zu den schon benutzten waehlbar; weitere legt nur ein Admin an.
// Die Reihenfolge gibt die feste Farbe vor, damit "Musiker" nicht je nach Datenbestand die Farbe
// wechselt. Der Server kennt dieselbe Liste (EXTERNAL_CONTACT_CATEGORIES in server/lib.php).
export const CONTACT_CATEGORY_SUGGESTIONS = [
  "Musiker",
  "Bezirksamt",
  "Reinigung",
  "Vermieter",
  "Handwerker",
  "Catering",
  "Busunternehmen",
  "Referenten",
  "Presse",
  "Sonstiges"
];
export const CONTACT_CATEGORY_COLORS = CONTACT_CATEGORY_SUGGESTIONS.length;
export const UNCATEGORIZED_LABEL = "Ohne Kategorie";

export const CONTACT_TEXT_FIELDS = [
  "kategorie", "firma", "name", "vorname", "zustaendigkeit",
  "strasse", "plz", "ort", "telefon", "handy", "email", "webseite", "bemerkung"
];

const clean = value => String(value ?? "").trim();

export const toContactPayload = values => ({
  ...Object.fromEntries(CONTACT_TEXT_FIELDS.map(field => [field, clean(values?.[field])])),
  favorit: Boolean(values?.favorit)
});

export const contactPersonName = contact => [clean(contact?.vorname), clean(contact?.name)].filter(Boolean).join(" ");

// Firmen und Behoerden stehen unter ihrem Namen, Einzelpersonen unter "Vorname Name".
export const contactDisplayName = contact => clean(contact?.firma) || contactPersonName(contact);

export const contactInitials = contact => {
  const words = contactDisplayName(contact).split(/[\s\-–/&.,]+/).filter(word => /^\p{L}/u.test(word));
  const letters = (words.length > 1 ? [words[0], words[words.length - 1]] : words).map(word => word[0].toUpperCase());
  return letters.join("") || "?";
};

export const contactCategoryLabel = contact => clean(contact?.kategorie) || UNCATEGORIZED_LABEL;

// Bekannte Kategorien haben eine feste Farbe, freie Kategorien bekommen eine aus ihrem Namen
// abgeleitete - so bleibt die Farbe stabil, egal welche Kategorien sonst noch vorkommen.
export const contactCategoryColor = category => {
  const normalized = normalizeGroupText(clean(category));
  if (!normalized || normalized === normalizeGroupText(UNCATEGORIZED_LABEL)) return CONTACT_CATEGORY_COLORS - 1;
  const known = CONTACT_CATEGORY_SUGGESTIONS.findIndex(entry => normalizeGroupText(entry) === normalized);
  if (known >= 0) return known;
  let hash = 0;
  for (const char of normalized) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return hash % CONTACT_CATEGORY_COLORS;
};

export const compareContacts = (a, b) => Number(Boolean(b.favorit)) - Number(Boolean(a.favorit))
  || germanCollator.compare(contactDisplayName(a), contactDisplayName(b))
  || germanCollator.compare(contactPersonName(a), contactPersonName(b));

/** Kategorien mit Anzahl, alphabetisch; "Ohne Kategorie" steht immer am Ende. */
export const summarizeContactCategories = contacts => {
  const counts = new Map();
  contacts.forEach(contact => {
    const label = contactCategoryLabel(contact);
    const key = normalizeGroupText(label);
    const entry = counts.get(key) || { label, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  });
  return [...counts.values()].sort((a, b) =>
    Number(a.label === UNCATEGORIZED_LABEL) - Number(b.label === UNCATEGORIZED_LABEL)
    || germanCollator.compare(a.label, b.label));
};

/** Waehlbare Kategorien: die festen plus alle schon benutzten. */
export const contactCategoryOptions = contacts => {
  const options = new Map(CONTACT_CATEGORY_SUGGESTIONS.map(label => [normalizeGroupText(label), label]));
  contacts.forEach(contact => {
    const label = clean(contact?.kategorie);
    if (label && !options.has(normalizeGroupText(label))) options.set(normalizeGroupText(label), label);
  });
  return [...options.values()];
};

const searchableText = contact => normalizeGroupText(CONTACT_TEXT_FIELDS.map(field => contact?.[field] ?? "").join(" "));

/** Alle Suchwoerter muessen irgendwo im Kontakt vorkommen ("bezirksamt sommer"). */
export const filterContacts = (contacts, { search = "", category = null, favoritesOnly = false } = {}) => {
  const words = normalizeGroupText(search).split(/\s+/).filter(Boolean);
  const categoryKey = category === null ? null : normalizeGroupText(category);
  return contacts.filter(contact =>
    (!favoritesOnly || contact.favorit)
    && (categoryKey === null || normalizeGroupText(contactCategoryLabel(contact)) === categoryKey)
    && words.every(word => searchableText(contact).includes(word)));
};

/** Gruppen fuer die Anzeige: je Kategorie eine, darin Favoriten zuerst. */
export const groupContactsByCategory = contacts => summarizeContactCategories(contacts).map(({ label }) => ({
  label,
  color: contactCategoryColor(label),
  contacts: contacts
    .filter(contact => normalizeGroupText(contactCategoryLabel(contact)) === normalizeGroupText(label))
    .sort(compareContacts)
}));

export const contactAddressLine = contact => [clean(contact?.strasse), [clean(contact?.plz), clean(contact?.ort)].filter(Boolean).join(" ")]
  .filter(Boolean)
  .join(", ");

// "030 / 123 45-67" waehlt das Telefon nur ohne Leer- und Trennzeichen.
export const phoneHref = value => {
  const digits = clean(value).replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return digits.replace(/\D/g, "").length >= 3 ? `tel:${digits}` : "";
};

// Nur http(s): ein "javascript:"-Link aus dem Datenbestand darf nicht klickbar werden.
export const websiteHref = value => {
  const text = clean(value);
  if (!text) return "";
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

export const websiteLabel = value => clean(value).replace(/^https?:\/\//i, "").replace(/\/$/, "");

export const mapHref = contact => {
  const address = contactAddressLine(contact);
  return address ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}` : "";
};

const escapeVCard = value => clean(value)
  .replace(/\\/g, "\\\\")
  .replace(/\r?\n/g, "\\n")
  .replace(/([,;])/g, "\\$1");

/** vCard 3.0 - laesst sich in Outlook, Android und iPhone als Kontakt importieren. */
export const toVCard = contact => {
  const person = contactPersonName(contact);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVCard(contact.name)};${escapeVCard(contact.vorname)};;;`,
    `FN:${escapeVCard(person || contactDisplayName(contact))}`,
    clean(contact.firma) && `ORG:${escapeVCard(contact.firma)}`,
    clean(contact.zustaendigkeit) && `TITLE:${escapeVCard(contact.zustaendigkeit)}`,
    clean(contact.telefon) && `TEL;TYPE=WORK,VOICE:${escapeVCard(contact.telefon)}`,
    clean(contact.handy) && `TEL;TYPE=CELL:${escapeVCard(contact.handy)}`,
    clean(contact.email) && `EMAIL;TYPE=INTERNET:${escapeVCard(contact.email)}`,
    websiteHref(contact.webseite) && `URL:${escapeVCard(websiteHref(contact.webseite))}`,
    contactAddressLine(contact) && `ADR;TYPE=WORK:;;${escapeVCard(contact.strasse)};${escapeVCard(contact.ort)};;${escapeVCard(contact.plz)};`,
    clean(contact.kategorie) && `CATEGORIES:${escapeVCard(contact.kategorie)}`,
    clean(contact.bemerkung) && `NOTE:${escapeVCard(contact.bemerkung)}`,
    "END:VCARD"
  ];
  return lines.filter(Boolean).join("\r\n");
};

export const toVCardFile = contacts => `${contacts.map(toVCard).join("\r\n")}\r\n`;

export const vCardFileName = contact => `${normalizeGroupText(contactDisplayName(contact)).replace(/[^a-z\d]+/g, "-").replace(/^-|-$/g, "") || "kontakt"}.vcf`;
