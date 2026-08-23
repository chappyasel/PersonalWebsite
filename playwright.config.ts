import { defineConfig, devices } from "@playwright/test";

const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: remoteBaseUrl ?? "http://localhost:3111",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
  },
  webServer: remoteBaseUrl
    ? undefined
    : {
        command: "pnpm start -p 3111",
        url: "http://localhost:3111",
        env: {
          AUTH_TRUST_HOST: "true",
          NEXTAUTH_URL: "http://localhost:3111",
        },
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
