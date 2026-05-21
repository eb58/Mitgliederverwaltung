"use strict";

const fs = require("node:fs");
const path = require("node:path");

const [, , sourceArg, outputArg] = process.argv;

const usage = [
  "Usage:",
  "  node scripts/create-phpmyadmin-import.js <source.sql> [output.sql]",
  "",
  "Example:",
  "  node scripts/create-phpmyadmin-import.js db/changelog/db.changelog-master.sql db/import/schema.phpmyadmin.sql"
].join("\n");

if (!sourceArg) {
  console.error(usage);
  process.exit(1);
}

const sourcePath = path.resolve(sourceArg);
const outputPath = path.resolve(outputArg || sourcePath.replace(/\.sql$/i, ".phpmyadmin.sql"));
const source = fs.readFileSync(sourcePath, "utf8");
const lines = source.split(/\r?\n/);
const filtered = lines.filter(line => {
  const trimmed = line.trim();
  if (trimmed === "--liquibase formatted sql") return false;
  if (trimmed.startsWith("--changeset ")) return false;
  if (trimmed.startsWith("--rollback ")) return false;
  return true;
});

const output = [
  "-- Reine MySQL-Importdatei fuer phpMyAdmin.",
  `-- Quelle: ${path.relative(process.cwd(), sourcePath).replace(/\\/g, "/")}`,
  "-- Generiert ohne Liquibase-Kommandos.",
  "",
  "SET NAMES utf8mb4;",
  "SET FOREIGN_KEY_CHECKS = 0;",
  "",
  filtered.join("\n").trim(),
  "",
  "SET FOREIGN_KEY_CHECKS = 1;",
  ""
].join("\n");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output, "utf8");
console.log(`phpMyAdmin-Importdatei geschrieben: ${outputPath}`);
