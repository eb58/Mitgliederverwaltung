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

module.exports = {
  authenticateUser,
  upsertUser
};
