import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chromeSource = readFileSync(
  new URL("./ChromeLayer.tsx", import.meta.url),
  "utf8",
);
const railSource = readFileSync(
  new URL("./UnitRail.tsx", import.meta.url),
  "utf8",
);
const placardSource = readFileSync(
  new URL("./PlacardLayer.tsx", import.meta.url),
  "utf8",
);

describe("desktop first-load entrance", () => {
  it("establishes the name before the navigation and utility controls", () => {
    expect(chromeSource).toContain('"--stacks-reveal-delay"');
    expect(chromeSource).toContain("animation-delay: 440ms");
    expect(chromeSource).toContain("animation-delay: 800ms");
    expect(chromeSource).toContain("animation-delay: 150ms");
    expect(chromeSource).toContain("animation-delay: 360ms");
  });

  it("reveals the desktop rail top-to-bottom and draws the initial indicator", () => {
    expect(railSource).toContain(
      '"--stacks-desktop-rail-delay": `${i * 40}ms`',
    );
    expect(railSource).toContain(
      '"--stacks-desktop-rail-warm-delay": `${i * 24}ms`',
    );
    expect(railSource).toContain(
      '"--stacks-desktop-indicator-delay": `${initialActiveUnit * 40}ms`',
    );
    expect(railSource).toContain("stacks-desktop-rail-item-in 420ms");
    expect(railSource).toContain("stacks-desktop-rail-indicator-in 360ms");
  });

  it("animates only the initial resident placard and releases normal swaps", () => {
    expect(placardSource).toContain(
      "const [initialActiveUnit] = useState(activeUnit)",
    );
    expect(placardSource).toContain(
      "data-stacks-initial-panel={initial || undefined}",
    );
    expect(placardSource).toContain("stacks-desktop-placard-heading-in 400ms");
    expect(placardSource).toContain("stacks-desktop-placard-card-in 480ms");
    expect(placardSource).toContain("700ms backwards");
    expect(placardSource).not.toContain(
      "stacks-desktop-placard-card-in 480ms\n              var(--stacks-ease, ease-out) 700ms forwards",
    );
  });

  it("keeps reduced motion in the final readable state", () => {
    expect(railSource).toContain(".stacks-unit-rail-desktop .stacks-rail-row");
    expect(railSource).toContain("scale: 1;");
    expect(placardSource).toContain(
      "[data-stacks-desktop-panel][data-stacks-initial-panel]",
    );
    expect(placardSource).toContain(
      "opacity: var(--stacks-panel-opacity) !important",
    );
    expect(placardSource).toContain("animation: none !important");
  });
});
