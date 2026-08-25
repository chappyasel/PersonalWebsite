import { describe, expect, it } from "vitest";

import {
  clampPortalLabelX,
  clampPortalLabelY,
  portalLabelRightEdge,
} from "./portalLabelPlacement";

describe("Portal Label horizontal placement", () => {
  it("ignores the zero rect of the CSS-hidden desktop dock", () => {
    expect(portalLabelRightEdge(738, { left: 0, width: 0 })).toBe(726);
    expect(clampPortalLabelX(500, 220, 738, { left: 0, width: 0 })).toBe(500);
  });

  it("reserves a genuinely visible desktop dock", () => {
    expect(portalLabelRightEdge(1440, { left: 880, width: 528 })).toBe(868);
    expect(clampPortalLabelX(1000, 220, 1440, { left: 880, width: 528 })).toBe(
      758,
    );
  });

  it("keeps a long label inside a narrow viewport", () => {
    expect(clampPortalLabelX(-50, 240, 390, null)).toBe(132);
    expect(clampPortalLabelX(500, 240, 390, null)).toBe(258);
  });
});

describe("Portal Label vertical placement", () => {
  it("ignores the zero rect of the CSS-hidden mobile sheet", () => {
    expect(clampPortalLabelY(520, 31, 900, { top: 0, height: 0 })).toBe(510);
  });

  it("stays above a genuinely visible mobile sheet", () => {
    expect(clampPortalLabelY(700, 31, 900, { top: 640, height: 260 })).toBe(
      628,
    );
  });
});
