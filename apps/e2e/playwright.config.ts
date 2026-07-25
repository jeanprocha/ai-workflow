import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  globalSetup: require.resolve("./global-setup.ts"),
  use: {
    baseURL,
    // "on-first-retry" nunca gera trace localmente (retries: 0 fora do CI) —
    // "retain-on-failure" grava sempre e so mantem o trace de quem falhou,
    // dando diagnostico completo (Fase 7) mesmo rodando local sem retry.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
