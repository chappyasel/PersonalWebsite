import { SCENE_RESOLUTION_MAX_STEP } from "../scene/qualityAxes";
import { describe, expect, it } from "vitest";

import { qualityRenderingReadout } from "./qualityReadout";

const RUNTIME = {
  profile: "balanced",
  axisResolutionStep: 9,
  dpr: 1.62,
  physicalPixels: 3_240_000,
  effectsTier: "lean",
  contentTier: "reduced",
} as const;

const readout = (
  overrides: Partial<Parameters<typeof qualityRenderingReadout>[0]> = {},
) =>
  qualityRenderingReadout({
    cinematicPlus: false,
    forcedProfile: null,
    pinnedResolutionStep: null,
    runtime: RUNTIME,
    ...overrides,
  });

describe("the quality panel's rendering card", () => {
  it("names the controller as the driver in automatic mode", () => {
    expect(readout().mode).toBe("Auto · adapting");
  });

  it("names a forced preset and says a person chose it", () => {
    expect(readout({ forcedProfile: "safety" }).mode).toBe("safety · manual");
  });

  it("lets Cinematic+ outrank a forced preset, since it layers over one", () => {
    expect(
      readout({ cinematicPlus: true, forcedProfile: "cinematic" }).mode,
    ).toBe("Cinematic+ · manual");
  });

  it("still names the driver before the first frame is published", () => {
    // A booting scene that says only "Waiting" looks like a broken one.
    const booting = readout({ runtime: null, forcedProfile: "cinematic" });

    expect(booting.mode).toBe("cinematic · manual");
    expect(booting.effective).toBe("no frame published yet");
    expect(booting.plan).toBe("Resolving render plan");
  });

  it("reports the step the frame was rendered at, not the axis state", () => {
    // The regression this exists for: a window whose pixel budget capped it
    // at DPR 1.62 rendered at step 11 while the controller held 9, and the
    // panel said "res 9/11" — a working pin that read as a broken control.
    const pinned = readout({ pinnedResolutionStep: 11 });

    expect(pinned.effective).toBe(
      `Effective balanced · res 11/${SCENE_RESOLUTION_MAX_STEP} pinned`,
    );
    expect(pinned.effective).not.toContain("res 9");
  });

  it("says nothing about pinning while the axis is adapting", () => {
    expect(readout().effective).toBe(
      `Effective balanced · res 9/${SCENE_RESOLUTION_MAX_STEP}`,
    );
    expect(readout().effective).not.toContain("pinned");
  });

  it("marks a pin even when it agrees with the controller", () => {
    // Agreement is a coincidence the controller can end at any moment, so the
    // label has to follow the control, not the numbers.
    expect(readout({ pinnedResolutionStep: 9 }).effective).toContain("pinned");
  });

  it("keeps the step scale tied to the real ladder", () => {
    expect(readout().effective).toContain(`/${SCENE_RESOLUTION_MAX_STEP}`);
    expect(SCENE_RESOLUTION_MAX_STEP).toBeGreaterThan(0);
  });

  it("reports the frame's real cost at panel precision", () => {
    expect(readout().plan).toBe("DPR 1.62 · 3.2 MP · fx lean · geo reduced");
  });

  it("keeps DPR at two decimals so a stepping ladder stays legible", () => {
    expect(readout({ runtime: { ...RUNTIME, dpr: 2 } }).plan).toContain(
      "DPR 2.00",
    );
  });
});
