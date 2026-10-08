import { defineConfig } from "vitest/config";

/**
 * Tests that drive a real headless Chromium against local fixture pages. They
 * are kept out of the unit suite (see vitest.config.ts) because they need a
 * Playwright browser installed and take a minute or more.
 */
export default defineConfig({
  test: {
    include: ["scripts/**/*.browser.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
