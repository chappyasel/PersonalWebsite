import { describe, expect, it } from "vitest";

import { clampDoorLabelX, doorLabelRightEdge } from "./doorLabelPlacement";

describe("Door Label horizontal placement", () => {
  it("ignores the zero rect of the CSS-hidden desktop dock", () => {
    expect(doorLabelRightEdge(738, { left: 0, width: 0 })).toBe(726);
    expect(clampDoorLabelX(500, 220, 738, { left: 0, width: 0 })).toBe(500);
  });

  it("reserves a genuinely visible desktop dock", () => {
    expect(doorLabelRightEdge(1440, { left: 880, width: 528 })).toBe(868);
    expect(clampDoorLabelX(1000, 220, 1440, { left: 880, width: 528 })).toBe(
      758,
    );
  });

  it("keeps a long label inside a narrow viewport", () => {
    expect(clampDoorLabelX(-50, 240, 390, null)).toBe(132);
    expect(clampDoorLabelX(500, 240, 390, null)).toBe(258);
  });
});
