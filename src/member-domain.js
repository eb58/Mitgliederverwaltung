import {
  ERSTES_BEITRAGSJAHR,
  MEMBER_CLUB_ID,
  austrittsgrundMap,
  beitragsjahr,
  christmasChoiceMap,
  computerGroupPatterns,
  fieldDefinitions,
  funktionsMap,
  germanCollator,
  interestGroupMap
} from "./member-config.js";
import {
  asBoolean,
  calculateAge,
  formatCurrency,
  formatDateDE,
  formatIsoDate,
  normalizeGroupText,
  normalizePhotoFileName,
  parseIsoDate,
  parseLegacyCurrency,
  parseLegacyDate
} from "./member-utils.js";

export const istBeitragBezahlt = betrag => parseLegacyCurrency(betrag) > 0;

export const ZAHLUNG_FIELDS = ["gezahlterBetragClub", "einzahlungClubAm", "gezahlterBetragComputer", "einzahlungComputerAm"];
const normalizeZahlung = raw => ({
  beitragsjahr: Number(raw.beitragsjahr),
  gezahlterBetragClub: parseLegacyCurrency(raw.gezahlterBetragClub),
  einzahlungClubAm: parseLegacyDate(raw.einzahlungClubAm),
  gezahlterBetragComputer: parseLegacyCurrency(raw.gezahlterBetragComputer),
  einzahlungComputerAm: parseLegacyDate(raw.einzahlungComputerAm)
});
// Das aktuelle Jahr kommt aus den flachen Feldern - die zeigen Grid und Dashboard und gewinnen auch beim Speichern
export const zahlungenNachJahr = (member, aktuellesJahr = beitragsjahr) => new Map([
  ...(member.zahlungen || []).map(zahlung => [Number(zahlung.beitragsjahr), normalizeZahlung(zahlung)]),
  [aktuellesJahr, normalizeZahlung({ ...member, beitragsjahr: aktuellesJahr })]
]);
// Beitragsjahre fuer die Zahlungsuebersicht: ab dem ersten erfassten Jahr bis heute
export const angezeigteBeitragsjahre = (aktuellesJahr = beitragsjahr) =>
  Array.from({ length: Math.max(aktuellesJahr + 1 - ERSTES_BEITRAGSJAHR, 1) }, (_, index) => Math.min(ERSTES_BEITRAGSJAHR, aktuellesJahr) + index);
// art: "Club" oder "Computer"; ohne Eintrag fuer das Jahr gilt der Beitrag als offen (0)
export const beitragImJahr = (member, jahr, art, aktuellesJahr = beitragsjahr) =>
  zahlungenNachJahr(member, aktuellesJahr).get(jahr)?.[`gezahlterBetrag${art}`] ?? 0;
// Ab dem ersten erfassten Jahr bis zum Folgejahr (Vorauszahlungen), dazu alle Jahre mit Daten
export const beitragsjahrOptionen = (jahre = [], aktuellesJahr = beitragsjahr) => [...new Set([
  ...jahre,
  ...Array.from({ length: Math.max(aktuellesJahr + 2 - ERSTES_BEITRAGSJAHR, 1) }, (_, index) => ERSTES_BEITRAGSJAHR + index),
  aktuellesJahr + 1
])].sort((a, b) => a - b);

export const normalizeMember = raw => {
  const member = { ...raw };
  const numericId = Number(member.id);
  member.id = Number.isFinite(numericId) && numericId > 0 ? numericId : 0;
  member.name = (member.name || "").trim();
  member.vorname = (member.vorname || "").trim();
  member.geschlecht = member.geschlecht || "w";
  member.passbild = normalizePhotoFileName(member.passbild);
  member.strasse = member.strasse || "";
  member.plz = member.plz || "";
  member.ort = member.ort || "Berlin";
  member.telefon = member.telefon || "";
  member.handy = member.handy || "";
  member.email = member.email || "";
  member.geburtstag = parseLegacyDate(member.geburtstag);
  member.eintrittsdatum = parseLegacyDate(member.eintrittsdatum);
  member.austrittsdatum = parseLegacyDate(member.austrittsdatum);
  member.austrittsgrund = member.austrittsgrund === null || member.austrittsgrund === undefined || member.austrittsgrund === ""
    ? null
    : Number(member.austrittsgrund);
  member.interessengruppen = Array.isArray(member.interessengruppen)
    ? member.interessengruppen.map(Number).filter(id => Number.isFinite(id) && id > 0)
    : [];
  member.gruppenwahl = member.gruppenwahl || "";
  member.funktion = member.funktion || "";
  member.auswahl = asBoolean(member.auswahl);
  member.ausweisErteilt = asBoolean(member.ausweisErteilt);
  member.clubzugehoerigkeit = Number(member.clubzugehoerigkeit) || 0;
  member.weihnachtsessen = Number(member.weihnachtsessen) || 0;
  member.wnEssenBezahlt = asBoolean(member.wnEssenBezahlt);
  member.gezahlterBetragClub = parseLegacyCurrency(member.gezahlterBetragClub);
  member.beitragClubBezahlt = istBeitragBezahlt(member.gezahlterBetragClub);
  member.einzahlungClubAm = parseLegacyDate(member.einzahlungClubAm);
  member.gezahlterBetragComputer = parseLegacyCurrency(member.gezahlterBetragComputer);
  member.beitragComputerBezahlt = istBeitragBezahlt(member.gezahlterBetragComputer);
  member.einzahlungComputerAm = parseLegacyDate(member.einzahlungComputerAm);
  member.gezahlterBetragWeihnachten = parseLegacyCurrency(member.gezahlterBetragWeihnachten);
  member.bemerkung = member.bemerkung || "";
  member.tischnummer = Number(member.tischnummer) || 0;
  member.zahlungen = (Array.isArray(member.zahlungen) ? member.zahlungen : []).map(normalizeZahlung).sort((a, b) => b.beitragsjahr - a.beitragsjahr);
  return member;
};

export const cloneMember = member => !member ? null : structuredClone(member);

export const createEmptyMember = () => {
  const member = Object.fromEntries(fieldDefinitions.map(field => {
    if (field.type === "checkbox") return [field.key, false];
    if (field.type === "multiselect") return [field.key, []];
    if (field.type === "number" || field.type === "currency") return [field.key, 0];
    if (field.type === "select" || field.type === "radio" || field.type === "chips") return [field.key, field.key === "geschlecht" ? "w" : null];
    return [field.key, ""];
  }));
  return { ...member, ort: "Berlin", clubzugehoerigkeit: MEMBER_CLUB_ID, zahlungen: [] };
};

const hasExitReason = member => Boolean(austrittsgrundMap[Number(member.austrittsgrund)]);
export const isActiveMember = member => !member.austrittsdatum && !hasExitReason(member);
export const isGuestMember = member => Number(member?.clubzugehoerigkeit) !== MEMBER_CLUB_ID;
export const isOpenClubPaymentMember = member => !isGuestMember(member) && !asBoolean(member.beitragClubBezahlt);
export const getMemberInterestGroupText = member => (member?.interessengruppen || [])
  .map(groupId => interestGroupMap[groupId] || "")
  .join(" ");
export const getMemberFunctionIds = member => Array.isArray(member?.funktionen) && member.funktionen.length
  ? member.funktionen
  : String(member?.funktion || "").split(/[;,]/).map(Number).filter(id => Number.isFinite(id) && id > 0);
export const isComputerGroupMember = member => {
  const text = normalizeGroupText(getMemberInterestGroupText(member));
  return computerGroupPatterns.some(pattern => text.includes(pattern));
};
export const matchesPaymentMetricFilter = (member, filter) => {
  if (filter === "club-paid") return asBoolean(member.beitragClubBezahlt);
  if (filter === "computer-paid") return asBoolean(member.beitragComputerBezahlt);
  if (filter === "computer-open") return !asBoolean(member.beitragComputerBezahlt);
  return true;
};

export const formatInterestGroups = groupIds => !groupIds?.length
  ? ""
  : groupIds.map(id => interestGroupMap[id] || `ID ${id}`).join(", ");
export const formatFunctions = functionIds => !functionIds?.length
  ? ""
  : functionIds.map(id => funktionsMap[id] || `ID ${id}`).join(", ");
export const formatMemberName = member => `${member?.vorname || ""} ${member?.name || ""}`.trim() || "Mitglied";
export const formatDateTimeDE = value => {
  if (!value) return "";
  const date = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export const dateFormatter = params => formatDateDE(params.value);
export const currencyFormatter = params => formatCurrency(params.value);
export const interestGroupFormatter = params => formatInterestGroups(params.value);
export const christmasFormatter = params => christmasChoiceMap[Number(params.value)] || christmasChoiceMap[0];
export const compareIsoDateToFilterDate = (filterDate, cellValue) => {
  const cellDate = parseIsoDate(cellValue);
  if (!cellDate) return -1;
  const filter = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
  if (cellDate < filter) return -1;
  if (cellDate > filter) return 1;
  return 0;
};

export const getNewestMembers = (members, limit = 12) => members
  .filter(member => parseIsoDate(member.eintrittsdatum))
  .toSorted((a, b) => b.eintrittsdatum.localeCompare(a.eintrittsdatum)
    || germanCollator.compare(formatMemberName(a), formatMemberName(b)))
  .slice(0, limit);

const getDatesPerYear = (members, field, today, years) => {
  const yearCount = Math.max(0, Math.trunc(Number(years) || 0));
  const currentYear = today.getFullYear();
  const rows = Array.from({ length: yearCount }, (_, index) => ({
    year: currentYear - yearCount + index + 1,
    count: 0
  }));
  const rowByYear = new Map(rows.map(row => [row.year, row]));
  members.forEach(member => {
    const date = parseIsoDate(member[field]);
    const row = date && rowByYear.get(date.getFullYear());
    if (row) row.count += 1;
  });
  return rows;
};

export const getEntriesPerYear = (members, today = new Date(), years = 10) =>
  getDatesPerYear(members, "eintrittsdatum", today, years);

export const getExitsPerYear = (members, today = new Date(), years = 10) =>
  getDatesPerYear(members, "austrittsdatum", today, years);

export const getNextBirthday = (member, today = new Date()) => {
  if (!member.geburtstag || typeof member.geburtstag !== "string") return null;
  const [birthYear, month, day] = member.geburtstag.split("-").map(Number);
  if (![birthYear, month, day].every(Number.isFinite)) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const birthdayThisYear = new Date(start.getFullYear(), month - 1, day);
  const birthday = birthdayThisYear < start ? new Date(start.getFullYear() + 1, month - 1, day) : birthdayThisYear;
  return {
    member,
    birthday,
    daysUntil: Math.round((birthday - start) / 86400000),
    age: birthday.getFullYear() - birthYear,
    isoDate: `${birthday.getFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  };
};

export const getUpcomingBirthday = (member, today = new Date()) => {
  const birthday = getNextBirthday(member, today);
  return birthday && birthday.daysUntil <= 10 ? birthday : null;
};

export const getRoundBirthdays = (members, today = new Date()) => {
  const end = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate());
  return members
    .map(member => getNextBirthday(member, today))
    .filter(item => item && item.birthday <= end && item.age >= 80 && item.age % 5 === 0)
    .sort((a, b) => a.daysUntil - b.daysUntil || germanCollator.compare(formatMemberName(a.member), formatMemberName(b.member)));
};

// --- Plausibilitaetspruefung der Mitgliedsmaske ---
// errors blockieren das Speichern (der Server prueft dieselben Regeln), warnings lassen sich nach Rueckfrage uebergehen.
// Warnungen nur fuer geaenderte Felder, sonst meldet jede Bearbeitung alter Datensaetze dieselben Hinweise erneut.
export const MIN_MEMBER_AGE = 55;
const MAX_MEMBER_AGE = 105;
const DATE_FIELDS = { geburtstag: "Geburtstag", eintrittsdatum: "Eintrittsdatum", austrittsdatum: "Austrittsdatum", einzahlungClubAm: "Einzahlung Club", einzahlungComputerAm: "Einzahlung Computer" };
const AMOUNT_FIELDS = ["gezahlterBetragClub", "gezahlterBetragComputer", "gezahlterBetragWeihnachten", "tischnummer"];
const PAYMENT_DATE_FIELDS = ["einzahlungClubAm", "einzahlungComputerAm"];

const isValidIsoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Boolean(parseIsoDate(value)) && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2100;
export const isValidPlz = value => /^\d{5}$/.test(String(value ?? "").trim());
export const isValidEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? "").trim());
export const isValidPhone = value => /^\+?[\d\s/()-]+$/.test(String(value ?? "").trim()) && String(value).replace(/\D/g, "").length >= 5;
// Hausnummer am Ende der Strasse, z.B. "Zehntwerderweg 53 a" -> { number: 53, text: "53 a" }
export const parseHouseNumber = strasse => {
  const match = String(strasse ?? "").trim().match(/(\d+)\s*([a-zA-Z])?(?:\s*[-/]\s*\d+\s*[a-zA-Z]?)?$/);
  return match ? { number: Number(match[1]), text: match[0].trim() } : null;
};
const MAX_PLAUSIBLE_HOUSE_NUMBER = 500;
const nameKey = member => `${(member.name || "").trim().toLowerCase()}|${(member.vorname || "").trim().toLowerCase()}`;

export const validateMember = (member, { original = null, members = [], today = new Date() } = {}) => {
  const errors = [];
  const warnings = [];
  const error = (field, message) => errors.push({ field, message });
  const warn = (field, message) => warnings.push({ field, message });
  const changed = (...fields) => !original || fields.some(field => String(member[field] ?? "") !== String(original[field] ?? ""));
  const todayIso = formatIsoDate(today);

  if (!member.name) error("name", "Name ist ein Pflichtfeld.");
  if (!member.vorname) error("vorname", "Vorname ist ein Pflichtfeld.");

  Object.entries(DATE_FIELDS).forEach(([field, label]) => {
    if (member[field] && !isValidIsoDate(member[field])) error(field, `${label} ist kein gültiges Datum (Jahr 1900–2100).`);
  });
  const date = field => member[field] && isValidIsoDate(member[field]) ? member[field] : null;
  if (date("geburtstag") && date("geburtstag") > todayIso) error("geburtstag", "Geburtstag liegt in der Zukunft.");
  if (date("geburtstag") && date("eintrittsdatum") && date("eintrittsdatum") < date("geburtstag")) error("eintrittsdatum", "Eintritt liegt vor der Geburt.");
  if (date("eintrittsdatum") && date("austrittsdatum") && date("austrittsdatum") < date("eintrittsdatum")) error("austrittsdatum", "Austritt liegt vor dem Eintritt.");

  if (member.plz && !isValidPlz(member.plz)) error("plz", "PLZ muss aus genau 5 Ziffern bestehen.");
  if (member.email && !isValidEmail(member.email)) error("email", "Keine gültige E-Mail-Adresse.");
  AMOUNT_FIELDS.forEach(field => { if (Number(member[field]) < 0) error(field, "Darf nicht negativ sein."); });
  // Andere Beitragsjahre: Die Maske springt ueber "beitragsjahr" zum betroffenen Jahr
  (member.zahlungen || []).forEach(zahlung => ZAHLUNG_FIELDS.forEach(field => {
    const value = zahlung[field];
    const message = field in DATE_FIELDS
      ? value && !isValidIsoDate(value) && `${DATE_FIELDS[field]} ${zahlung.beitragsjahr} ist kein gültiges Datum (Jahr 1900–2100).`
      : Number(value) < 0 && `Darf für ${zahlung.beitragsjahr} nicht negativ sein.`;
    if (message) errors.push({ field, message, beitragsjahr: zahlung.beitragsjahr });
  }));

  const age = calculateAge(date("geburtstag"), today);
  if (age !== null && changed("geburtstag")) {
    if (age > MAX_MEMBER_AGE) warn("geburtstag", `Das Geburtsdatum ergibt ein Alter von ${age} Jahren.`);
    else if (age < MIN_MEMBER_AGE) warn("geburtstag", `Das Geburtsdatum ergibt ein Alter von ${age} Jahren.`);
  }
  if (changed("austrittsdatum", "austrittsgrund")) {
    if (member.austrittsdatum && !member.austrittsgrund) warn("austrittsgrund", "Austrittsdatum ohne Austrittsgrund.");
    if (!member.austrittsdatum && member.austrittsgrund) warn("austrittsdatum", "Austrittsgrund ohne Austrittsdatum.");
  }
  PAYMENT_DATE_FIELDS.forEach(field => {
    if (date(field) && date(field) > todayIso && changed(field)) warn(field, `${DATE_FIELDS[field]} liegt in der Zukunft.`);
  });
  ["telefon", "handy"].forEach(field => {
    if (member[field] && changed(field) && !isValidPhone(member[field])) warn(field, `${field === "telefon" ? "Telefon" : "Handy"} sieht nicht wie eine Telefonnummer aus.`);
  });
  if (member.strasse && changed("strasse", "plz", "ort")) {
    if (!member.plz) warn("plz", "PLZ fehlt.");
    if (!member.ort) warn("ort", "Ort fehlt.");
    const houseNumber = parseHouseNumber(member.strasse);
    if (!houseNumber) warn("strasse", "Hausnummer fehlt.");
    else if (houseNumber.number > MAX_PLAUSIBLE_HOUSE_NUMBER) warn("strasse", `Hausnummer ${houseNumber.text} ist ungewöhnlich hoch.`);
  }
  if (member.name && member.vorname && changed("name", "vorname", "geburtstag")) {
    const duplicate = members.find(other => other.id !== member.id && nameKey(other) === nameKey(member)
      && (!member.geburtstag || !other.geburtstag || other.geburtstag === member.geburtstag));
    if (duplicate) warn("name", `Es gibt bereits ${formatMemberName(duplicate)}${duplicate.geburtstag ? ` (geb. ${formatDateDE(duplicate.geburtstag)})` : ""}.`);
  }
  return { errors, warnings };
};
