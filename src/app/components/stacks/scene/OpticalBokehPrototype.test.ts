import { describe, expect, it } from "vitest";

import {
  OPTICAL_BOKEH_MATCHED_TAPS,
  OPTICAL_BOKEH_QUALITY_TAPS,
  OPTICAL_BOKEH_ULTRA_TAPS,
  opticalBokehFragmentFor,
} from "./OpticalBokehPrototype";

const gatherCount = (fragment: string) =>
  fragment.match(/opticalGather\(vec2/g)?.length ?? 0;

describe("optical bokeh shader", () => {
  it("builds distinct matched-cost and quality aperture patterns", () => {
    expect(
      gatherCount(opticalBokehFragmentFor(OPTICAL_BOKEH_MATCHED_TAPS)),
    ).toBe(16);
    expect(
      gatherCount(opticalBokehFragmentFor(OPTICAL_BOKEH_QUALITY_TAPS)),
    ).toBe(32);
    expect(gatherCount(opticalBokehFragmentFor(OPTICAL_BOKEH_ULTRA_TAPS))).toBe(
      64,
    );
  });

  it("calculates invariant thin-lens terms once per pixel", () => {
    const fragment = opticalBokehFragmentFor(OPTICAL_BOKEH_QUALITY_TAPS);

    expect(fragment.match(/float thinLensScalePixels =/g)).toHaveLength(1);
    expect(fragment).not.toContain("focusImage");
    expect(fragment).not.toContain("objectImage");
    expect(fragment).not.toContain("length(aperturePoint)");
    expect(fragment.match(/float highlightGainPerRadius =/g)).toHaveLength(1);
  });

  it("exits the authored sharp band before the lens calculation", () => {
    const fragment = opticalBokehFragmentFor(OPTICAL_BOKEH_QUALITY_TAPS);
    const sharpExit = fragment.indexOf(
      "abs(centerDistance - uFocusDistance) <= uClearRadius",
    );
    const lensCalculation = fragment.indexOf("float thinLensScalePixels =");

    expect(sharpExit).toBeGreaterThan(-1);
    expect(sharpExit).toBeLessThan(lensCalculation);
  });
});

describe("optical lens per-side strength", () => {
  it("scales the circle of confusion by which side of the plane a sample is on", () => {
    const fragment = opticalBokehFragmentFor(OPTICAL_BOKEH_QUALITY_TAPS);
    expect(fragment).toContain("uniform float uNearStrength;");
    expect(fragment).toContain("uniform float uFarStrength;");
    expect(fragment).toContain(
      "float sideStrength = distance < uFocusDistance ? uNearStrength : uFarStrength;",
    );
    // Applied inside the radius, so the aperture gather and the early-out
    // both see a bay with no blur at all when the near side is off.
    const radiusFn = fragment.slice(
      fragment.indexOf("float opticalRadiusPixels("),
      fragment.indexOf("float opticalSide("),
    );
    expect(radiusFn).toContain("* uStrength * sideStrength");
  });
});
