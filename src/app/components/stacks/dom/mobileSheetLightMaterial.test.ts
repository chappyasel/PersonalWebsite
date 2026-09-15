import { describe, expect, it } from "vitest";

import { MOBILE_SHEET_LIGHT_MATERIAL_CSS } from "./mobileSheetLightMaterial";

/** Split a selector list on its own commas, leaving the ones inside `:is()`
 * and friends where they are. A plain `split(",")` tears
 * `:is(.stacks-sheet, .stacks-chip)` in half and reports the fragment as a
 * selector of its own. */
function splitSelectorList(prelude: string): readonly string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of prelude) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts.map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** Every selector in the sheet, with comments and wrapping media queries
 * stripped. Test support, not a general parser: it handles the one shape this
 * module emits, at-rules that only ever wrap and never carry declarations of
 * their own. Dropping each `@media (...) {` up front leaves a flat
 * stylesheet, and the at-rule's own closing brace leaves a chunk with no
 * selector in it. */
function selectors(css: string): readonly string[] {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@media[^{]*\{/g, "")
    .split("}")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.includes("{"))
    .flatMap((chunk) => splitSelectorList(chunk.split("{")[0] ?? ""));
}

const SELECTORS = selectors(MOBILE_SHEET_LIGHT_MATERIAL_CSS);

describe("the light mobile sheet material", () => {
  it("ships by default rather than behind a flag", () => {
    // The experiment's opt-in attribute and query parameter are both gone.
    // A material this is the only path to must not be reachable only by
    // typing something into the URL.
    expect(MOBILE_SHEET_LIGHT_MATERIAL_CSS).not.toContain("mobile-glass");
    expect(MOBILE_SHEET_LIGHT_MATERIAL_CSS).not.toContain("prototype");
    expect(SELECTORS.length).toBeGreaterThan(0);
  });

  it("stays inside the three conditions that make it correct", () => {
    // Phones only: the desktop dock owns its own plates.
    expect(MOBILE_SHEET_LIGHT_MATERIAL_CSS).toContain(
      "@media (width < 1200px)",
    );
    for (const selector of SELECTORS) {
      // Daylight only: night already has a dark shell.
      expect(selector.startsWith("html:not(.dark) ")).toBe(true);
      // Never over the diagnostic paper mode, which is deliberately opaque.
      expect(selector).toContain('[data-stacks-glass-mode="native"]');
    }
  });

  it("leaves the room's ordinary ink on the cards", () => {
    // The panel turns its own chrome white; the cards have to put the light
    // theme's foreground back, and can only do that from a value captured
    // above the panel.
    expect(MOBILE_SHEET_LIGHT_MATERIAL_CSS).toContain(
      "--mobile-card-foreground: var(--foreground);",
    );
    expect(MOBILE_SHEET_LIGHT_MATERIAL_CSS).toContain(
      "--foreground: var(--mobile-card-foreground);",
    );
  });

  it("keeps the sheet the only surface sampling the room", () => {
    // Cards are a flat fill over the sheet's blur. A second backdrop-filter
    // here would sample the sheet's own composited output, which is the
    // stacking that made these cards read opaque in the first place.
    const cardRules = MOBILE_SHEET_LIGHT_MATERIAL_CSS.split("}").filter(
      (chunk) =>
        chunk.includes("[data-placard-surface]") &&
        chunk.includes("background-color"),
    );
    expect(cardRules.length).toBeGreaterThan(0);
    for (const rule of cardRules) expect(rule).not.toContain("backdrop-filter");
  });

  it("lifts a hovered card instead of sinking it", () => {
    // The shared narrow-width tint was authored for the pale sheet and reads
    // as a hole over this shell. Direction is the whole point of the
    // override, so pin the comparison rather than either number.
    const alphaOf = (state: "rest" | "hover") =>
      Number(
        /hsl\(var\(--card\) \/ ([\d.]+)\)/.exec(
          MOBILE_SHEET_LIGHT_MATERIAL_CSS.split("}").find(
            (chunk) =>
              chunk.includes("[data-placard-surface]") &&
              chunk.includes("background-color") &&
              chunk.includes(":hover") === (state === "hover"),
          ) ?? "",
        )?.[1],
      );
    expect(alphaOf("hover")).toBeGreaterThan(alphaOf("rest"));
  });
});
