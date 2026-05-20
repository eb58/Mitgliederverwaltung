"use strict";

const crypto = require("node:crypto");
const { pool, withTransaction } = require("./db");
const {
  columnByJsonKey,
  jsonOnlyFields,
  memberFields,
  normalizeMemberInput,
  rowToMember
} = require("./member-mapping");

const baseSelect = `
  SELECT
    m.*,
    (
      SELECT GROUP_CONCAT(mi.interessengruppe_id ORDER BY mi.interessengruppe_id)
      FROM mitglied_interessengruppe mi
      WHERE mi.mitglied_id = m.id
    ) AS interessengruppen,
    (
      SELECT GROUP_CONCAT(mf.funktion_id ORDER BY mf.funktion_id)
      FROM mitglied_funktion mf
      WHERE mf.mitglied_id = m.id
    ) AS funktionen,
    EXISTS (
      SELECT 1
      FROM mitglied_passbild mp
      WHERE mp.mitglied_id = m.id
    ) AS has_passbild_in_db
  FROM mitglied m
`;

const assertKnownFields = payload => {
  const allowed = new Set([...columnByJsonKey.keys(), ...jsonOnlyFields]);
  const unknown = Object.keys(payload || {}).filter(key => !allowed.has(key));
  if (unknown.length > 0) {
    const error = new Error(`Unbekannte Felder: ${unknown.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
};

const assertValidMember = member => {
  if (!member.name || !member.vorname) {
    const error = new Error("name und vorname sind Pflichtfelder.");
    error.statusCode = 400;
    throw error;
  }
  if (!["m", "w"].includes(member.geschlecht)) {
    const error = new Error("geschlecht muss 'm' oder 'w' sein.");
    error.statusCode = 400;
    throw error;
  }
};

const getNextId = async connection => {
  const [rows] = await connection.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM mitglied");
  return Number(rows[0].next_id);
};

const syncJoinTable = async (connection, table, idColumn, memberId, ids) => {
  await connection.execute(`DELETE FROM ${table} WHERE mitglied_id = ?`, [memberId]);
  if (!Array.isArray(ids) || ids.length === 0) return;

  const placeholders = ids.map(() => "(?, ?)").join(", ");
  const values = ids.flatMap(id => [memberId, id]);
  await connection.execute(`INSERT INTO ${table} (mitglied_id, ${idColumn}) VALUES ${placeholders}`, values);
};

const buildMemberInsert = member => {
  const fields = memberFields.filter(([jsonKey]) => jsonKey !== "id");
  const columns = ["id", ...fields.map(([, column]) => column)];
  const values = [member.id, ...fields.map(([jsonKey]) => member[jsonKey])];
  const placeholders = columns.map(() => "?").join(", ");
  return {
    sql: `INSERT INTO mitglied (${columns.join(", ")}) VALUES (${placeholders})`,
    values
  };
};

const buildMemberUpdate = member => {
  const entries = Object.keys(member)
    .filter(key => columnByJsonKey.has(key) && key !== "id")
    .map(key => [key, columnByJsonKey.get(key)]);
  const assignments = entries.map(([, column]) => `${column} = ?`).join(", ");
  return {
    sql: `UPDATE mitglied SET ${assignments} WHERE id = ?`,
    values: [...entries.map(([key]) => member[key]), member.id],
    hasAssignments: entries.length > 0
  };
};

const findMembers = async ({ search = "", limit = 50, offset = 0 } = {}) => {
  const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const parsedOffset = Math.max(Number(offset) || 0, 0);
  const params = [];
  const where = [];

  if (search.trim()) {
    const value = `%${search.trim()}%`;
    where.push("(m.name LIKE ? OR m.vorname LIKE ? OR m.email LIKE ? OR m.telefon LIKE ? OR m.handy LIKE ?)");
    params.push(value, value, value, value, value);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await pool.execute(
    `${baseSelect}
     ${whereSql}
     ORDER BY m.name, m.vorname
     LIMIT ? OFFSET ?`,
    [...params, parsedLimit, parsedOffset]
  );
  return rows.map(rowToMember);
};

const findMemberById = async id => {
  const [rows] = await pool.execute(
    `${baseSelect}
     WHERE m.id = ?`,
    [id]
  );
  return rows[0] ? rowToMember(rows[0]) : null;
};

const createMember = async payload => {
  assertKnownFields(payload);
  const member = normalizeMemberInput(payload);
  assertValidMember(member);

  const memberId = await withTransaction(async connection => {
    member.id = member.id > 0 ? member.id : await getNextId(connection);
    const insert = buildMemberInsert(member);
    await connection.execute(insert.sql, insert.values);
    await syncJoinTable(connection, "mitglied_interessengruppe", "interessengruppe_id", member.id, member.interessengruppen);
    await syncJoinTable(connection, "mitglied_funktion", "funktion_id", member.id, member.funktionen);
    return member.id;
  });
  return findMemberById(memberId);
};

const updateMember = async (id, payload) => {
  assertKnownFields(payload);
  const existing = await findMemberById(id);
  if (!existing) return null;

  const patch = normalizeMemberInput(payload, { partial: true });
  const member = { ...existing, ...patch, id };
  assertValidMember(member);

  await withTransaction(async connection => {
    const update = buildMemberUpdate({ ...patch, id });
    if (update.hasAssignments) {
      await connection.execute(update.sql, update.values);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "interessengruppen")) {
      await syncJoinTable(connection, "mitglied_interessengruppe", "interessengruppe_id", id, patch.interessengruppen);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "funktionen")) {
      await syncJoinTable(connection, "mitglied_funktion", "funktion_id", id, patch.funktionen);
    }
  });
  return findMemberById(id);
};

const deleteMember = async id => {
  const [result] = await pool.execute("DELETE FROM mitglied WHERE id = ?", [id]);
  return result.affectedRows > 0;
};

const getMemberPhoto = async id => {
  const [rows] = await pool.execute(
    "SELECT dateiname, mime_type, groesse_bytes, sha256, inhalt FROM mitglied_passbild WHERE mitglied_id = ?",
    [id]
  );
  return rows[0] || null;
};

const upsertMemberPhoto = async (id, { fileName, mimeType, content }) => {
  const existing = await findMemberById(id);
  if (!existing) return null;

  const sha256 = crypto.createHash("sha256").update(content).digest("hex");
  await pool.execute(
    `INSERT INTO mitglied_passbild (mitglied_id, dateiname, mime_type, groesse_bytes, sha256, inhalt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       dateiname = VALUES(dateiname),
       mime_type = VALUES(mime_type),
       groesse_bytes = VALUES(groesse_bytes),
       sha256 = VALUES(sha256),
       inhalt = VALUES(inhalt)`,
    [id, fileName, mimeType, content.length, sha256, content]
  );
  await pool.execute(
    "UPDATE mitglied SET passbild = ? WHERE id = ?",
    [fileName, id]
  );
  return { id, fileName, mimeType, size: content.length, sha256 };
};

const deleteMemberPhoto = async id => {
  const [result] = await pool.execute("DELETE FROM mitglied_passbild WHERE mitglied_id = ?", [id]);
  return result.affectedRows > 0;
};

module.exports = {
  createMember,
  deleteMember,
  deleteMemberPhoto,
  findMemberById,
  findMembers,
  getMemberPhoto,
  updateMember,
  upsertMemberPhoto
};
