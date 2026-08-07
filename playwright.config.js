import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173/mitgliederverwaltung/";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    channel: process.platform === "win32" ? "msedge" : undefined,
    screenshot: "only-on-failure",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
