import fs from "node:fs";
import { describe, expect, it } from "vitest";

const homeSource = fs.readFileSync(
  new URL("./StacksHome.tsx", import.meta.url),
  "utf8",
);
const placardSource = fs.readFileSync(
  new URL("./dom/PlacardLayer.tsx", import.meta.url),
  "utf8",
);

describe("presentation chrome choreography", () => {
  it("never transforms the placard root that owns fixed-position content", () => {
    expect(homeSource).not.toContain(".stacks-placard-layer");
  });

  it("animates the positioned placard surfaces for both desktop and mobile", () => {
    expect(homeSource).toContain("[data-stacks-desktop-dock]");
    expect(homeSource).toContain("[data-stacks-details-toggle-shell]");
    expect(homeSource).toContain("[data-stacks-sheet-material]");
    expect(homeSource).toContain("[data-stacks-mobile-panel]");
    expect(placardSource).toContain('data-stacks-details-toggle-shell=""');
    expect(placardSource).toContain('data-stacks-mobile-panel-dim=""');
  });

  it("darkens the exposed room behind an expanded light-mode sheet", () => {
    expect(placardSource).toContain(
      'className="pointer-events-none fixed inset-0 z-30 bg-black/30 dark:bg-black/10"',
    );
    expect(placardSource).not.toContain("fixed inset-0 z-30 bg-background/10");
  });

  it("holds the light sheet above its dimmed room without bleaching its cards", () => {
    expect(placardSource).toContain(
      ".stacks-sheet {\n          --sheet-fill: rgb(255 255 255 / 0.28);",
    );
    expect(placardSource).toContain(
      "background-color: rgb(244 241 234 / 0.34) !important;",
    );
    expect(placardSource).toContain(
      'data-sheet={expanded ? "expanded" : hidden ? "dismissed" : "peek"}',
    );
    expect(placardSource).toContain(
      'html:not(.dark) .stacks-sheet[data-sheet="expanded"]',
    );
    expect(placardSource).toContain("--sheet-fill: rgb(255 255 255 / 0.36);");
    expect(placardSource).toContain("brightness(1.24)");
  });

  it("grows mobile placard type from phone to tablet scale", () => {
    expect(placardSource).toContain(
      "--ps: clamp(0.875rem, calc(0.718rem + 0.645vw), 1rem);",
    );
    expect(placardSource).toContain(
      ".placard-scroll .text-sm { font-size: var(--ps); line-height: 1.5; }",
    );
  });
});
