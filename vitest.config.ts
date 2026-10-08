import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      // These suites use node:test and run separately in pnpm verify.
      "scripts/room-artwork-quality/*.test.mjs",
      // These launch a headless Chromium, which CI does not install and the
      // code gate should not need. Run them with `pnpm test:browser-fixtures`.
      "**/*.browser.test.ts",
    ],
  },
  resolve: {
    alias: [
      { find: /^~~\//, replacement: `${fromRoot("./public")}/` },
      { find: /^public\//, replacement: `${fromRoot("./public")}/` },
      { find: /^~\//, replacement: `${fromRoot("./src")}/` },
      { find: /^@\//, replacement: `${fromRoot("./")}/` },
    ],
  },
});
