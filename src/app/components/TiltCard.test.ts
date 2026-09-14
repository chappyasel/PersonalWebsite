import { describe, expect, it } from "vitest";

import {
  CARD_MAX_TILT_DEG,
  CARD_MAX_TILT_DEPTH_PX,
  cardHoverTilt,
  tiltCardHoverEnabled,
} from "./tiltCardMotion";

describe("TiltCard hover capability", () => {
  it("requires both fine hover and motion permission", () => {
    expect(tiltCardHoverEnabled(false, true)).toBe(true);
    expect(tiltCardHoverEnabled(false, false)).toBe(false);
    expect(tiltCardHoverEnabled(true, true)).toBe(false);
  });
});

describe("card tilt limits", () => {
  it("keeps large cards quieter than small cards and rests flat at the center", () => {
    const small = cardHoverTilt(100, 0, 200, 100);
    const large = cardHoverTilt(300, 0, 600, 1000);
    expect(small.rotateY).toBe(CARD_MAX_TILT_DEG);
    expect(large.rotateY).toBeLessThan(1);
    expect(cardHoverTilt(0, 0, 600, 1000).rotateY).toBe(0);
    expect(cardHoverTilt(100, 0, 200, 100, 1).rotateY).toBe(1);
  });

  it("caps combined corner tilt and depth even when the pointer moves outside a card", () => {
    for (const [width, height] of [
      [200, 100],
      [600, 1000],
      [1200, 1800],
    ]) {
      for (const x of [-2, -1, 0, 1, 2]) {
        for (const y of [-2, -1, 0, 1, 2]) {
          const tilt = cardHoverTilt(
            x * width!,
            y * height!,
            width!,
            height!,
            20,
          );
          expect(Math.hypot(tilt.rotateX, tilt.rotateY)).toBeLessThanOrEqual(
            CARD_MAX_TILT_DEG + 1e-9,
          );
          const rx = (tilt.rotateX * Math.PI) / 180;
          const ry = (tilt.rotateY * Math.PI) / 180;
          // Farthest corner depth under the actual rotateX/rotateY transform.
          const depth =
            (Math.abs(Math.sin(rx)) * height!) / 2 +
            (Math.abs(Math.cos(rx) * Math.sin(ry)) * width!) / 2;
          expect(depth).toBeLessThanOrEqual(CARD_MAX_TILT_DEPTH_PX);
        }
      }
    }
  });
});
