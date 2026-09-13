import config from "../eslint.config.mjs";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

const rules = config.find(
  (entry) => entry.rules?.["no-restricted-imports"],
).rules;
const linter = new Linter();
const lint = (code) =>
  linter.verify(
    code,
    [
      {
        files: ["**/*.tsx"],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        rules: {
          "no-restricted-syntax": rules["no-restricted-syntax"],
          "no-restricted-imports": rules["no-restricted-imports"],
        },
      },
    ],
    { filename: "src/example.tsx" },
  );

describe("Phosphor icon policy", () => {
  it.each([
    "const link = <a>Read more ↗</a>",
    "const link = <a>&rarr;</a>",
    "const link = <a>&#8594;</a>",
    'const link = <a>{"->"}</a>',
    'const link = <a>{active ? "↑" : "↓"}</a>',
    'import { ArrowRight } from "lucide-react";',
    'import { ArrowRightIcon } from "@heroicons/react/24/outline";',
  ])("rejects text arrows and competing icon imports: %s", (code) => {
    expect(
      lint(code).some((issue) => issue.ruleId?.startsWith("no-restricted-")),
    ).toBe(true);
  });

  it("accepts Phosphor icons, parser input, and comments", () => {
    expect(
      lint(`
      import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
      // Source text → preserved by the parser.
      const sourceArrow = /→/;
      const link = <a>Read more <ArrowRightIcon aria-hidden="true" /></a>;
    `),
    ).toEqual([]);
  });
});
