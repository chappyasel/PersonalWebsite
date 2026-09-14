import config from "../eslint.config.mjs";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

const rules = config.find(
  (entry) => entry.rules?.["no-restricted-imports"],
).rules;
const linter = new Linter();
const navigationPolicy = config.find(
  (entry) => entry.name === "outlined-navigation-icons",
);
const lint = (code, filename = "src/example.tsx") =>
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
      navigationPolicy,
    ],
    { filename },
  );

describe("Phosphor icon policy", () => {
  it.each([
    'const icon = <StarIcon weight="fill" />;',
    'const icon = <StarIcon weight={"fill"} />;',
    'const icon = <StarIcon weight={selected ? "fill" : "bold"} />;',
    'const props = { weight: "fill" };',
    'const props = { "weight": selected ? "fill" : "regular" };',
    'const weight = selected ? "fill" : "bold";',
    'function icon(weight: IconWeight = "fill") {}',
    'phosphorPaths(StarIcon, "fill");',
  ])("allows functional fills while keeping navigation outlined: %s", (code) => {
    expect(lint(code)).toEqual([]);
    expect(
      lint(code, "src/app/components/stacks/dom/UnitRail.tsx").some(
        (issue) => issue.ruleId === "no-restricted-syntax",
      ),
    ).toBe(true);
  });

  it("allows outlined icons and SVG or canvas drawing fills", () => {
    expect(
      lint(`
      const icon = <StarIcon weight="bold" />;
      const props = { weight: selected ? "bold" : "regular" };
      const path = <path fill="currentColor" />;
      const mode = { kind: "fill" };
      context.fill();
    `),
    ).toEqual([]);
  });

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
