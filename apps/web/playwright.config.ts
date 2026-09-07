import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    screenshot: "only-on-failure",
  },
  // Deliberately no `webServer` block  -  this suite drives the full,
  // already-running local stack (chain + api + web), not just the Next.js
  // dev server. See README.md "Running the E2E test".
  reporter: [["list"]],
});
