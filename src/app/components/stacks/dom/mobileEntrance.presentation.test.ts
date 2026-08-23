import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const railSource = readFileSync(
  new URL("./UnitRail.tsx", import.meta.url),
  "utf8",
);
const placardSource = readFileSync(
  new URL("./PlacardLayer.tsx", import.meta.url),
  "utf8",
);
const cameraSource = readFileSync(
  new URL("../scene/CameraRig.tsx", import.meta.url),
  "utf8",
);

describe("mobile first-load entrance", () => {
  it("resolves the active navigation item before farther destinations", () => {
    expect(railSource).toContain(
      '"--stacks-mobile-rail-delay": `${Math.abs(i - activeUnit) * 30}ms`',
    );
    expect(railSource).toContain("stacks-mobile-rail-item-in 400ms");
    expect(railSource).toContain("stacks-mobile-rail-indicator-in 360ms");
  });

  it("stretches the mobile indicator toward its destination with two springs", () => {
    expect(railSource).toContain("function ElasticMobileIndicator");
    expect(railSource).toContain("const leadingEdge = movingForward");
    expect(railSource).toContain("const trailingEdge = movingForward");
    expect(railSource).toContain('type: "spring"');
    expect(railSource).toContain("delay: 0.035");
    expect(railSource).toContain("if (reduceMotion)");
  });

  it("uses the canonical Golf URL as the sole ball state", () => {
    expect(railSource).not.toContain("hidden={golfFocused}");
    expect(railSource).not.toContain("golfTargeted");
    expect(railSource).toContain("const currentHash = useSyncExternalStore");
    expect(railSource).toMatch(
      /const showGolfBall =\s+currentHash === "#golf"/,
    );
    expect(railSource).toContain("data-stacks-golf-ball={golfBall");
    expect(railSource).toContain("const GOLF_BALL_DIAMETER_REM = 0.75");
    expect(railSource).toContain("radial-gradient(circle at 31% 30%");
    expect(cameraSource).not.toContain("setGolfTargeted");
  });

  it("compresses both the rail and sheet choreography on warm loads", () => {
    expect(railSource).toContain(
      '.stacks-world-shell[data-load-path="warm"][data-revealed]',
    );
    expect(railSource).toContain("animation-delay: 240ms");
    expect(placardSource).toContain(
      '.stacks-world-shell[data-load-path="warm"][data-revealed]',
    );
    expect(placardSource).toContain("animation-delay: 220ms");
    expect(placardSource).toContain("animation-delay: 310ms");
  });

  it("moves the material and interaction layers together before revealing content", () => {
    expect(placardSource).toMatch(
      /data-stacks-sheet-material=""\s+data-stacks-mobile-intro="sheet"/,
    );
    expect(placardSource).toMatch(
      /data-stacks-mobile-panel=""\s+data-stacks-mobile-intro="sheet"/,
    );
    expect(placardSource).toContain('data-stacks-mobile-intro="header"');
    expect(placardSource).toContain('data-stacks-mobile-intro="body"');
    expect(placardSource).toContain("stacks-mobile-sheet-in 480ms");
    expect(placardSource).toContain("stacks-mobile-sheet-header-in 360ms");
    expect(placardSource).toContain("stacks-mobile-sheet-body-in 420ms");
  });

  it("shows the final mobile state immediately for reduced motion", () => {
    expect(railSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(railSource).toContain("animation: none;");
    expect(placardSource).toContain("[data-stacks-mobile-intro]");
    expect(placardSource).toContain("translate: 0 0 !important");
    expect(placardSource).toContain("animation: none !important");
  });
});
