"use strict";

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const config = {
  server: {
    host: process.env.MEMBER_API_HOST || "127.0.0.1",
    port: toNumber(process.env.MEMBER_API_PORT, 3001)
  },
  auth: {
    sessionTtlMs: toNumber(process.env.MEMBER_API_SESSION_TTL_MS, 12 * 60 * 60 * 1000)
  },
  database: {
    host: process.env.MEMBER_DB_HOST || "127.0.0.1",
    port: toNumber(process.env.MEMBER_DB_PORT, 3306),
    user: process.env.MEMBER_DB_USER || "wp_user",
    password: process.env.MEMBER_DB_PASSWORD || "passwd",
    database: process.env.MEMBER_DB_NAME || "mitgliederverwaltung",
    waitForConnections: true,
    connectionLimit: toNumber(process.env.MEMBER_DB_CONNECTION_LIMIT, 10),
    charset: "utf8mb4"
  }
};

module.exports = config;
