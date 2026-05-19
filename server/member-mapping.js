"use strict";

const memberFields = [
  ["id", "id"],
  ["name", "name"],
  ["vorname", "vorname"],
  ["geschlecht", "geschlecht"],
  ["passbild", "passbild"],
  ["strasse", "strasse"],
  ["plz", "plz"],
  ["ort", "ort"],
  ["telefon", "telefon"],
  ["handy", "handy"],
  ["email", "email"],
  ["geburtstag", "geburtstag"],
  ["eintrittsdatum", "eintrittsdatum"],
  ["austrittsdatum", "austrittsdatum"],
  ["austrittsgrund", "austrittsgrund_id"],
  ["gruppenwahl", "gruppenwahl"],
  ["funktion", "funktion_rohdaten"],
  ["auswahl", "auswahl"],
  ["ausweisErteilt", "ausweis_erteilt"],
  ["clubzugehoerigkeit", "clubzugehoerigkeit_id"],
  ["weihnachtsessen", "weihnachtsessen"],
  ["wnEssenBezahlt", "wn_essen_bezahlt"],
  ["beitragClubBezahlt", "beitrag_club_bezahlt"],
  ["betragClubBar", "betrag_club_bar"],
  ["beitragComputerBezahlt", "beitrag_computer_bezahlt"],
  ["betragComputerBar", "betrag_computer_bar"],
  ["preisClub", "preis_club"],
  ["gezahlterBetragClub", "gezahlter_betrag_club"],
  ["einzahlungClubAm", "einzahlung_club_am"],
  ["preisComputer", "preis_computer"],
  ["gezahlterBetragComputer", "gezahlter_betrag_computer"],
  ["einzahlungComputerAm", "einzahlung_computer_am"],
  ["preisWeihnachten", "preis_weihnachten"],
  ["gezahlterBetragWeihnachten", "gezahlter_betrag_weihnachten"],
  ["bemerkung", "bemerkung"],
  ["tischnummer", "tischnummer"]
];

const booleanFields = new Set([
  "auswahl",
  "ausweisErteilt",
  "wnEssenBezahlt",
  "beitragClubBezahlt",
  "beitragComputerBezahlt"
]);

const dateFields = new Set([
  "geburtstag",
  "eintrittsdatum",
  "austrittsdatum",
  "einzahlungClubAm",
  "einzahlungComputerAm"
]);

const numberFields = new Set([
  "id",
  "austrittsgrund",
  "clubzugehoerigkeit",
  "weihnachtsessen",
  "betragClubBar",
  "betragComputerBar",
  "preisClub",
  "gezahlterBetragClub",
  "preisComputer",
  "gezahlterBetragComputer",
  "preisWeihnachten",
  "gezahlterBetragWeihnachten",
  "tischnummer"
]);

const nullableNumberFields = new Set(["austrittsgrund", "clubzugehoerigkeit"]);
const jsonOnlyFields = new Set(["interessengruppen", "funktionen"]);
const columnByJsonKey = new Map(memberFields.map(([jsonKey, column]) => [jsonKey, column]));

const formatDate = value => {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
};

const toBoolean = value => value === true || value === 1 || value === "1";

const toNumberOrNull = value => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeArray = values => Array.isArray(values)
  ? [...new Set(values.map(value => Number(value)).filter(value => Number.isFinite(value) && value > 0))]
  : [];

const normalizeFunctionIds = value => String(value || "")
  .split(";")
  .map(item => item.trim())
  .filter(Boolean)
  .map(Number)
  .filter(value => Number.isFinite(value) && value > 0);

const normalizeMemberInput = (payload, { partial = false } = {}) => {
  const input = payload && typeof payload === "object" ? payload : {};
  const member = {};

  for (const [jsonKey] of memberFields) {
    if (partial && !Object.prototype.hasOwnProperty.call(input, jsonKey)) continue;

    if (booleanFields.has(jsonKey)) {
      member[jsonKey] = toBoolean(input[jsonKey]);
    } else if (dateFields.has(jsonKey)) {
      member[jsonKey] = input[jsonKey] || null;
    } else if (numberFields.has(jsonKey)) {
      const value = toNumberOrNull(input[jsonKey]);
      member[jsonKey] = nullableNumberFields.has(jsonKey)
        ? (value && value > 0 ? value : null)
        : value || 0;
    } else {
      member[jsonKey] = input[jsonKey] === null || input[jsonKey] === undefined ? "" : String(input[jsonKey]);
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(input, "interessengruppen")) {
    member.interessengruppen = normalizeArray(input.interessengruppen);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(input, "funktionen") || Object.prototype.hasOwnProperty.call(input, "funktion")) {
    member.funktionen = Object.prototype.hasOwnProperty.call(input, "funktionen")
      ? normalizeArray(input.funktionen)
      : normalizeFunctionIds(input.funktion);
  }

  return member;
};

const rowToMember = row => {
  const member = {};
  for (const [jsonKey, column] of memberFields) {
    const value = row[column];
    if (booleanFields.has(jsonKey)) {
      member[jsonKey] = Boolean(value);
    } else if (dateFields.has(jsonKey)) {
      member[jsonKey] = formatDate(value);
    } else if (numberFields.has(jsonKey)) {
      member[jsonKey] = value === null || value === undefined ? null : Number(value);
    } else {
      member[jsonKey] = value === null || value === undefined ? "" : value;
    }
  }
  member.interessengruppen = row.interessengruppen ? row.interessengruppen.split(",").map(Number) : [];
  member.funktionen = row.funktionen ? row.funktionen.split(",").map(Number) : [];
  member.hasPassbildInDb = Boolean(row.has_passbild_in_db);
  return member;
};

module.exports = {
  columnByJsonKey,
  jsonOnlyFields,
  memberFields,
  normalizeMemberInput,
  rowToMember
};
