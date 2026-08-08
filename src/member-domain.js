import {
  MEMBER_CLUB_ID,
  austrittsgrundMap,
  christmasChoiceMap,
  computerGroupPatterns,
  fieldDefinitions,
  funktionsMap,
  germanCollator,
  interestGroupMap
} from "./member-config.js";
import {
  asBoolean,
  ensureMinimumAge,
  formatCurrency,
  formatDateDE,
  normalizeGroupText,
  normalizePhotoFileName,
  parseIsoDate,
  parseLegacyCashAmount,
  parseLegacyCurrency,
  parseLegacyDate
} from "./member-utils.js";

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
  member.geburtstag = ensureMinimumAge(parseLegacyDate(member.geburtstag));
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
  member.beitragClubBezahlt = asBoolean(member.beitragClubBezahlt);
  member.betragClubBar = parseLegacyCashAmount(member.betragClubBar, member.gezahlterBetragClub);
  member.beitragComputerBezahlt = asBoolean(member.beitragComputerBezahlt);
  member.betragComputerBar = parseLegacyCashAmount(member.betragComputerBar, member.gezahlterBetragComputer);
  member.gezahlterBetragClub = parseLegacyCurrency(member.gezahlterBetragClub);
  member.einzahlungClubAm = parseLegacyDate(member.einzahlungClubAm);
  member.gezahlterBetragComputer = parseLegacyCurrency(member.gezahlterBetragComputer);
  member.einzahlungComputerAm = parseLegacyDate(member.einzahlungComputerAm);
  member.gezahlterBetragWeihnachten = parseLegacyCurrency(member.gezahlterBetragWeihnachten);
  member.bemerkung = member.bemerkung || "";
  member.tischnummer = Number(member.tischnummer) || 0;
  return member;
};

export const cloneMember = member => !member ? null : structuredClone(member);

export const createEmptyMember = nextId => {
  const member = Object.fromEntries(fieldDefinitions.map(field => {
    if (field.type === "checkbox") return [field.key, false];
    if (field.type === "multiselect") return [field.key, []];
    if (field.type === "number" || field.type === "currency") return [field.key, field.key === "id" ? nextId : 0];
    if (field.type === "select" || field.type === "radio") return [field.key, field.key === "geschlecht" ? "w" : null];
    return [field.key, ""];
  }));
  return { ...member, ort: "Berlin", clubzugehoerigkeit: MEMBER_CLUB_ID };
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
