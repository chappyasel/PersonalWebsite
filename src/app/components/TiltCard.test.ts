import { describe, expect, it } from "vitest";

import { tiltCardHoverEnabled } from "./tiltCardMotion";

describe("TiltCard hover capability", () => {
  it("requires both fine hover and motion permission", () => {
    expect(tiltCardHoverEnabled(false, true)).toBe(true);
    expect(tiltCardHoverEnabled(false, false)).toBe(false);
    expect(tiltCardHoverEnabled(true, true)).toBe(false);
  });
});
