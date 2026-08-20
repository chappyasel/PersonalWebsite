import { describe, expect, it } from "vitest";

import {
  RESOLUTION_OVERRIDE_MAX_DPR,
  RESOLUTION_OVERRIDE_MAX_PIXELS,
  SCENE_RESOLUTION_SCALE_FLOOR,
  overrideResolutionCeiling,
  resolveSceneQualityPlan,
} from "./quality";

/** The desktop window from the reported case: the pixel budget capped it at
 * DPR 1.62, so the top of the ladder there could not reach the display. */
const wideWindow = {
  mode: "showcase",
  profile: "showcase",
  cssWidth: 1940,
  cssHeight: 1021,
  deviceDpr: 2,
  touch: false,
  narrowViewport: false,
} as const;

describe("the manual resolution ceiling", () => {
  it("is off by default, leaving the pixel budget in charge", () => {
    const plan = resolveSceneQualityPlan(wideWindow);
    expect(plan.resolutionCeilingOverridden).toBe(false);
    expect(plan.dpr).toBeCloseTo(1.62, 2);
    expect(plan.physicalPixels).toBeLessThanOrEqual(plan.pixelBudget);
  });

  // The whole point: the budget is the automatic controller's constraint, not
  // a limit on what a person may look at.
  it("reaches a density the pixel budget forbids", () => {
    const plan = resolveSceneQualityPlan({
      ...wideWindow,
      resolutionCeiling: 3,
      resolutionStep: 11,
    });
    expect(plan.dpr).toBe(3);
    expect(plan.resolutionCeilingOverridden).toBe(true);
    expect(plan.physicalPixels).toBeGreaterThan(plan.pixelBudget);
  });

  // A plan whose dpr sat above its own stated cap would describe a state that
  // cannot occur, and the panel reads the cap.
  it("reports the ceiling actually in force", () => {
    const plan = resolveSceneQualityPlan({
      ...wideWindow,
      resolutionCeiling: 3,
      resolutionStep: 11,
    });
    expect(plan.dprCap).toBe(3);
  });

  it("still runs the ladder inside the override", () => {
    const top = resolveSceneQualityPlan({
      ...wideWindow,
      resolutionCeiling: 3,
      resolutionStep: 11,
    });
    const lower = resolveSceneQualityPlan({
      ...wideWindow,
      resolutionCeiling: 3,
      resolutionStep: 6,
    });
    expect(lower.dpr).toBeLessThan(top.dpr);
    expect(lower.dpr).toBeGreaterThan(SCENE_RESOLUTION_SCALE_FLOOR);
  });
});

describe("the manual ceiling's safety limit", () => {
  // Unbounded here means allocating the framebuffer and every composer target
  // at that size and losing the context, which is a worse outcome than not
  // being able to see 8x.
  it("never exceeds the absolute DPR limit", () => {
    expect(overrideResolutionCeiling(99, 400, 400)).toBe(
      RESOLUTION_OVERRIDE_MAX_DPR,
    );
  });

  it("holds a huge window under the pixel limit", () => {
    const w = 3840;
    const h = 2160;
    const ceiling = overrideResolutionCeiling(4, w, h);
    expect(ceiling * ceiling * w * h).toBeLessThanOrEqual(
      RESOLUTION_OVERRIDE_MAX_PIXELS + 1,
    );
    expect(ceiling).toBeLessThan(RESOLUTION_OVERRIDE_MAX_DPR);
  });

  it("never returns less than the ladder's floor", () => {
    expect(overrideResolutionCeiling(0, 1940, 1021)).toBe(
      SCENE_RESOLUTION_SCALE_FLOOR,
    );
    expect(overrideResolutionCeiling(-5, 1940, 1021)).toBe(
      SCENE_RESOLUTION_SCALE_FLOOR,
    );
  });

  it("refuses a non-finite request rather than sizing a buffer from it", () => {
    expect(overrideResolutionCeiling(Number.NaN, 1940, 1021)).toBe(
      SCENE_RESOLUTION_SCALE_FLOOR,
    );
    expect(overrideResolutionCeiling(Infinity, 1940, 1021)).toBeLessThanOrEqual(
      RESOLUTION_OVERRIDE_MAX_DPR,
    );
  });

  it("keeps the budget above every preset's own, so presets are unaffected", () => {
    expect(RESOLUTION_OVERRIDE_MAX_PIXELS).toBeGreaterThan(16_600_000);
  });
});
