import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  test: {
    // These suites use node:test and run separately in pnpm verify.
    exclude: [
      ...configDefaults.exclude,
      "scripts/room-artwork-quality/*.test.mjs",
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
