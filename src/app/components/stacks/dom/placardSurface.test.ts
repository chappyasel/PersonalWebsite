import { effectivePlacardGlassMode } from "../scene/scenePerformance";
import { describe, expect, it } from "vitest";

import { PLACARD_PAPER_SURFACE_CSS } from "./placardSurface";

type CssRule = Readonly<{
  selectors: readonly string[];
  declarations: ReadonlyMap<string, string>;
}>;

/**
 * Read a flat block of CSS into rules.
 *
 * Test support, not part of the module's interface: production ships the
 * stylesheet and never parses it back. Deliberately not a general parser
 * either. It handles the one shape this module emits, no nesting and no
 * at-rules, so these tests can ask what a selector actually declares instead
 * of matching formatted text. Multi-line values such as a stacked
 * `background-image` collapse onto one line.
 */
function readCssRules(css: string): readonly CssRule[] {
  return css
    .split("}")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.includes("{"))
    .map((chunk) => {
      const [prelude = "", body = ""] = chunk.split("{");
      const declarations = new Map<string, string>();
      for (const declaration of body.split(";")) {
        const separator = declaration.indexOf(":");
        if (separator === -1) continue;
        declarations.set(
          declaration.slice(0, separator).trim(),
          declaration
            .slice(separator + 1)
            .replace(/\s+/g, " ")
            .trim(),
        );
      }
      return {
        selectors: prelude
          .split(",")
          .map((selector) => selector.replace(/\s+/g, " ").trim())
          .filter(Boolean),
        declarations,
      };
    });
}

const RULES = readCssRules(PLACARD_PAPER_SURFACE_CSS);

const PAPER_SURFACES = [
  '[data-stacks-glass-mode="paper"] [data-stacks-desktop-panel] [data-placard-surface]',
  '[data-stacks-glass-mode="paper"] .stacks-sheet',
  '[data-stacks-glass-mode="paper"] .stacks-chip',
];

const declarationsFor = (selector: string) => {
  const merged = new Map<string, string>();
  for (const rule of RULES) {
    if (!rule.selectors.includes(selector)) continue;
    for (const [property, value] of rule.declarations)
      merged.set(property, value);
  }
  return merged;
};

/** An opaque `rgb(r g b)` fill, or null if the declaration is missing. */
const opaqueChannels = (value: string | undefined) => {
  const match = /^rgb\((\d+) (\d+) (\d+)\)$/.exec(value ?? "");
  return match ? match.slice(1, 4).map(Number) : null;
};

describe("the paper placard surface", () => {
  it.each(PAPER_SURFACES)(
    "removes the browser backdrop filter on %s",
    (selector) => {
      // This is the whole point of the comparison mode: no live blur over a
      // moving 3D scene. A prefixed survivor still costs the same work.
      const declarations = declarationsFor(selector);

      expect(declarations.get("backdrop-filter")).toBe("none !important");
      expect(declarations.get("-webkit-backdrop-filter")).toBe(
        "none !important",
      );
    },
  );

  it.each(PAPER_SURFACES)("gives %s an opaque fill", (selector) => {
    const declarations = declarationsFor(selector);

    expect(declarations.get("background-color")).toBe(
      "var(--sheet-fill) !important",
    );
    // Any alpha here would put the scene back through the sheet, which is
    // exactly what paper mode exists to rule out.
    expect(opaqueChannels(declarations.get("--sheet-fill"))).toHaveLength(3);
  });

  it("carries a dark fill dark enough to read light type on", () => {
    const light = opaqueChannels(
      declarationsFor('[data-stacks-glass-mode="paper"] .stacks-sheet').get(
        "--sheet-fill",
      ),
    );
    const dark = opaqueChannels(
      declarationsFor(
        '.dark [data-stacks-glass-mode="paper"] .stacks-sheet',
      ).get("--sheet-fill"),
    );

    // Both fills must exist before they can be compared. Reducing over an
    // empty parse yields -Infinity, which would let a deleted dark rule pass.
    expect(light).toHaveLength(3);
    expect(dark).toHaveLength(3);
    expect(Math.max(...dark!)).toBeLessThan(Math.min(...light!));
  });

  it("grains the sheet at two unrelated angles so it does not read as cloth", () => {
    const grain = declarationsFor(
      '[data-stacks-glass-mode="paper"] .stacks-sheet',
    ).get("background-image");
    const angles = [
      ...(grain ?? "").matchAll(/repeating-linear-gradient\((\d+)deg/g),
    ].map((match) => Number(match[1]));

    expect(angles).toHaveLength(2);
    expect(angles[0]).not.toBe(angles[1]);
    expect(grain).toContain("linear-gradient(180deg");
  });

  it("scopes every rule to the mode attribute, so switching back leaves nothing", () => {
    expect(RULES.length).toBeGreaterThan(0);
    for (const rule of RULES) {
      expect(rule.selectors.length).toBeGreaterThan(0);
      for (const selector of rule.selectors)
        expect(selector).toContain('[data-stacks-glass-mode="paper"]');
    }
  });

  it("is reachable from the automatic policy and from a manual choice", () => {
    // Without this the whole stylesheet is dead code.
    expect(effectivePlacardGlassMode("auto", true)).toBe("paper");
    expect(effectivePlacardGlassMode("paper", false)).toBe("paper");
    expect(effectivePlacardGlassMode("native", true)).toBe("native");
  });
});

describe("the flat CSS reader these tests rely on", () => {
  it("splits selectors and collapses multi-line values", () => {
    const [rule] = readCssRules(`
      a,
      b .c {
        color: red;
        background-image:
          one,
          two;
      }
    `);

    expect(rule?.selectors).toEqual(["a", "b .c"]);
    expect(rule?.declarations.get("color")).toBe("red");
    expect(rule?.declarations.get("background-image")).toBe("one, two");
  });

  it("finds nothing in a block with no rules, rather than inventing one", () => {
    expect(readCssRules("")).toEqual([]);
    expect(readCssRules("/* just a comment */")).toEqual([]);
  });
});
