import fs from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The seam monstera between About and Books opts out of ADR 0020 entirely.
 *
 * It is the largest thing on screen at 2.71 units, it is scenery rather than an
 * Identity Prop, and its `atlasOverride` gives it the one PRIVATE material
 * among the furniture — so it was the only oversized prop actually receiving
 * the emissive half of glow while the shared-atlas ones got the swell alone.
 * A tree brightening because a pointer crossed it reads as a bug.
 */
describe("seam monstera", () => {
  it("takes no hover reaction at all", () => {
    const source = fs.readFileSync(
      new URL("./Scene.tsx", import.meta.url),
      "utf8",
    );
    const start = source.indexOf('url="/models/monstera.glb"');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = source.indexOf("/>", start);
    expect(source.slice(start, end)).toContain("hover={false}");
  });
});
