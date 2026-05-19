"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const [, , membersFileArg, outputFileArg] = process.argv;

const usage = [
  "Usage:",
  "  node scripts/create-mysql-data-changelog.js <members.json> [output.sql]",
  "",
  "Example:",
  "  node scripts/create-mysql-data-changelog.js C:\\Daten\\members.json db\\changelog\\data\\members.mysql.sql"
].join("\n");

if (!membersFileArg) {
  console.error(usage);
  process.exit(1);
}

const membersFilePath = path.resolve(membersFileArg);
const outputFilePath = path.resolve(outputFileArg || "db/changelog/data/members.mysql.sql");
const passbilderDirectoryPath = path.join(path.dirname(membersFilePath), "Passbilder");

const readMembers = filePath => {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.members)) return parsed.members;
  throw new Error("members.json enthaelt kein members-Array.");
};

const sqlString = value => {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
};

const sqlText = value => `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
const sqlNumber = value => Number.isFinite(Number(value)) ? String(Number(value)) : "0";
const sqlNullableNumber = value => value === null || value === undefined || value === "" ? "NULL" : sqlNumber(value);
const sqlNullablePositiveNumber = value => Number(value) > 0 ? sqlNumber(value) : "NULL";
const sqlBoolean = value => value === true || value === 1 || value === "1" || value === "true" || value === "ja" ? "1" : "0";

const sqlDate = value => {
  if (!value) return "NULL";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return sqlString(text);
  const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return "NULL";
  const [, day, month, year] = match;
  return sqlString(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
};

const normalizePhotoFileName = value => {
  const text = String(value || "").trim();
  if (!text) return "";
  return path.basename(text.replaceAll("\\", path.sep));
};

const getMemberPhotoFileNames = member => {
  const configured = normalizePhotoFileName(member.passbild);
  const name = String(member.name || "").trim();
  const vorname = String(member.vorname || "").trim();
  return [
    configured,
    name && vorname ? `${name} ${vorname}.jpg` : "",
    name && vorname ? `${vorname} ${name}.jpg` : "",
    name ? `${name}.jpg` : ""
  ].filter(Boolean);
};

const findPhoto = (member, fileNameByLowerName) => {
  const matched = getMemberPhotoFileNames(member)
    .map(fileName => fileNameByLowerName.get(fileName.toLowerCase()))
    .find(Boolean);
  return matched ? path.join(passbilderDirectoryPath, matched) : null;
};

const getMimeType = filePath => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
};

const row = values => `  (${values.join(", ")})`;
const createChunkedInsertStatements = (tableName, insertColumns, rows, chunkSize = 25) => {
  if (rows.length === 0) return [];

  const statements = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    statements.push(`INSERT INTO ${tableName} (${insertColumns.join(", ")}) VALUES\n${chunk.join(",\n")};`);
  }
  return statements;
};

const createMemberInsert = member => {
  const values = [
    sqlNumber(member.id),
    sqlText(member.name),
    sqlText(member.vorname),
    sqlString(member.geschlecht || "w"),
    sqlString(normalizePhotoFileName(member.passbild)),
    sqlText(member.strasse),
    sqlText(member.plz),
    sqlText(member.ort || "Berlin"),
    sqlText(member.telefon),
    sqlText(member.handy),
    sqlText(member.email),
    sqlDate(member.geburtstag),
    sqlDate(member.eintrittsdatum),
    sqlDate(member.austrittsdatum),
    sqlNullablePositiveNumber(member.austrittsgrund),
    sqlText(member.gruppenwahl),
    sqlText(member.funktion),
    sqlBoolean(member.auswahl),
    sqlBoolean(member.ausweisErteilt),
    sqlNullablePositiveNumber(member.clubzugehoerigkeit),
    sqlNumber(member.weihnachtsessen),
    sqlBoolean(member.wnEssenBezahlt),
    sqlBoolean(member.beitragClubBezahlt),
    sqlNumber(member.betragClubBar),
    sqlBoolean(member.beitragComputerBezahlt),
    sqlNumber(member.betragComputerBar),
    sqlNumber(member.preisClub),
    sqlNumber(member.gezahlterBetragClub),
    sqlDate(member.einzahlungClubAm),
    sqlNumber(member.preisComputer),
    sqlNumber(member.gezahlterBetragComputer),
    sqlDate(member.einzahlungComputerAm),
    sqlNumber(member.preisWeihnachten),
    sqlNumber(member.gezahlterBetragWeihnachten),
    sqlString(member.bemerkung),
    sqlNumber(member.tischnummer)
  ];
  return row(values);
};

const createInterestRows = member => {
  if (!Array.isArray(member.interessengruppen)) return [];
  return member.interessengruppen
    .map(value => Number(value))
    .filter(Number.isFinite)
    .map(groupId => row([sqlNumber(member.id), sqlNumber(groupId)]));
};

const createFunctionRows = member => String(member.funktion || "")
  .split(";")
  .map(value => value.trim())
  .filter(Boolean)
  .map(value => Number(value))
  .filter(Number.isFinite)
  .map(functionId => row([sqlNumber(member.id), sqlNumber(functionId)]));

const createPhotoInsert = (member, photoPath) => {
  const bytes = fs.readFileSync(photoPath);
  const fileName = path.basename(photoPath);
  return row([
    sqlNumber(member.id),
    sqlText(fileName),
    sqlText(getMimeType(photoPath)),
    sqlNumber(bytes.length),
    sqlText(crypto.createHash("sha256").update(bytes).digest("hex")),
    `FROM_BASE64(${sqlText(bytes.toString("base64"))})`
  ]);
};

const members = readMembers(membersFilePath);
const photoFileNames = fs.existsSync(passbilderDirectoryPath) ? fs.readdirSync(passbilderDirectoryPath) : [];
const fileNameByLowerName = new Map(photoFileNames.map(fileName => [fileName.toLowerCase(), fileName]));
const validMembers = members.filter(member => Number.isFinite(Number(member.id)) && Number(member.id) > 0);
const memberRows = validMembers.map(createMemberInsert);
const interestRows = validMembers.flatMap(createInterestRows);
const functionRows = validMembers.flatMap(createFunctionRows);
const photoRows = validMembers
  .map(member => [member, findPhoto(member, fileNameByLowerName)])
  .filter(([, photoPath]) => photoPath)
  .map(([member, photoPath]) => createPhotoInsert(member, photoPath));
const importedIds = validMembers.map(member => sqlNumber(member.id)).join(", ");

const columns = [
  "id", "name", "vorname", "geschlecht", "passbild", "strasse", "plz", "ort", "telefon", "handy", "email",
  "geburtstag", "eintrittsdatum", "austrittsdatum", "austrittsgrund_id", "gruppenwahl", "funktion_rohdaten",
  "auswahl", "ausweis_erteilt", "clubzugehoerigkeit_id", "weihnachtsessen", "wn_essen_bezahlt",
  "beitrag_club_bezahlt", "betrag_club_bar", "beitrag_computer_bezahlt", "betrag_computer_bar",
  "preis_club", "gezahlter_betrag_club", "einzahlung_club_am", "preis_computer",
  "gezahlter_betrag_computer", "einzahlung_computer_am", "preis_weihnachten",
  "gezahlter_betrag_weihnachten", "bemerkung", "tischnummer"
];
const photoColumns = ["mitglied_id", "dateiname", "mime_type", "groesse_bytes", "sha256", "inhalt"];
const photoInsertStatements = createChunkedInsertStatements("mitglied_passbild", photoColumns, photoRows, 20);

const sections = [
  "--liquibase formatted sql",
  "",
  "--changeset codex:data-members context:data dbms:mysql",
  memberRows.length
    ? [
      `INSERT INTO mitglied (${columns.join(", ")}) VALUES`,
      `${memberRows.join(",\n")}`,
      "ON DUPLICATE KEY UPDATE",
      columns.filter(column => column !== "id").map(column => `  ${column} = VALUES(${column})`).join(",\n") + ";"
    ].join("\n")
    : "-- Keine Mitglieder gefunden.",
  "",
  importedIds ? `DELETE FROM mitglied_interessengruppe WHERE mitglied_id IN (${importedIds});` : "-- Keine Interessengruppen zu loeschen.",
  interestRows.length ? `INSERT INTO mitglied_interessengruppe (mitglied_id, interessengruppe_id) VALUES\n${interestRows.join(",\n")};` : "-- Keine Interessengruppen gefunden.",
  "",
  importedIds ? `DELETE FROM mitglied_funktion WHERE mitglied_id IN (${importedIds});` : "-- Keine Funktionen zu loeschen.",
  functionRows.length ? `INSERT INTO mitglied_funktion (mitglied_id, funktion_id) VALUES\n${functionRows.join(",\n")};` : "-- Keine Funktionen gefunden.",
  "",
  importedIds ? `DELETE FROM mitglied_passbild WHERE mitglied_id IN (${importedIds});` : "-- Keine Passbilder zu loeschen.",
  photoInsertStatements.length ? photoInsertStatements.join("\n\n") : "-- Keine Passbilder gefunden.",
  "",
  importedIds ? `--rollback DELETE FROM mitglied_passbild WHERE mitglied_id IN (${importedIds});` : "--rollback SELECT 1;",
  importedIds ? `--rollback DELETE FROM mitglied_funktion WHERE mitglied_id IN (${importedIds});` : "--rollback SELECT 1;",
  importedIds ? `--rollback DELETE FROM mitglied_interessengruppe WHERE mitglied_id IN (${importedIds});` : "--rollback SELECT 1;",
  importedIds ? `--rollback DELETE FROM mitglied WHERE id IN (${importedIds});` : "--rollback SELECT 1;"
];

fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
fs.writeFileSync(outputFilePath, `${sections.join("\n")}\n`, "utf8");

console.log(`Mitglieder: ${validMembers.length}`);
console.log(`Interessengruppen-Zuordnungen: ${interestRows.length}`);
console.log(`Funktions-Zuordnungen: ${functionRows.length}`);
console.log(`Passbilder: ${photoRows.length}`);
console.log(`Geschrieben: ${outputFilePath}`);
