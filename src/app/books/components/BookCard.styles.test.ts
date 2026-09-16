import { loadBindings } from "next/dist/build/swc";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

describe("compiled book card blur", () => {
  it.each([false, true])(
    "retains Chrome's backdrop-filter after Next CSS compilation, minify=%s",
    async (minify) => {
      const bindings = await loadBindings();
      const result = (await bindings.css.lightning.transform({
        filename: "BookCard.module.css",
        code: readFileSync(new URL("./BookCard.module.css", import.meta.url)),
        minify,
        targets: { chrome: 120 << 16 },
      })) as { code: Uint8Array };
      const compiled = postcss.parse(Buffer.from(result.code).toString());
      for (const band of ["soft", "medium", "deep"]) {
        const filters: string[] = [];
        compiled.walkRules(`.${band}`, (rule) => {
          rule.walkDecls("backdrop-filter", (declaration) => {
            filters.push(declaration.value);
          });
        });
        expect(filters).toEqual([`var(--book-blur-${band})`]);
      }
    },
  );
});
