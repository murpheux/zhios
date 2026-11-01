import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Fixed, fake OIDC settings — e2e specs seed a matching fake session into
    // sessionStorage (e2e/helpers.ts) rather than driving a real IdP's login UI.
    env: {
      VITE_OIDC_AUTHORITY: "https://test-issuer.example.com",
      VITE_OIDC_CLIENT_ID: "test-client",
    },
  },
});
