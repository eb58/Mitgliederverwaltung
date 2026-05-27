"use strict";

const { pool } = require("./db");

const columnCache = new Map();

const definitions = {
  "interest-groups": { table: "interessengruppe", column: "bezeichnung", listKey: "interestGroups", labelKey: "label" },
  functions: { table: "funktion", column: "bezeichnung", listKey: "functions", labelKey: "label" },
  "exit-reasons": { table: "austrittsgrund", column: "bezeichnung", listKey: "exitReasons", labelKey: "label" },
  "senior-clubs": { table: "seniorenclub", column: "name", listKey: "seniorClubs", labelKey: "name" }
};

const getDefinition = type => {
  const definition = definitions[type];
  if (!definition) {
    const error = new Error("Unbekannte Stammdatenart.");
    error.statusCode = 404;
    throw error;
  }
  return definition;
};

const normalizeItem = (definition, row) => ({
  id: Number(row.id),
  [definition.labelKey]: row.label,
  label: row.label,
  active: Boolean(row.active)
});

const tableHasColumn = async (table, column) => {
  const key = `${table}.${column}`;
  if (columnCache.has(key)) return columnCache.get(key);

  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  const exists = Number(rows[0]?.count || 0) > 0;
  columnCache.set(key, exists);
  return exists;
};

const listReferenceItems = async (type, { includeInactive = false } = {}) => {
  const definition = getDefinition(type);
  const hasActiveColumn = await tableHasColumn(definition.table, "active");
  const activeSelect = hasActiveColumn ? "active" : "1 AS active";
  const where = includeInactive || !hasActiveColumn ? "" : " WHERE active = 1";
  const [rows] = await pool.execute(`SELECT id, ${definition.column} AS label, ${activeSelect} FROM ${definition.table}${where} ORDER BY id`);
  return rows.map(row => normalizeItem(definition, row));
};

const listReferenceData = async () => {
  const entries = await Promise.all(Object.entries(definitions).map(async ([type, definition]) => [
    definition.listKey,
    await listReferenceItems(type)
  ]));
  return Object.fromEntries(entries);
};

const assertValidItem = item => {
  if (!Number.isInteger(Number(item.id)) || Number(item.id) <= 0 || !String(item.label || item.name || "").trim()) {
    const error = new Error("ID und Bezeichnung sind erforderlich.");
    error.statusCode = 400;
    throw error;
  }
};

const createReferenceItem = async (type, item) => {
  const definition = getDefinition(type);
  assertValidItem(item);
  const label = String(item.label || item.name).trim();
  const hasActiveColumn = await tableHasColumn(definition.table, "active");
  const sql = hasActiveColumn
    ? `INSERT INTO ${definition.table} (id, ${definition.column}, active)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE ${definition.column} = VALUES(${definition.column}), active = 1`
    : `INSERT INTO ${definition.table} (id, ${definition.column})
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE ${definition.column} = VALUES(${definition.column})`;
  await pool.execute(sql, [Number(item.id), label]);
  return { id: Number(item.id), label, active: true };
};

const updateReferenceItem = async (type, id, item) => {
  const definition = getDefinition(type);
  const hasActiveColumn = await tableHasColumn(definition.table, "active");
  const label = String(item.label || item.name || "").trim();
  if (!label) {
    const error = new Error("Bezeichnung ist erforderlich.");
    error.statusCode = 400;
    throw error;
  }
  const activeSelect = hasActiveColumn ? "active" : "1 AS active";
  const [existing] = await pool.execute(`SELECT id, ${activeSelect} FROM ${definition.table} WHERE id = ?`, [id]);
  if (existing.length === 0) {
    const error = new Error("Stammdatensatz nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }
  const active = hasActiveColumn && Object.prototype.hasOwnProperty.call(item, "active") ? Boolean(item.active) : null;
  const values = active === null ? [label, id] : [label, active ? 1 : 0, id];
  const activeSql = active === null ? "" : ", active = ?";
  await pool.execute(`UPDATE ${definition.table} SET ${definition.column} = ?${activeSql} WHERE id = ?`, values);
  return { id, label, active: active ?? Boolean(existing[0].active) };
};

const deleteReferenceItem = async (type, id) => {
  const definition = getDefinition(type);
  if (!await tableHasColumn(definition.table, "active")) {
    const error = new Error("Stammdaten koennen erst deaktiviert werden, wenn die active-Spalten importiert wurden.");
    error.statusCode = 409;
    throw error;
  }
  const [result] = await pool.execute(`UPDATE ${definition.table} SET active = 0 WHERE id = ?`, [id]);
  return result.affectedRows > 0;
};

module.exports = {
  createReferenceItem,
  deleteReferenceItem,
  listReferenceData,
  listReferenceItems,
  updateReferenceItem
};
