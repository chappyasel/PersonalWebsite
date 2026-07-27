import { describe, expect, it } from "vitest";

import { getTextColorAndOverlay } from "./ogImageUtils";

describe("getTextColorAndOverlay", () => {
  it("uses 90% black over light cover art", () => {
    expect(getTextColorAndOverlay(0.8)).toMatchObject({
      textColor: "rgba(0, 0, 0, 0.9)",
      usesDarkText: true,
    });
  });

  it("uses 90% white over dark cover art", () => {
    expect(getTextColorAndOverlay(0.2)).toMatchObject({
      textColor: "rgba(255, 255, 255, 0.9)",
      usesDarkText: false,
    });
  });
});
