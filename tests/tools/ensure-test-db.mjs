// Faehrt die Test-Datenbank hoch, damit die PHP-Integrationstests nicht
// unbemerkt uebersprungen werden. Fehlt Docker, laeuft die Suite trotzdem
// weiter - dann aber mit einer Warnung, die man nicht uebersieht.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const composeFile = join(dirname(dirname(fileURLToPath(import.meta.url))), "docker-compose.test.yml");

const warn = reason => {
  console.warn([
    "",
    "!".repeat(72),
    "  ACHTUNG: Test-Datenbank nicht verfuegbar.",
    `  Grund: ${reason}`,
    "  Die Integrationstests der API-Handler werden UEBERSPRUNGEN.",
    "  Aenderungen an server/lib.php sind damit ungeprueft.",
    "!".repeat(72),
    ""
  ].join("\n"));
};

const result = spawnSync("docker", ["compose", "-f", composeFile, "up", "-d", "--wait"], { encoding: "utf8" });

if (result.error?.code === "ENOENT") warn("Docker ist nicht installiert bzw. nicht im PATH.");
else if (result.status !== 0) warn(`docker compose up ist fehlgeschlagen.\n  ${(result.stderr || "").trim().split("\n").join("\n  ")}`);
else console.log("Test-Datenbank bereit (mv-test-db, Port 3307).");
