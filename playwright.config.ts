import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:3111",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "yarn start -p 3111",
    url: "http://localhost:3111",
    env: {
      AUTH_TRUST_HOST: "true",
      NEXTAUTH_URL: "http://localhost:3111",
    },
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
