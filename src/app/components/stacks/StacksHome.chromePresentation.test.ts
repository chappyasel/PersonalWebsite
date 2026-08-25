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
});
