import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const chromeSource = read("./ChromeLayer.tsx");
const helpSource = read("./ChromeKeyboardHelp.tsx");
const fieldNotesSource = read("../fieldNotes/FieldNotesChrome.tsx");
const railSource = read("./UnitRail.tsx");

describe("mobile chrome presentation", () => {
  it("centers the wordmark and scene controls on one shared top strip", () => {
    expect(chromeSource).toContain("--stacks-mobile-top-strip-start");
    expect(chromeSource).toContain("--stacks-mobile-top-strip-height");
    expect(chromeSource).toMatch(
      /\.stacks-wordmark,\s*\.stacks-theme-toggle\s*\{[\s\S]*?top: var\(--stacks-mobile-top-strip-start\);[\s\S]*?min-height: var\(--stacks-mobile-top-strip-height\);[\s\S]*?align-items: center;/,
    );
    expect(chromeSource).not.toContain(
      "top: max(1rem, env(safe-area-inset-top, 0px));",
    );
  });

  it("dims only tap-first secondary chrome while leaving section navigation full strength", () => {
    expect(chromeSource).toContain(
      "--stacks-secondary-chrome-idle-opacity: 0.6;",
    );
    expect(chromeSource).toContain(
      "opacity: var(--stacks-secondary-chrome-idle-opacity, 1);",
    );
    expect(chromeSource).toContain("data-tap-first={tapFirst || undefined}");
    expect(chromeSource).toContain("stacks-mobile-secondary-chrome");
    expect(helpSource).toContain("stacks-mobile-secondary-chrome");
    expect(fieldNotesSource).toContain("stacks-mobile-secondary-chrome");
    expect(chromeSource).toMatch(
      /\.stacks-mobile-secondary-chrome:(?:focus-visible|active)[\s\S]*?opacity: 1;/,
    );
    expect(railSource).not.toContain("stacks-mobile-secondary-chrome");
  });
});
