"use strict";

const { pool } = require("./db");
const { hashPassword, verifyPassword } = require("./passwords");

const findUserByUsername = async username => {
  const [rows] = await pool.execute(
    `SELECT id, username, password_hash, role, active
     FROM app_user
     WHERE username = ?`,
    [username]
  );
  return rows[0] || null;
};

const authenticateUser = async (username, password) => {
  const user = await findUserByUsername(username);
  if (!user || !user.active) return null;
  if (!await verifyPassword(password, user.password_hash)) return null;

  return {
    id: user.id,
    username: user.username,
    role: user.role
  };
};

const upsertUser = async ({ username, password, role = "admin", active = true }) => {
  const passwordHash = await hashPassword(password);
  await pool.execute(
    `INSERT INTO app_user (username, password_hash, role, active)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       role = VALUES(role),
       active = VALUES(active)`,
    [username, passwordHash, role, active ? 1 : 0]
  );
  const user = await findUserByUsername(username);
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    active: Boolean(user.active)
  };
};

const listUsers = async () => {
  const [rows] = await pool.execute("SELECT id, username, role, active FROM app_user ORDER BY username");
  return rows.map(row => ({
    id: row.id,
    username: row.username,
    role: row.role,
    active: Boolean(row.active)
  }));
};

const findUserById = async id => {
  const [rows] = await pool.execute("SELECT id, username, role, active FROM app_user WHERE id = ?", [id]);
  const user = rows[0];
  return user ? {
    id: user.id,
    username: user.username,
    role: user.role,
    active: Boolean(user.active)
  } : null;
};

const createUser = async ({ username, password, role = "admin", active = true }) => {
  if (!username || !password) {
    const error = new Error("Benutzername und Passwort sind erforderlich.");
    error.statusCode = 400;
    throw error;
  }
  const [result] = await pool.execute(
    "INSERT INTO app_user (username, password_hash, role, active) VALUES (?, ?, ?, ?)",
    [username, await hashPassword(password), role || "admin", active ? 1 : 0]
  );
  return findUserById(result.insertId);
};

const updateUser = async (id, { password = "", role = "admin", active = true }) => {
  if (password) {
    await pool.execute(
      "UPDATE app_user SET password_hash = ?, role = ?, active = ? WHERE id = ?",
      [await hashPassword(password), role || "admin", active ? 1 : 0, id]
    );
  } else {
    await pool.execute(
      "UPDATE app_user SET role = ?, active = ? WHERE id = ?",
      [role || "admin", active ? 1 : 0, id]
    );
  }
  return findUserById(id);
};

const deactivateUser = async id => {
  const [result] = await pool.execute("UPDATE app_user SET active = 0 WHERE id = ?", [id]);
  return result.affectedRows > 0;
};

module.exports = {
  authenticateUser,
  createUser,
  deactivateUser,
  findUserById,
  listUsers,
  updateUser,
  upsertUser
};
