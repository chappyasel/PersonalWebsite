import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^~~\//, replacement: `${fromRoot("./public")}/` },
      { find: /^~\//, replacement: `${fromRoot("./src")}/` },
      { find: /^@\//, replacement: `${fromRoot("./")}/` },
    ],
  },
});
