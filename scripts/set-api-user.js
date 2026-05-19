"use strict";

const { upsertUser } = require("../server/user-repository");
const { pool } = require("../server/db");

const [, , username, password, role = "admin"] = process.argv;

if (!username || !password) {
  console.error("Usage: node scripts/set-api-user.js <username> <password> [role]");
  process.exit(1);
}

upsertUser({ username, password, role })
  .then(user => {
    console.log(`User gespeichert: ${user.username} (${user.role})`);
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
