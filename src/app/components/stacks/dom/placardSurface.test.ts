import { effectivePlacardGlassMode } from "../scene/scenePerformance";
import { describe, expect, it } from "vitest";

import { PLACARD_PAPER_SURFACE_CSS, readCssRules } from "./placardSurface";

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
    const fill = declarations.get("--sheet-fill") ?? "";

    expect(declarations.get("background-color")).toBe(
      "var(--sheet-fill) !important",
    );
    // Any alpha here would put the scene back through the sheet, which is
    // exactly what paper mode exists to rule out.
    expect(fill).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
  });

  it("carries a dark fill dark enough to read light type on", () => {
    const dark = declarationsFor(
      '.dark [data-stacks-glass-mode="paper"] .stacks-sheet',
    );
    const channels = (value: string) =>
      [...value.matchAll(/\d+/g)].map((match) => Number(match[0]));

    const [lightFill] = [
      declarationsFor('[data-stacks-glass-mode="paper"] .stacks-sheet').get(
        "--sheet-fill",
      ) ?? "",
    ];
    expect(Math.max(...channels(dark.get("--sheet-fill") ?? ""))).toBeLessThan(
      Math.min(...channels(lightFill)),
    );
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
    for (const rule of RULES)
      for (const selector of rule.selectors)
        expect(selector).toContain('[data-stacks-glass-mode="paper"]');
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
});
