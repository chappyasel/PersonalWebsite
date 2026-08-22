import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { SCENE_BACKDROP, sceneBackdropFor } from "./sceneBackdrop";

const canvas = fs.readFileSync(
  new URL("../StacksCanvas.tsx", import.meta.url),
  "utf8",
);

const stopsOf = (gradient: string) =>
  [...gradient.matchAll(/rgb\((\d+) (\d+) (\d+)\) (\d+)%/g)].map((m) => ({
    rgb: [Number(m[1]), Number(m[2]), Number(m[3])] as const,
    at: Number(m[4]),
  }));

describe("scene backdrop", () => {
  it("is painted behind the canvas, not merely defined", () => {
    expect(canvas).toContain("sceneBackdropFor");
    expect(canvas).toMatch(/background: sceneBackdropFor\(dark\)/);
  });

  it("follows the theme", () => {
    expect(sceneBackdropFor(false)).toBe(SCENE_BACKDROP.light);
    expect(sceneBackdropFor(true)).toBe(SCENE_BACKDROP.dark);
    expect(SCENE_BACKDROP.light).not.toBe(SCENE_BACKDROP.dark);
  });

  // The whole point is that nothing shows through it. A stop carrying alpha,
  // or the keyword `transparent`, would put the page's near-white paper back
  // underneath and restore the flash this exists to remove.
  it.each(["light", "dark"] as const)("is fully opaque in %s", (theme) => {
    const gradient = SCENE_BACKDROP[theme];
    expect(gradient).not.toMatch(/rgba|transparent|hsla/);
    expect(stopsOf(gradient).length).toBeGreaterThan(1);
  });

  // A gradient that starts below 0% or ends above 100% leaves the remainder
  // painted with the nearest stop, which is fine; one that is out of order
  // silently renders as a different ramp than it reads as.
  it.each(["light", "dark"] as const)("spans top to bottom in %s", (theme) => {
    const stops = stopsOf(SCENE_BACKDROP[theme]);
    expect(stops[0]!.at).toBe(0);
    expect(stops.at(-1)!.at).toBe(100);
    const positions = stops.map((s) => s.at);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  // Sampled from the rendered frame, so the ramp must actually descend from
  // sky to ground rather than being a flat wash: the top stop is well clear
  // of the bottom one in both themes.
  it.each(["light", "dark"] as const)(
    "reads as sky over ground in %s",
    (theme) => {
      const stops = stopsOf(SCENE_BACKDROP[theme]);
      const blueness = (s: (typeof stops)[number]) => s.rgb[2] - s.rgb[1];
      expect(blueness(stops[0]!)).toBeGreaterThan(blueness(stops.at(-1)!));
    },
  );

  // Physical iPhone testing disproved the opaque-context workaround: the same
  // missed frame became black, and preserving the buffer did not make a DPR
  // reallocation atomic. Keep alpha so this backdrop is the fallback pixels.
  it("keeps the scene backdrop reachable through the canvas alpha channel", () => {
    expect(canvas).toContain("gl={{ antialias: true, stencil: true }}");
    expect(canvas).not.toContain("createOpaqueSceneContext(");
    expect(canvas).not.toMatch(/alpha:\s*false/);
  });
});
