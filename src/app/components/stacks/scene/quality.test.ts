import { describe, expect, it } from "vitest";

import {
  PHYSICAL_PIXEL_BUDGET,
  QUALITY_RECOVERY_STABLE_MS,
  QUALITY_TRANSITION_COOLDOWN_MS,
  cloudDetailEnabled,
  forcedQualityFromSearch,
  initialQualityState,
  landmarkDetailEnabled,
  meadowQualityRung,
  postprocessingQuality,
  reduceQuality,
  resolveDpr,
  tiltShiftEnabled,
} from "./quality";

describe("scene quality controller", () => {
  it("keeps native 3x for the target iPhone portrait canvas", () => {
    expect(
      resolveDpr({
        cssWidth: 390,
        cssHeight: 844,
        deviceDpr: 3,
        rung: 0,
        touch: true,
      }),
    ).toBe(3);
  });

  it("caps large canvases by physical pixels", () => {
    const dpr = resolveDpr({
      cssWidth: 768,
      cssHeight: 1024,
      deviceDpr: 3,
      rung: 0,
      touch: true,
    });
    expect(dpr).toBeCloseTo(
      Math.sqrt(PHYSICAL_PIXEL_BUDGET.touch / (768 * 1024)),
    );
  });

  it("offers a real sustained low-end escape", () => {
    const input = {
      cssWidth: 390,
      cssHeight: 844,
      deviceDpr: 3,
      touch: true,
    };
    expect(resolveDpr({ ...input, rung: 1 })).toBe(2.75);
    expect(resolveDpr({ ...input, rung: 2 })).toBe(2.5);
    expect(resolveDpr({ ...input, rung: 3 })).toBe(2);
  });

  it("never changes meadow density merely because travel starts or stops", () => {
    expect(meadowQualityRung(0, false)).toBe(3);
    expect(meadowQualityRung(0, true)).toBe(3);
    expect(meadowQualityRung(2, false)).toBe(1);
    expect(meadowQualityRung(2, true)).toBe(1);
  });

  it("never changes cloud structure merely because travel starts or stops", () => {
    expect(cloudDetailEnabled(false, false)).toBe(true);
    expect(cloudDetailEnabled(false, true)).toBe(true);
    expect(cloudDetailEnabled(true, false)).toBe(false);
    expect(cloudDetailEnabled(true, true)).toBe(false);
  });

  it("preserves identity-bearing skyline detail when clouds simplify", () => {
    expect(landmarkDetailEnabled(false)).toBe(true);
    expect(landmarkDetailEnabled(true)).toBe(true);
  });

  it("keeps the approved side tilt shift until the composer turns off", () => {
    expect(tiltShiftEnabled("full", true, false)).toBe(true);
    expect(tiltShiftEnabled("finish", false, false)).toBe(true);
    expect(tiltShiftEnabled("off", false, false)).toBe(false);
    expect(tiltShiftEnabled("full", false, true)).toBe(false);
  });

  it("keeps the cheap finishing composer after the first declines", () => {
    expect(postprocessingQuality(0)).toBe("full");
    expect(postprocessingQuality(1)).toBe("finish");
    expect(postprocessingQuality(2)).toBe("finish");
    expect(postprocessingQuality(3)).toBe("off");
  });

  it("enforces decline cooldown and one conservative recovery", () => {
    let state = initialQualityState();
    state = reduceQuality(state, { type: "decline", now: 1_000 });
    expect(state.durable).toBe(1);
    state = reduceQuality(state, { type: "decline", now: 2_000 });
    expect(state.durable).toBe(1);
    state = reduceQuality(state, {
      type: "decline",
      now: 1_000 + QUALITY_TRANSITION_COOLDOWN_MS,
    });
    expect(state.durable).toBe(2);

    const stableAt = 20_000;
    state = reduceQuality(state, { type: "incline", now: stableAt });
    state = reduceQuality(state, {
      type: "recover",
      now: stableAt + QUALITY_RECOVERY_STABLE_MS - 1,
    });
    expect(state.durable).toBe(2);
    state = reduceQuality(state, {
      type: "recover",
      now: stableAt + QUALITY_RECOVERY_STABLE_MS,
    });
    expect(state.durable).toBe(1);
    expect(state.recoveryUsed).toBe(true);

    state = reduceQuality(state, { type: "incline", now: 100_000 });
    state = reduceQuality(state, { type: "recover", now: 200_000 });
    expect(state.durable).toBe(1);
  });

  it("supports deterministic forced quality URLs", () => {
    expect(forcedQualityFromSearch("?quality=2")).toBe(2);
    expect(forcedQualityFromSearch("?quality=9")).toBeNull();
  });
});
