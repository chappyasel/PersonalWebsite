import { describe, expect, it } from "vitest";

import {
  NARROW_VIEWPORT_DPR_CAP_BY_PROFILE,
  SCENE_FRAME_BUDGET_MS,
  SCENE_QUALITY_PROFILES,
  type SceneQualityMetrics,
  type SceneQualityProfile,
  summariseSceneFrameWindow,
} from "./quality";
import {
  AXES_BY_PROFILE,
  QUALITY_BOOT_GUARD_MS,
  QUALITY_CONTENT_FALL_MS,
  QUALITY_CONTENT_RISE_MS,
  QUALITY_EFFECTS_FALL_MS,
  QUALITY_EFFECTS_RETRY_MS,
  QUALITY_EFFECTS_RISE_MS,
  QUALITY_RESOLUTION_DWELL_MS,
  QUALITY_RESOLUTION_GIVE_UP_STEPS,
  QUALITY_RESOLUTION_RETRY_MS,
  QUALITY_SURVIVAL_FALL_MS,
  QUALITY_TRAVEL_OVER_BUDGET_LIMIT,
  QUALITY_TRAVEL_RESOLUTION_DROP_STEPS,
  SCENE_RESOLUTION_FLOOR,
  SCENE_RESOLUTION_MAX_STEP,
  SCENE_RESOLUTION_STEP_COUNT,
  type SceneQualityAxisState,
  initialSceneQualityAxisState,
  reduceSceneQualityAxes,
  resolutionScaleForStep,
  resolutionStepForScale,
} from "./qualityAxes";

const metrics = (over: Partial<SceneQualityMetrics>): SceneQualityMetrics => ({
  targetFrameMs: SCENE_FRAME_BUDGET_MS,
  targetHz: 60,
  p95: 16,
  droppedFrameRatio: 0.01,
  sampleCount: 120,
  cpuMs: 5,
  gpuMs: null,
  ...over,
});

/** Low main-thread cost with late frames: the GPU is the constraint. */
const gpuBound = metrics({ p95: 24, droppedFrameRatio: 0.3, cpuMs: 4 });
/** A timer query confirms the same constraint instead of inferring it. */
const measuredGpuBound = metrics({
  p95: 24,
  droppedFrameRatio: 0.3,
  cpuMs: 4,
  gpuMs: 24,
});
/** High main-thread cost: the CPU is the constraint, whatever the GPU does. */
const cpuBound = metrics({ p95: 24, droppedFrameRatio: 0.3, cpuMs: 14 });
/** Cheap and on time. */
const headroom = metrics({ p95: 12, droppedFrameRatio: 0.005, cpuMs: 4 });

/** Feed one classification for a stretch of wall clock, a window at a time. */
function hold(
  state: SceneQualityAxisState,
  value: SceneQualityMetrics,
  fromMs: number,
  durationMs: number,
  stepMs = 250,
  allowResolutionChange = true,
) {
  let next = state;
  for (let t = fromMs; t <= fromMs + durationMs; t += stepMs)
    next = reduceSceneQualityAxes(next, {
      type: "sample",
      now: t,
      metrics: value,
      visible: true,
      allowResolutionChange,
    });
  return next;
}

/** A booted controller in steady state, past the one-shot boot decline guard.
 * Boot suppression and that guard have their own describe block below; every
 * other test here is about behaviour once the scene has settled. */
const start = (
  profile: SceneQualityProfile = "balanced",
): SceneQualityAxisState => ({
  ...reduceSceneQualityAxes(initialSceneQualityAxisState(profile, 0), {
    type: "booted",
    now: 0,
  }),
  bootDeclineGuard: false,
  foregroundReadyAt: 0,
});

describe("the resolution ladder", () => {
  it("has twelve steps between the floor and the ceiling", () => {
    expect(SCENE_RESOLUTION_STEP_COUNT).toBe(12);
    expect(resolutionScaleForStep(0, 3)).toBeCloseTo(SCENE_RESOLUTION_FLOOR, 6);
    expect(resolutionScaleForStep(SCENE_RESOLUTION_MAX_STEP, 3)).toBeCloseTo(
      3,
      6,
    );
  });

  it("spaces steps geometrically, so each is the same relative size", () => {
    const ratios = Array.from(
      { length: SCENE_RESOLUTION_MAX_STEP },
      (_, i) => resolutionScaleForStep(i + 1, 3) / resolutionScaleForStep(i, 3),
    );
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[0]!, 9);
  });

  it("rises monotonically and never leaves the bounds", () => {
    for (const ceiling of [1, 1.75, 2, 2.75, 3, 4]) {
      let previous = -Infinity;
      for (let step = 0; step <= SCENE_RESOLUTION_MAX_STEP; step += 1) {
        const scale = resolutionScaleForStep(step, ceiling);
        expect(scale).toBeGreaterThan(previous);
        expect(scale).toBeGreaterThanOrEqual(SCENE_RESOLUTION_FLOOR - 1e-9);
        expect(scale).toBeLessThanOrEqual(ceiling + 1e-9);
        previous = scale;
      }
    }
  });

  it("clamps a step outside the ladder rather than extrapolating", () => {
    expect(resolutionScaleForStep(-5, 3)).toBeCloseTo(
      SCENE_RESOLUTION_FLOOR,
      6,
    );
    expect(resolutionScaleForStep(99, 3)).toBeCloseTo(3, 6);
  });

  it("degenerates safely when the ceiling is at or below the floor", () => {
    expect(resolutionScaleForStep(11, 0.4)).toBe(SCENE_RESOLUTION_FLOOR);
    expect(resolutionScaleForStep(0, SCENE_RESOLUTION_FLOOR)).toBe(
      SCENE_RESOLUTION_FLOOR,
    );
  });

  it("round-trips a scale back to its step", () => {
    for (let step = 0; step <= SCENE_RESOLUTION_MAX_STEP; step += 1)
      expect(resolutionStepForScale(resolutionScaleForStep(step, 3), 3)).toBe(
        step,
      );
  });

  it("reaches a low enough scale to satisfy the Safety pixel budget", () => {
    // 393x852 at the floor is ~120,500 physical pixels, well under the
    // 500,000 ceiling, so the floor and the budget do not conflict.
    const pixels = 393 * 852 * SCENE_RESOLUTION_FLOOR ** 2;
    expect(pixels).toBeLessThan(500_000);
  });
});

describe("sample identity", () => {
  it("does not publish a new reducer state for an unchanged unknown verdict", () => {
    const state = start("efficient");
    const mixedTail = metrics({
      p50: 26,
      p95: 50,
      droppedFrameRatio: 0.52,
      cpuP50: 6,
      cpuMs: 12,
      windowMs: 1_980,
    });

    const next = reduceSceneQualityAxes(state, {
      type: "sample",
      now: 10_000,
      metrics: mixedTail,
      visible: true,
    });

    expect(next).toBe(state);
  });
});

describe("preset mapping", () => {
  it("gives every profile a point in the axis space", () => {
    for (const profile of SCENE_QUALITY_PROFILES)
      expect(AXES_BY_PROFILE[profile]).toBeDefined();
  });

  it("keeps Cinematic the highest tier on both visible axes", () => {
    expect(AXES_BY_PROFILE.cinematic).toEqual({
      effects: "cinematic",
      content: "full",
    });
  });

  it("separates Showcase and Balanced by resolution alone", () => {
    expect(AXES_BY_PROFILE.showcase).toEqual(AXES_BY_PROFILE.balanced);
  });

  it("puts Safety at the lowest tier on both visible axes", () => {
    expect(AXES_BY_PROFILE.safety).toEqual({
      effects: "minimal",
      content: "minimal",
    });
  });

  // Literals on purpose. The resolution axis is a finer ladder INSIDE the
  // preset ceilings and must never move one as a side effect, so any change
  // here has to be typed out deliberately rather than tracked automatically.
  //
  // showcase is 3 because a 3x phone that has earned the top of the ladder
  // should reach its screen's real resolution; the pixel budget, which
  // scales with the viewport, is what holds larger phones below it. The
  // lower rungs stay reduced.
  it("leaves the preset narrow-viewport caps untouched", () => {
    expect(NARROW_VIEWPORT_DPR_CAP_BY_PROFILE).toMatchObject({
      showcase: 3,
      balanced: 1.75,
      efficient: 1.5,
      safety: 1.25,
    });
  });
});

describe("the production quality transition journal", () => {
  it("records boot, visibility, and travel boundaries separately from axes", () => {
    let state = initialSceneQualityAxisState("balanced", 0);
    state = reduceSceneQualityAxes(state, { type: "booted", now: 1_000 });
    state = reduceSceneQualityAxes(state, {
      type: "visibility-hidden",
      now: 2_000,
    });
    state = reduceSceneQualityAxes(state, {
      type: "visibility-visible",
      now: 30_000,
    });
    state = reduceSceneQualityAxes(state, {
      type: "travel-start",
      now: 40_000,
    });
    state = reduceSceneQualityAxes(state, {
      type: "travel-end",
      now: 42_000,
      frames: { total: 100, late: 30 },
    });

    expect(state.lifecycle).toEqual([
      { type: "booted", at: 1_000 },
      { type: "visibility-hidden", at: 2_000 },
      { type: "visibility-visible", at: 30_000 },
      { type: "travel-start", at: 40_000 },
      {
        type: "travel-end",
        at: 42_000,
        frames: { total: 100, late: 30 },
      },
    ]);
    expect(state.transitions).toEqual([]);
  });

  it("starts empty and records the exact sample-driven resolution decision", () => {
    const before = { ...start(), gpuSince: 0 };
    const pressure = metrics({
      p50: 20,
      p95: 24,
      droppedFrameRatio: 0.3,
      cpuP50: 3,
      cpuMs: 4,
    });
    const state = reduceSceneQualityAxes(before, {
      type: "sample",
      now: 2_000,
      metrics: pressure,
      visible: true,
    });

    expect(before.transitions).toEqual([]);
    expect(state.transitions).toEqual([
      {
        at: 2_000,
        axis: "resolution",
        direction: "down",
        reason: "sample-pressure",
        fromValue: SCENE_RESOLUTION_MAX_STEP,
        toValue: SCENE_RESOLUTION_MAX_STEP - 1,
        metrics: {
          targetFrameMs: SCENE_FRAME_BUDGET_MS,
          sampleCount: 120,
          windowMs: null,
          p50: 20,
          p95: 24,
          droppedFrameRatio: 0.3,
          cpuP50: 3,
          cpuMs: 4,
          gpuMs: null,
          constraint: "gpu",
        },
      },
    ]);
  });

  it("uses typed tier values and records every axis changed by a force", () => {
    const state = reduceSceneQualityAxes(start(), {
      type: "force",
      now: 2_000,
      profile: "safety",
    });

    expect(state.transitions).toEqual([
      expect.objectContaining({
        axis: "effects",
        direction: "down",
        reason: "force",
        fromValue: "full",
        toValue: "minimal",
        metrics: null,
      }),
      expect.objectContaining({
        axis: "content",
        direction: "down",
        reason: "force",
        fromValue: "full",
        toValue: "minimal",
        metrics: null,
      }),
    ]);
  });

  it("identifies travel borrowing separately from sample pressure", () => {
    const state = reduceSceneQualityAxes(
      { ...start(), gpuSince: 500 },
      { type: "travel-start", now: 2_000 },
    );

    expect(state.transitions.at(-1)).toMatchObject({
      axis: "resolution",
      direction: "down",
      reason: "travel-borrow",
      fromValue: SCENE_RESOLUTION_MAX_STEP,
      toValue: SCENE_RESOLUTION_MAX_STEP - QUALITY_TRAVEL_RESOLUTION_DROP_STEPS,
      metrics: null,
    });
  });

  it("records restored axes and strict-headroom recovery", () => {
    let state = reduceSceneQualityAxes(start(), {
      type: "restore",
      now: 1_000,
      axes: {
        resolutionStep: 10,
        effects: "lean",
        content: "reduced",
        survival: false,
      },
    });

    expect(
      state.transitions.map(({ axis, reason }) => ({ axis, reason })),
    ).toEqual([
      { axis: "resolution", reason: "restore" },
      { axis: "effects", reason: "restore" },
      { axis: "content", reason: "restore" },
    ]);

    state = {
      ...state,
      axes: { ...state.axes, effects: "full", content: "full" },
      headroomSince: 1_000,
      resolutionRetryAt: null,
    };
    state = reduceSceneQualityAxes(state, {
      type: "sample",
      now: 5_000,
      metrics: headroom,
      visible: true,
    });

    expect(state.transitions.at(-1)).toMatchObject({
      axis: "resolution",
      direction: "up",
      reason: "strict-headroom",
      fromValue: 10,
      toValue: 11,
    });
  });

  it("does not journal reducer activity that leaves every axis unchanged", () => {
    const before = start();
    const state = reduceSceneQualityAxes(before, {
      type: "sample",
      now: 100,
      metrics: headroom,
      visible: true,
    });

    expect(state.transitions).toEqual([]);
  });

  it("retains only the latest sixteen axis transitions", () => {
    let state = start();
    for (let index = 0; index < 10; index += 1) {
      state = reduceSceneQualityAxes(state, {
        type: "force",
        now: index * 2 + 1,
        profile: "safety",
      });
      state = reduceSceneQualityAxes(state, {
        type: "force",
        now: index * 2 + 2,
        profile: "showcase",
      });
    }

    expect(state.transitions).toHaveLength(16);
    expect(state.transitions[0]?.at).toBe(13);
    expect(state.transitions.at(-1)?.at).toBe(20);
  });
});

describe("axis independence", () => {
  it("requires a sustained GPU run before the first resolution cut", () => {
    let state = start();
    state = reduceSceneQualityAxes(state, {
      type: "sample",
      now: 3_000,
      metrics: gpuBound,
      visible: true,
    });
    expect(state.axes.resolutionStep).toBe(SCENE_RESOLUTION_MAX_STEP);

    state = reduceSceneQualityAxes(state, {
      type: "sample",
      now: 3_000 + QUALITY_RESOLUTION_DWELL_MS - 1,
      metrics: gpuBound,
      visible: true,
    });
    expect(state.axes.resolutionStep).toBe(SCENE_RESOLUTION_MAX_STEP);

    state = reduceSceneQualityAxes(state, {
      type: "sample",
      now: 3_000 + QUALITY_RESOLUTION_DWELL_MS,
      metrics: gpuBound,
      visible: true,
    });
    expect(state.axes.resolutionStep).toBe(SCENE_RESOLUTION_MAX_STEP - 1);
  });

  it("moves resolution and leaves content alone under GPU pressure", () => {
    const state = hold(start(), gpuBound, 2_000, QUALITY_EFFECTS_FALL_MS * 2);
    expect(state.axes.resolutionStep).toBeLessThan(SCENE_RESOLUTION_MAX_STEP);
    expect(state.axes.content).toBe("full");
  });

  it("leaves effects alone while resolution still has room", () => {
    const state = hold(
      start(),
      measuredGpuBound,
      2_000,
      QUALITY_EFFECTS_FALL_MS * 2,
    );
    expect(state.axes.effects).toBe("full");
  });

  it("walks resolution to the floor under measured GPU pressure", () => {
    let state = start();
    for (let i = 0; i < SCENE_RESOLUTION_MAX_STEP + 2; i += 1)
      state = hold(
        state,
        measuredGpuBound,
        2_000 + i * (QUALITY_RESOLUTION_DWELL_MS + 500),
        QUALITY_RESOLUTION_DWELL_MS + 250,
      );
    expect(state.axes.resolutionStep).toBe(0);
  });

  it("stops spending resolution when inferred GPU cuts do not help", () => {
    const state = hold(start(), gpuBound, 2_000, 30_000);

    expect(state.axes.resolutionStep).toBe(
      SCENE_RESOLUTION_MAX_STEP - QUALITY_RESOLUTION_GIVE_UP_STEPS,
    );
    expect(state.axes.effects).toBe("minimal");
  });

  it("stops spending resolution under CPU pressure once it is shown not to help", () => {
    // Fewer pixels does not relieve a saturated main thread: the measurement
    // that started this work found a 61 percent pixel cut buying 0.19 ms.
    // Walking all twelve steps would cost the visitor sixteen seconds and a
    // blurrier image for nothing.
    let state = start();
    for (let i = 0; i < SCENE_RESOLUTION_MAX_STEP + 2; i += 1)
      state = hold(
        state,
        cpuBound,
        2_000 + i * (QUALITY_RESOLUTION_DWELL_MS + 500),
        QUALITY_RESOLUTION_DWELL_MS + 250,
      );
    expect(state.axes.resolutionStep).toBeGreaterThan(
      SCENE_RESOLUTION_MAX_STEP - 4,
    );
  });

  it("holds content at full density regardless of which axis moved", () => {
    const state = hold(start(), gpuBound, 2_000, 30_000);
    // Coverage is never the lever: only tiers change, never instance count,
    // and this axis state carries no density dial at all.
    expect(Object.keys(state.axes)).toEqual([
      "resolutionStep",
      "effects",
      "content",
      "survival",
    ]);
  });

  it("routes GPU pressure to effects when the platform locks its drawing buffer", () => {
    const state = hold(
      start(),
      gpuBound,
      2_000,
      QUALITY_EFFECTS_FALL_MS + 500,
      250,
      false,
    );
    expect(state.axes.resolutionStep).toBe(SCENE_RESOLUTION_MAX_STEP);
    expect(state.axes.effects).toBe("lean");
    expect(state.axes.content).toBe("full");
  });

  it("does not raise a platform-locked drawing buffer under headroom", () => {
    const base = {
      ...start(),
      axes: { ...start().axes, resolutionStep: 8 },
    };
    const state = hold(base, headroom, 2_000, 120_000, 250, false);
    expect(state.axes.resolutionStep).toBe(8);
  });
});

describe("the resolution dwell", () => {
  it("holds a lower resolution for twenty seconds before retry", () => {
    expect(QUALITY_RESOLUTION_RETRY_MS).toBe(20_000);
  });

  it("takes at most one step inside a single dwell", () => {
    const state = hold(start(), gpuBound, 2_000, QUALITY_RESOLUTION_DWELL_MS);
    expect(state.axes.resolutionStep).toBe(SCENE_RESOLUTION_MAX_STEP - 1);
  });

  it("defers the whole decision rather than passing the turn to a slower axis", () => {
    // A dwell is a short wait. Spending a visible lever to avoid it is the
    // wrong trade, so nothing else may move while it is running.
    const state = hold(
      start(),
      cpuBound,
      2_000,
      QUALITY_RESOLUTION_DWELL_MS - 500,
    );
    expect(state.axes.effects).toBe("full");
    expect(state.axes.content).toBe("full");
  });

  it("does not immediately revisit a resolution step that just caused GPU pressure", () => {
    let state = hold(start(), gpuBound, 2_000, QUALITY_RESOLUTION_DWELL_MS);
    const stableStep = state.axes.resolutionStep;

    // This is the physical-iPhone failure loop: one lower step reaches vsync,
    // Auto calls that headroom, climbs back into the known-bad step, then the
    // next late window drops it again. Every reversal reallocates Safari's
    // drawing buffer and presents a black frame while the grass alternates
    // between two visibly different raster resolutions.
    state = hold(state, headroom, 5_000, 10_000);

    expect(state.axes.resolutionStep).toBe(stableStep);
  });
});

describe("the one-axis-at-a-time block", () => {
  /** Resolution spent, effects spent, one unproven change on the books. The
   * only axis left with anywhere to go is content. */
  const afterUnprovenChange = (): SceneQualityAxisState => ({
    ...start(),
    axes: {
      resolutionStep: 0,
      effects: "minimal",
      content: "full",
      survival: false,
    },
    pendingBaseline: cpuBound,
    lastChange: { axis: "resolution", direction: "down", reason: "pressure" },
  });

  it("blocks a different axis until a window shows the change helped", () => {
    const state = hold(
      afterUnprovenChange(),
      cpuBound,
      2_000,
      QUALITY_CONTENT_FALL_MS * 2,
    );
    expect(state.axes.content).toBe("full");
  });

  it("releases the block once the change is shown to have helped", () => {
    // Still CPU-bound, but materially better than the window that justified
    // the change: the evidence the block was waiting for.
    const improved = metrics({ p95: 20, droppedFrameRatio: 0.2, cpuMs: 14 });
    expect(improved.p95).toBeLessThanOrEqual(cpuBound.p95 * 0.9);
    const state = hold(
      afterUnprovenChange(),
      improved,
      2_000,
      QUALITY_CONTENT_FALL_MS + 500,
    );
    expect(state.axes.content).toBe("reduced");
  });

  it("lets severe pressure override the block", () => {
    const severe = metrics({ p95: 40, droppedFrameRatio: 0.5, cpuMs: 14 });
    const state = hold(
      afterUnprovenChange(),
      severe,
      2_000,
      QUALITY_CONTENT_FALL_MS + 500,
    );
    expect(state.axes.content).toBe("reduced");
  });

  it("keeps pacing the axis that moved by its own sustain, not by the block", () => {
    // A device under real, unrelieved pressure must keep making progress on
    // the cheapest lever. Freezing resolution until it proves itself would
    // strand exactly the device that needs it most.
    const state = hold(
      start(),
      gpuBound,
      2_000,
      QUALITY_RESOLUTION_DWELL_MS * 4,
    );
    expect(state.axes.resolutionStep).toBeLessThan(
      SCENE_RESOLUTION_MAX_STEP - 1,
    );
  });
});

describe("effects and content time constants", () => {
  const atFloor = (): SceneQualityAxisState => ({
    ...start(),
    axes: {
      resolutionStep: 0,
      effects: "full",
      content: "full",
      survival: false,
    },
  });

  it("moves effects on a sustained GPU constraint and leaves content alone", () => {
    const state = hold(
      atFloor(),
      gpuBound,
      2_000,
      QUALITY_EFFECTS_FALL_MS + 500,
    );
    expect(state.axes.effects).toBe("lean");
    expect(state.axes.content).toBe("full");
    expect(state.transitions.at(-1)).toMatchObject({
      axis: "effects",
      reason: "sample-pressure",
    });
  });

  it("answers CPU pressure with content and leaves effects and resolution alone", () => {
    const state = hold(start(), cpuBound, 2_000, QUALITY_CONTENT_FALL_MS + 500);
    expect(state.axes.resolutionStep).toBe(SCENE_RESOLUTION_MAX_STEP);
    expect(state.axes.effects).toBe("full");
    expect(state.axes.content).toBe("reduced");
    expect(state.transitions.at(-1)).toMatchObject({
      axis: "content",
      reason: "sample-pressure",
    });
  });

  it("does not move effects before the sustain elapses", () => {
    const state = hold(
      atFloor(),
      gpuBound,
      2_000,
      QUALITY_EFFECTS_FALL_MS - 1_000,
    );
    expect(state.axes.effects).toBe("full");
  });

  it("resets an axis clock when the classification breaks", () => {
    let state = hold(
      atFloor(),
      gpuBound,
      2_000,
      QUALITY_EFFECTS_FALL_MS - 1_000,
    );
    // One window of something else must restart the run, not extend it.
    state = reduceSceneQualityAxes(state, {
      type: "sample",
      now: 8_000,
      metrics: metrics({ p95: 17, droppedFrameRatio: 0.06, cpuMs: 10 }),
      visible: true,
    });
    state = hold(state, gpuBound, 8_500, QUALITY_EFFECTS_FALL_MS - 1_000);
    expect(state.axes.effects).toBe("full");
  });

  it("moves content on a sustained CPU constraint once effects are lowest", () => {
    const base: SceneQualityAxisState = {
      ...start(),
      axes: {
        resolutionStep: 0,
        effects: "minimal",
        content: "full",
        survival: false,
      },
    };
    const state = hold(base, cpuBound, 2_000, QUALITY_CONTENT_FALL_MS + 500);
    expect(state.axes.content).toBe("reduced");
  });

  it("keeps the CPU-oriented content axis out of a GPU decision", () => {
    const base: SceneQualityAxisState = {
      ...start(),
      axes: {
        resolutionStep: 0,
        effects: "minimal",
        content: "full",
        survival: false,
      },
    };
    const state = hold(base, gpuBound, 2_000, QUALITY_CONTENT_FALL_MS * 2);
    expect(state.axes.content).toBe("full");
  });

  it("climbs back on sustained headroom", () => {
    const base: SceneQualityAxisState = {
      ...start(),
      axes: {
        resolutionStep: 0,
        effects: "lean",
        content: "reduced",
        survival: false,
      },
    };
    const state = hold(base, headroom, 2_000, QUALITY_CONTENT_RISE_MS + 1_000);
    expect(state.axes.content).toBe("full");
  });

  it("climbs effects sooner than content, since content is the visible one", () => {
    expect(QUALITY_EFFECTS_RISE_MS).toBeLessThan(QUALITY_CONTENT_RISE_MS);
    expect(QUALITY_EFFECTS_FALL_MS).toBeLessThan(QUALITY_CONTENT_FALL_MS);
  });
});

describe("the survival rung", () => {
  const severeCpu = metrics({
    p95: 40,
    droppedFrameRatio: 0.5,
    cpuMs: 14,
  });
  const severeGpu = metrics({
    p95: 40,
    droppedFrameRatio: 0.5,
    cpuMs: 4,
  });
  const severeUnknown = metrics({
    p95: 40,
    droppedFrameRatio: 0.5,
    cpuMs: 9,
  });
  const cpuFloor = (): SceneQualityAxisState => ({
    ...start(),
    axes: {
      ...start().axes,
      content: "minimal",
      survival: false,
    },
  });

  it("waits for a fresh severe run after the useful CPU axis reaches its floor", () => {
    const short = hold(
      cpuFloor(),
      severeCpu,
      2_000,
      QUALITY_SURVIVAL_FALL_MS - 250,
    );
    expect(short.axes.survival).toBe(false);

    const complete = hold(
      cpuFloor(),
      severeCpu,
      2_000,
      QUALITY_SURVIVAL_FALL_MS,
    );
    expect(complete.axes.survival).toBe(true);
    expect(complete.transitions.at(-1)).toMatchObject({
      axis: "survival",
      direction: "down",
      reason: "sample-pressure",
      fromValue: false,
      toValue: true,
    });
  });

  it("resets the survival dwell when severe pressure breaks", () => {
    let state = hold(
      cpuFloor(),
      severeCpu,
      2_000,
      QUALITY_SURVIVAL_FALL_MS - 1_000,
    );
    state = reduceSceneQualityAxes(state, {
      type: "sample",
      now: 12_000,
      metrics: headroom,
      visible: true,
    });
    state = hold(state, severeCpu, 12_250, QUALITY_SURVIVAL_FALL_MS - 1_000);
    expect(state.axes.survival).toBe(false);
  });

  it("does not retire the meadow while a useful GPU axis remains", () => {
    const state = hold(
      {
        ...start(),
        axes: {
          resolutionStep: 0,
          effects: "lean",
          content: "reduced",
          survival: false,
        },
      },
      severeGpu,
      2_000,
      QUALITY_SURVIVAL_FALL_MS,
    );
    expect(state.axes.survival).toBe(false);
    expect(state.axes.effects).toBe("minimal");
  });

  it("keeps survival one-way while restoring ordinary axes on headroom", () => {
    let state = hold(cpuFloor(), severeCpu, 2_000, QUALITY_SURVIVAL_FALL_MS);
    state = hold(state, headroom, 20_000, QUALITY_CONTENT_RISE_MS * 2 + 500);
    expect(state.axes.survival).toBe(true);
    expect(state.axes.content).toBe("full");
    expect(state.validation).not.toBeNull();
  });

  it("preserves survival across a forced-profile comparison", () => {
    let state = hold(cpuFloor(), severeCpu, 2_000, QUALITY_SURVIVAL_FALL_MS);
    state = reduceSceneQualityAxes(state, {
      type: "force",
      now: 20_000,
      profile: "showcase",
    });
    expect(state.axes.survival).toBe(true);
    state = reduceSceneQualityAxes(state, {
      type: "force",
      now: 21_000,
      profile: null,
    });
    expect(state.axes.survival).toBe(true);
  });

  it("never enters survival while a preset is forced", () => {
    const state = hold(
      { ...cpuFloor(), forced: "safety" },
      severeCpu,
      2_000,
      QUALITY_SURVIVAL_FALL_MS * 2,
    );
    expect(state.axes.survival).toBe(false);
  });

  it("does not learn survival from a pinned or diagnostic frame", () => {
    let state = cpuFloor();
    for (
      let now = 2_000;
      now <= 2_000 + QUALITY_SURVIVAL_FALL_MS * 2;
      now += 250
    )
      state = reduceSceneQualityAxes(state, {
        type: "sample",
        now,
        metrics: severeCpu,
        visible: true,
        allowSurvival: false,
      });
    expect(state.axes.survival).toBe(false);
    expect(state.survivalSince).toBeNull();
  });

  it("requires every ordinary floor when severe pressure is unattributed", () => {
    const complete = hold(
      {
        ...start(),
        axes: {
          resolutionStep: 0,
          effects: "minimal",
          content: "minimal",
          survival: false,
        },
      },
      severeUnknown,
      2_000,
      QUALITY_SURVIVAL_FALL_MS,
    );
    expect(complete.axes.survival).toBe(true);

    let locked: SceneQualityAxisState = {
      ...start(),
      axes: {
        resolutionStep: 8,
        effects: "minimal",
        content: "minimal",
        survival: false,
      },
    };
    for (let now = 2_000; now <= 2_000 + QUALITY_SURVIVAL_FALL_MS; now += 250)
      locked = reduceSceneQualityAxes(locked, {
        type: "sample",
        now,
        metrics: severeUnknown,
        visible: true,
        allowResolutionChange: false,
      });
    expect(locked.axes.survival).toBe(false);
  });

  it("repays travel resolution while the meadow remains retired", () => {
    const state = hold(
      {
        ...cpuFloor(),
        axes: {
          ...cpuFloor().axes,
          resolutionStep: 9,
          survival: true,
        },
        preTravelStep: 11,
      },
      headroom,
      2_000,
      QUALITY_RESOLUTION_DWELL_MS * 3,
    );
    expect(state.axes.resolutionStep).toBe(11);
    expect(state.axes.survival).toBe(true);
    expect(state.preTravelStep).toBeNull();
  });
});

/** Travel borrows resolution only on a device that has shown GPU pressure,
 * so a test that expects the borrow has to establish it. Set directly rather
 * than held, to keep these tests about travel instead of re-testing the
 * sampling path that would also move the axis on the way in. */
const gpuPressured = (state = start()): SceneQualityAxisState => ({
  ...state,
  gpuSince: 0,
});

/** The counterpart: a device whose constraint is the main thread, where a
 * pixel cut buys effectively nothing. */
const cpuPressured = (state = start()): SceneQualityAxisState => ({
  ...state,
  cpuSince: 0,
});

describe("travel", () => {
  it("treats duplicate travel starts as one episode", () => {
    const before = gpuPressured();
    const first = reduceSceneQualityAxes(before, {
      type: "travel-start",
      now: 1_000,
    });
    const duplicate = reduceSceneQualityAxes(first, {
      type: "travel-start",
      now: 1_100,
    });

    expect(duplicate).toBe(first);
    expect(duplicate.axes.resolutionStep).toBe(
      before.axes.resolutionStep - QUALITY_TRAVEL_RESOLUTION_DROP_STEPS,
    );
    expect(duplicate.preTravelStep).toBe(before.axes.resolutionStep);
  });

  it("drops resolution by exactly two steps at travel start, in the same tick", () => {
    const before = gpuPressured();
    const state = reduceSceneQualityAxes(before, {
      type: "travel-start",
      now: 1_000,
    });
    expect(state.axes.resolutionStep).toBe(
      before.axes.resolutionStep - QUALITY_TRAVEL_RESOLUTION_DROP_STEPS,
    );
  });

  it("does not borrow resolution when the main thread is the constraint", () => {
    // Pixels cannot relieve a busy main thread — measured at 0.19 ms for a 61
    // percent cut — and every change resizes the drawing buffer, which the
    // compositor can flash while reallocating. Spending it here was the
    // sampling path's own rule being broken by the one caller exempt from it.
    const before = cpuPressured();
    const state = reduceSceneQualityAxes(before, {
      type: "travel-start",
      now: 1_000,
    });
    expect(state.axes.resolutionStep).toBe(before.axes.resolutionStep);
    expect(state.travelling).toBe(true);
  });

  it("does not borrow resolution on a device with no verdict yet", () => {
    const before = start();
    expect(before.gpuSince).toBeNull();
    const state = reduceSceneQualityAxes(before, {
      type: "travel-start",
      now: 1_000,
    });
    expect(state.axes.resolutionStep).toBe(before.axes.resolutionStep);
  });

  it("does not borrow resolution on a platform with a locked drawing buffer", () => {
    const before = gpuPressured();
    const state = reduceSceneQualityAxes(before, {
      type: "travel-start",
      now: 1_000,
      allowResolutionChange: false,
    });
    expect(state.axes.resolutionStep).toBe(before.axes.resolutionStep);
    expect(state.preTravelStep).toBeNull();
  });

  it("records no debt and restarts no dwell when it does not borrow", () => {
    // A repayment for a loan never taken would walk resolution upward on its
    // own, and restarting the dwell on an axis that did not move would let
    // repeated travel hold it still for as long as the travelling lasted.
    const before = cpuPressured();
    const state = reduceSceneQualityAxes(before, {
      type: "travel-start",
      now: 1_000,
    });
    expect(state.preTravelStep).toBeNull();
    expect(state.axisChangedAt.resolution).toBe(
      before.axisChangedAt.resolution,
    );
    expect(state.lastChange).toBe(before.lastChange);
  });

  it("still counts an over-budget travel it declined to prepare for", () => {
    // The after-the-fact path is what makes declining safe: a travel that
    // really is too expensive is caught by its own frames.
    let state = cpuPressured();
    state = reduceSceneQualityAxes(state, { type: "travel-start", now: 1_000 });
    for (let i = 0; i < 100; i += 1)
      state = reduceSceneQualityAxes(state, {
        type: "travel-frame",
        frameMs: i < 30 ? 40 : 10,
      });
    state = reduceSceneQualityAxes(state, { type: "travel-end", now: 3_000 });
    expect(state.consecutiveOverBudgetTravels).toBe(1);
  });

  it("changes no other axis at travel start", () => {
    const before = start();
    const state = reduceSceneQualityAxes(before, {
      type: "travel-start",
      now: 1_000,
    });
    expect(state.axes.effects).toBe(before.axes.effects);
    expect(state.axes.content).toBe(before.axes.content);
  });

  it("does not wait for a sample or for the dwell", () => {
    // Travel start lands immediately after a resolution change, which would
    // otherwise be inside the dwell.
    let state = hold(start(), gpuBound, 2_000, 300);
    const stepped = state.axes.resolutionStep;
    state = reduceSceneQualityAxes(state, { type: "travel-start", now: 2_400 });
    expect(state.axes.resolutionStep).toBe(
      stepped - QUALITY_TRAVEL_RESOLUTION_DROP_STEPS,
    );
  });

  it("emits no content change while travel is in progress", () => {
    let state = reduceSceneQualityAxes(start(), {
      type: "travel-start",
      now: 1_000,
    });
    state = hold(state, cpuBound, 1_500, QUALITY_CONTENT_FALL_MS * 2);
    expect(state.axes.content).toBe("full");
  });

  it("applies a content change requested during travel at the first settled window", () => {
    let state = reduceSceneQualityAxes(start(), {
      type: "travel-start",
      now: 1_000,
    });
    state = hold(state, cpuBound, 1_500, QUALITY_CONTENT_FALL_MS + 500);
    expect(state.deferredContent).toBe("reduced");
    expect(state.axes.content).toBe("full");

    state = reduceSceneQualityAxes(state, { type: "travel-end", now: 13_000 });
    // Still inside travel validation: not yet trustworthy.
    state = hold(state, cpuBound, 13_100, 500);
    expect(state.axes.content).toBe("full");

    state = hold(state, cpuBound, 16_000, 500);
    expect(state.axes.content).toBe("reduced");
    expect(state.transitions.at(-1)).toMatchObject({
      axis: "content",
      reason: "deferred",
    });
  });

  it("discards a deferred request whose classification no longer holds", () => {
    let state = reduceSceneQualityAxes(start(), {
      type: "travel-start",
      now: 1_000,
    });
    state = hold(state, cpuBound, 1_500, QUALITY_CONTENT_FALL_MS + 500);
    state = reduceSceneQualityAxes(state, { type: "travel-end", now: 13_000 });
    state = hold(state, headroom, 16_000, 500);
    expect(state.axes.content).toBe("full");
    expect(state.deferredContent).toBeNull();
  });

  it("defers only the next content tier rather than queueing several", () => {
    let state = reduceSceneQualityAxes(start(), {
      type: "travel-start",
      now: 1_000,
    });
    state = hold(state, cpuBound, 1_500, QUALITY_CONTENT_FALL_MS * 3);
    expect(state.deferredContent).toBe("reduced");
    expect(state.axes.content).toBe("full");
  });

  it("restores toward the remembered step and never above it", () => {
    let state = gpuPressured();
    state = reduceSceneQualityAxes(state, { type: "travel-start", now: 1_000 });
    const during = state.axes.resolutionStep;
    state = reduceSceneQualityAxes(state, { type: "travel-end", now: 4_000 });
    state = hold(state, headroom, 8_000, 60_000);
    expect(state.axes.resolutionStep).toBeGreaterThan(during);
    expect(state.axes.resolutionStep).toBeLessThanOrEqual(
      SCENE_RESOLUTION_MAX_STEP,
    );
    expect(
      state.transitions.some(({ reason }) => reason === "travel-repay"),
    ).toBe(true);
  });

  it("waits for travel validation and restores one resolution step per dwell", () => {
    let state = gpuPressured();
    state = reduceSceneQualityAxes(state, { type: "travel-start", now: 1_000 });
    const during = state.axes.resolutionStep;
    state = reduceSceneQualityAxes(state, { type: "travel-end", now: 4_000 });

    expect(state.axes.resolutionStep).toBe(during);
    expect(state.preTravelStep).toBe(SCENE_RESOLUTION_MAX_STEP);

    state = hold(state, headroom, 4_250, 1_500);
    expect(state.axes.resolutionStep).toBe(during);

    state = hold(state, headroom, 6_500, 0);
    expect(state.axes.resolutionStep).toBe(during + 1);

    state = hold(state, headroom, 6_750, 1_000);
    expect(state.axes.resolutionStep).toBe(during + 1);
    state = hold(state, headroom, 8_000, 0);
    expect(state.axes.resolutionStep).toBe(during + 2);
  });

  it("pauses borrowed-resolution debt under GPU pressure and repays it later", () => {
    let state = gpuPressured();
    state = reduceSceneQualityAxes(state, { type: "travel-start", now: 1_000 });
    const target = state.preTravelStep;
    state = reduceSceneQualityAxes(state, { type: "travel-end", now: 4_000 });

    state = reduceSceneQualityAxes(state, {
      type: "sample",
      now: 7_000,
      metrics: gpuBound,
      visible: true,
    });
    expect(state.preTravelStep).toBe(target);

    const borrowedStep = state.axes.resolutionStep;
    state = reduceSceneQualityAxes(state, {
      type: "sample",
      now: 9_000,
      metrics: metrics({ p95: 17, droppedFrameRatio: 0.06, cpuMs: 10 }),
      visible: true,
    });
    expect(state.axes.resolutionStep).toBe(borrowedStep + 1);
    expect(state.preTravelStep).toBe(target);
  });
});

describe("the travel budget", () => {
  const travel = (
    state: SceneQualityAxisState,
    at: number,
    lateRatio: number,
  ) => {
    let next = reduceSceneQualityAxes(state, { type: "travel-start", now: at });
    for (let i = 0; i < 100; i += 1)
      next = reduceSceneQualityAxes(next, {
        type: "travel-frame",
        frameMs: i < lateRatio * 100 ? 40 : 10,
      });
    return reduceSceneQualityAxes(next, {
      type: "travel-end",
      now: at + 2_000,
    });
  };

  it("counts a travel as over budget past a fifth of its frames", () => {
    const state = travel(start(), 1_000, 0.3);
    expect(state.consecutiveOverBudgetTravels).toBe(1);
  });

  it("counts a travel inside its budget as clean", () => {
    const state = travel(start(), 1_000, 0.1);
    expect(state.consecutiveOverBudgetTravels).toBe(0);
  });

  it("changes nothing after a single over-budget travel", () => {
    let state = travel(start(), 1_000, 0.3);
    state = hold(state, headroom, 6_000, 2_000);
    expect(state.axes.content).toBe("full");
  });

  it("permits one content step after three consecutive over-budget travels", () => {
    let state = start();
    for (let i = 0; i < QUALITY_TRAVEL_OVER_BUDGET_LIMIT; i += 1)
      state = travel(state, 1_000 + i * 10_000, 0.3);
    expect(state.consecutiveOverBudgetTravels).toBe(
      QUALITY_TRAVEL_OVER_BUDGET_LIMIT,
    );
    state = hold(state, headroom, 40_000, 500);
    expect(state.axes.content).toBe("reduced");
    expect(state.transitions.at(-1)).toMatchObject({
      axis: "content",
      reason: "travel-budget",
    });
  });

  it("resets the count on any travel that meets its budget", () => {
    let state = start();
    state = travel(state, 1_000, 0.3);
    state = travel(state, 11_000, 0.3);
    state = travel(state, 21_000, 0.05);
    expect(state.consecutiveOverBudgetTravels).toBe(0);
  });

  it("spends the earned step only once", () => {
    let state = start();
    for (let i = 0; i < QUALITY_TRAVEL_OVER_BUDGET_LIMIT; i += 1)
      state = travel(state, 1_000 + i * 10_000, 0.3);
    state = hold(state, headroom, 40_000, 500);
    expect(state.consecutiveOverBudgetTravels).toBe(0);
  });
});

describe("a forced preset", () => {
  it("pins both visible axes to the preset", () => {
    const state = reduceSceneQualityAxes(start(), {
      type: "force",
      now: 1_000,
      profile: "safety",
    });
    expect(state.axes.effects).toBe("minimal");
    expect(state.axes.content).toBe("minimal");
  });

  it("leaves resolution free to fall under pressure", () => {
    // This is what lets a forced Safety still shed pixels without
    // contradicting the pin.
    let state = reduceSceneQualityAxes(start(), {
      type: "force",
      now: 1_000,
      profile: "safety",
    });
    state = hold(state, gpuBound, 2_000, QUALITY_RESOLUTION_DWELL_MS + 500);
    expect(state.axes.resolutionStep).toBeLessThan(SCENE_RESOLUTION_MAX_STEP);
  });

  it("holds the pinned tiers however long the pressure lasts", () => {
    let state = reduceSceneQualityAxes(start(), {
      type: "force",
      now: 1_000,
      profile: "efficient",
    });
    state = hold(state, cpuBound, 2_000, QUALITY_CONTENT_FALL_MS * 3);
    expect(state.axes.effects).toBe("lean");
    expect(state.axes.content).toBe("reduced");
  });

  it("holds the pinned tiers however long the headroom lasts", () => {
    let state = reduceSceneQualityAxes(start(), {
      type: "force",
      now: 1_000,
      profile: "efficient",
    });
    state = hold(state, headroom, 2_000, QUALITY_CONTENT_RISE_MS + 2_000);
    expect(state.axes.content).toBe("reduced");
  });

  it("returns the axes to automatic control when the force is cleared", () => {
    let state = reduceSceneQualityAxes(start(), {
      type: "force",
      now: 1_000,
      profile: "safety",
    });
    state = reduceSceneQualityAxes(state, {
      type: "force",
      now: 2_000,
      profile: null,
    });
    expect(state.forced).toBeNull();
  });
});

describe("windows that prove nothing", () => {
  it("ignores a production window that has not filled yet", () => {
    const before = { ...start(), gpuSince: 0 };
    const short = reduceSceneQualityAxes(before, {
      type: "sample",
      now: 3_000,
      metrics: { ...gpuBound, windowMs: 250 },
      visible: true,
    });
    expect(short.axes).toEqual(before.axes);

    const complete = reduceSceneQualityAxes(before, {
      type: "sample",
      now: 3_000,
      metrics: { ...gpuBound, windowMs: 1_900 },
      visible: true,
    });
    expect(complete.axes.resolutionStep).toBe(before.axes.resolutionStep - 1);
  });

  it("ignores a hidden window", () => {
    const state = reduceSceneQualityAxes(start(), {
      type: "sample",
      now: 5_000,
      metrics: gpuBound,
      visible: false,
    });
    expect(state).toEqual(start());
  });

  it("ignores a window with too few frames", () => {
    const state = reduceSceneQualityAxes(start(), {
      type: "sample",
      now: 5_000,
      metrics: metrics({ sampleCount: 1 }),
      visible: true,
    });
    expect(state).toEqual(start());
  });

  it("moves nothing on an unclassifiable window", () => {
    const unknown = metrics({ p95: 17, droppedFrameRatio: 0.06, cpuMs: 10 });
    const state = hold(start(), unknown, 2_000, 60_000);
    expect(state.axes).toEqual(start().axes);
  });

  it("clears pre-suspension evidence and waits for fresh foreground time", () => {
    const before: SceneQualityAxisState = {
      ...start(),
      gpuSince: 1_000,
      pendingBaseline: gpuBound,
      pendingBaselineExpiresAt: 10_000,
      resolutionRetryAt: 20_000,
    };
    const hidden = reduceSceneQualityAxes(before, {
      type: "visibility-hidden",
      now: 2_000,
    });

    expect(hidden.axes).toEqual(before.axes);
    expect(hidden.gpuSince).toBeNull();
    expect(hidden.pendingBaseline).toBeNull();
    expect(hidden.foregroundReadyAt).toBeNull();
    expect(hidden.resolutionRetryAt).toBe(20_000);

    let resumed = reduceSceneQualityAxes(hidden, {
      type: "visibility-visible",
      now: 60_000,
    });
    resumed = reduceSceneQualityAxes(resumed, {
      type: "sample",
      now: 60_250,
      metrics: gpuBound,
      visible: true,
    });
    expect(resumed.axes).toEqual(before.axes);
    expect(resumed.gpuSince).toBeNull();
  });

  it("restarts an unfinished boot guard after foreground resume", () => {
    const guarding: SceneQualityAxisState = {
      ...start(),
      bootDeclineGuard: true,
      bootGuardExpiresAt: 5_000,
    };
    const hidden = reduceSceneQualityAxes(guarding, {
      type: "visibility-hidden",
      now: 2_000,
    });
    const resumed = reduceSceneQualityAxes(hidden, {
      type: "visibility-visible",
      now: 60_000,
    });

    expect(resumed.bootGuardExpiresAt).toBe(60_000 + QUALITY_BOOT_GUARD_MS);
  });

  it("validates healthy pacing and invalidates it across suspension", () => {
    const validated = reduceSceneQualityAxes(start(), {
      type: "sample",
      now: 3_000,
      metrics: headroom,
      visible: true,
    });
    expect(validated.validation).toMatchObject({
      at: 3_000,
      reason: "acceptable-pacing",
    });

    const hidden = reduceSceneQualityAxes(validated, {
      type: "visibility-hidden",
      now: 4_000,
    });
    expect(hidden.validation).toBeNull();
  });

  it("keeps the first acceptable-pacing validation stable across identical headroom samples", () => {
    const validated = reduceSceneQualityAxes(start(), {
      type: "sample",
      now: 3_000,
      metrics: headroom,
      visible: true,
    });
    const repeated = reduceSceneQualityAxes(validated, {
      type: "sample",
      now: 3_250,
      metrics: headroom,
      visible: true,
    });

    expect(repeated).toBe(validated);
    expect(repeated.validation?.at).toBe(3_000);
  });
});

describe("inferred GPU decline accounting", () => {
  it("waits for a complete post-change window before judging a cut", () => {
    const baseline = metrics({
      p50: 24,
      p95: 40,
      droppedFrameRatio: 0.3,
      cpuP50: 4,
      cpuMs: 5,
    });
    let state = reduceSceneQualityAxes(
      { ...start(), gpuSince: 0 },
      {
        type: "sample",
        now: 2_000,
        metrics: baseline,
        visible: true,
      },
    );
    const afterCut = state.axes.resolutionStep;

    state = reduceSceneQualityAxes(state, {
      type: "sample",
      now: 2_000 + QUALITY_RESOLUTION_DWELL_MS,
      metrics: metrics({
        p50: 20,
        p95: 32,
        droppedFrameRatio: 0.2,
        cpuP50: 4,
        cpuMs: 5,
      }),
      visible: true,
    });

    expect(state.axes.resolutionStep).toBe(afterCut);
    expect(state.pendingBaseline).toBe(baseline);
  });

  it("does not reopen the two-cut budget after one improving comparison", () => {
    const baseline = metrics({
      p50: 24,
      p95: 40,
      droppedFrameRatio: 0.3,
      cpuP50: 4,
      cpuMs: 5,
    });
    const state = reduceSceneQualityAxes(
      {
        ...start(),
        axes: {
          ...start().axes,
          resolutionStep: SCENE_RESOLUTION_MAX_STEP - 1,
        },
        gpuSince: 1_000,
        pendingBaseline: baseline,
        pendingBaselineExpiresAt: 10_000,
        lastChange: {
          axis: "resolution",
          direction: "down",
          reason: "pressure",
        },
        unhelpfulResolutionSteps: 1,
      },
      {
        type: "sample",
        now: 5_000,
        metrics: metrics({
          p50: 20,
          p95: 34,
          droppedFrameRatio: 0.26,
          cpuP50: 4,
          cpuMs: 5,
        }),
        visible: true,
      },
    );

    expect(state.unhelpfulResolutionSteps).toBe(1);
  });

  it("bounds a locally improving inferred-GPU staircase against its descent anchor", () => {
    const byStep = new Map<number, SceneQualityMetrics>([
      [
        6,
        metrics({
          p50: 24,
          p95: 38,
          droppedFrameRatio: 0.337,
          cpuP50: 6,
          cpuMs: 6,
        }),
      ],
      [
        5,
        metrics({
          p50: 26,
          p95: 49,
          droppedFrameRatio: 0.534,
          cpuP50: 6,
          cpuMs: 6,
        }),
      ],
      [
        4,
        metrics({
          p50: 23,
          p95: 50,
          droppedFrameRatio: 0.338,
          cpuP50: 6,
          cpuMs: 6,
        }),
      ],
      [
        3,
        metrics({
          p50: 22,
          p95: 49,
          droppedFrameRatio: 0.291,
          cpuP50: 6,
          cpuMs: 6,
        }),
      ],
      [
        2,
        metrics({
          p50: 21,
          p95: 45,
          droppedFrameRatio: 0.198,
          cpuP50: 6,
          cpuMs: 6,
        }),
      ],
      [
        1,
        metrics({
          p50: 20,
          p95: 47,
          droppedFrameRatio: 0.101,
          cpuP50: 6,
          cpuMs: 6,
        }),
      ],
    ]);
    let state: SceneQualityAxisState = {
      ...start("efficient"),
      axes: { ...start("efficient").axes, resolutionStep: 6 },
      axisChangedAt: {
        resolution: 0,
        effects: 0,
        content: 0,
        survival: 0,
      },
    };

    for (let now = 250; now <= 60_000; now += 250) {
      const response = byStep.get(state.axes.resolutionStep) ?? byStep.get(4)!;
      state = reduceSceneQualityAxes(state, {
        type: "sample",
        now,
        metrics: response,
        visible: true,
      });
    }

    expect(state.axes.resolutionStep).toBeGreaterThanOrEqual(
      6 - QUALITY_RESOLUTION_GIVE_UP_STEPS,
    );
    expect(state.unhelpfulResolutionSteps).toBe(
      QUALITY_RESOLUTION_GIVE_UP_STEPS,
    );
  });

  it("does not spend the remaining ladder when tail latency improves but median cadence does not", () => {
    // Replays the iPhone interruption captured on 2026-08-20. Safari's
    // presentation cadence stayed near 24–26 ms while p95 eased from 40 to
    // 34 ms. Treating that tail-only change as proof that pixels were scarce
    // walked a forced Efficient preset from R4 to R0 without restoring FPS.
    const byStep = new Map<number, SceneQualityMetrics>([
      [
        4,
        metrics({
          p50: 25,
          p95: 40,
          droppedFrameRatio: 0.473,
          cpuP50: 6,
          cpuMs: 9,
        }),
      ],
      [
        3,
        metrics({
          p50: 26,
          p95: 37,
          droppedFrameRatio: 0.513,
          cpuP50: 6,
          cpuMs: 10,
        }),
      ],
      [
        2,
        metrics({
          p50: 24,
          p95: 35,
          droppedFrameRatio: 0.425,
          cpuP50: 6,
          cpuMs: 11,
        }),
      ],
      [
        1,
        metrics({
          p50: 24,
          p95: 34,
          droppedFrameRatio: 0.402,
          cpuP50: 6,
          cpuMs: 10,
        }),
      ],
    ]);
    let state: SceneQualityAxisState = {
      ...start("efficient"),
      forced: "efficient",
      axes: { ...start("efficient").axes, resolutionStep: 4 },
      axisChangedAt: {
        resolution: 0,
        effects: 0,
        content: 0,
        survival: 0,
      },
    };

    for (let now = 250; now <= 60_000; now += 250) {
      const response = byStep.get(state.axes.resolutionStep) ?? byStep.get(1)!;
      state = reduceSceneQualityAxes(state, {
        type: "sample",
        now,
        metrics: response,
        visible: true,
      });
    }

    expect(state.axes.resolutionStep).toBe(2);
    expect(state.unhelpfulResolutionSteps).toBe(
      QUALITY_RESOLUTION_GIVE_UP_STEPS,
    );
  });
});

describe("the boot grace period", () => {
  const cold = () => initialSceneQualityAxisState("balanced", 0);

  it("consumes no window before boot completes", () => {
    const state = hold(cold(), gpuBound, 2_000, 60_000);
    expect(state.axes).toEqual(cold().axes);
  });

  it("ignores even a catastrophic opening window", () => {
    const awful = metrics({ p95: 200, droppedFrameRatio: 0.95, cpuMs: 4 });
    const state = hold(cold(), awful, 2_000, 30_000);
    expect(state.axes.resolutionStep).toBe(SCENE_RESOLUTION_MAX_STEP);
  });

  it("starts consuming windows once boot completes", () => {
    let state = reduceSceneQualityAxes(cold(), { type: "booted", now: 1_000 });
    state = hold(state, gpuBound, 2_000, QUALITY_RESOLUTION_DWELL_MS + 500);
    expect(state.axes.resolutionStep).toBeLessThan(SCENE_RESOLUTION_MAX_STEP);
  });

  it("caps the first decline after boot at one step, however severe", () => {
    const awful = metrics({ p95: 200, droppedFrameRatio: 0.95, cpuMs: 4 });
    let state = reduceSceneQualityAxes(cold(), { type: "booted", now: 1_000 });
    // Inside the guard window. Without the cap, severe pressure overrides the
    // block and this walks several steps down on evidence gathered while the
    // scene was still warming up.
    state = hold(state, awful, 2_000, QUALITY_BOOT_GUARD_MS - 3_000);
    expect(state.axes.resolutionStep).toBe(SCENE_RESOLUTION_MAX_STEP - 1);
  });

  it("does not mistake an unchanged zero drop rate for boot improvement", () => {
    // A 50 FPS phone misses the sustained-frame target without crossing the
    // separate 25 ms dropped-frame line. The unchanged 0% drop rate must not
    // retire the first-decline guard and walk resolution to its floor.
    const steady50Fps = summariseSceneFrameWindow(
      Array.from({ length: 100 }, () => ({ ms: 20, cpuMs: 4 })),
    )!;
    expect(steady50Fps.droppedFrameRatio).toBe(0);

    let state = reduceSceneQualityAxes(
      initialSceneQualityAxisState("efficient", 0, null, 6),
      { type: "booted", now: 0 },
    );
    state = hold(state, steady50Fps, 250, QUALITY_BOOT_GUARD_MS - 500);

    expect(state.axes.resolutionStep).toBe(5);
  });

  it("lets the guard lapse on a device that never offers a better window", () => {
    // The cap must not become a permanent pin. An evidence-only exit
    // deadlocked here: identical windows never count as improvement, so a
    // steadily struggling phone stayed one step below where it started,
    // forever, which is the opposite of what the cap is for.
    const awful = metrics({ p95: 200, droppedFrameRatio: 0.95, cpuMs: 14 });
    let state = reduceSceneQualityAxes(cold(), { type: "booted", now: 1_000 });
    state = hold(state, awful, 2_000, QUALITY_BOOT_GUARD_MS + 10_000);
    // Something must have moved past the single capped step. Which axis is
    // the give-up rule's business, not the guard's.
    const moved =
      state.axes.resolutionStep < SCENE_RESOLUTION_MAX_STEP - 1 ||
      state.axes.effects !== "full" ||
      state.axes.content !== "full";
    expect(moved).toBe(true);
  });

  it("does not cap later declines", () => {
    const awful = metrics({ p95: 200, droppedFrameRatio: 0.95, cpuMs: 4 });
    let state = reduceSceneQualityAxes(cold(), { type: "booted", now: 1_000 });
    state = hold(state, awful, 2_000, QUALITY_RESOLUTION_DWELL_MS * 2);
    const afterFirst = state.axes.resolutionStep;
    // One window showing improvement retires the guard.
    state = hold(state, headroom, 12_000, 500);
    state = hold(state, awful, 14_000, QUALITY_RESOLUTION_DWELL_MS * 4);
    expect(state.axes.resolutionStep).toBeLessThan(afterFirst - 1);
  });

  it("treats a repeated boot signal as a no-op", () => {
    const first = reduceSceneQualityAxes(cold(), {
      type: "booted",
      now: 1_000,
    });
    expect(reduceSceneQualityAxes(first, { type: "booted", now: 9_000 })).toBe(
      first,
    );
  });
});

describe("reachability from a cold start", () => {
  /** Run a fresh, booted controller against one unchanging classification for
   * five minutes and report where each axis ends up. This is the shape the
   * whole issue exists to produce, and it is the test that was missing: every
   * other case here starts the controller partway along. */
  const soak = (value: SceneQualityMetrics) => {
    let state = reduceSceneQualityAxes(
      initialSceneQualityAxisState("balanced", 0),
      { type: "booted", now: 0 },
    );
    for (let t = 1_000; t < 300_000; t += 250)
      state = reduceSceneQualityAxes(state, {
        type: "sample",
        now: t,
        metrics: value,
        visible: true,
      });
    return state;
  };

  it("takes a main-thread-bound phone all the way to the cheapest geometry", () => {
    // The headline case. Three separate deadlocks used to stop this at
    // resolution step 10 with full geometry: an evidence-only boot guard, an
    // evidence-only cross-axis block, and content gated behind GPU-only
    // levers that could not relieve a main-thread bottleneck.
    const axes = soak(cpuBound).axes;
    expect(axes.effects).toBe("full");
    expect(axes.content).toBe("minimal");
    // Resolution deliberately does NOT bottom out here: it was shown not to
    // help, so the scene keeps the pixels it cannot profit from spending.
    expect(axes.resolutionStep).toBeGreaterThan(0);
  });

  it("takes ordinary measured GPU pressure to pixels and effects only", () => {
    // Geometry is not the GPU's problem here, so content does not move before
    // the last-resort field retirement.
    expect(soak(measuredGpuBound).axes).toEqual({
      resolutionStep: 0,
      effects: "minimal",
      content: "full",
      survival: false,
    });
  });

  it("leaves a healthy device exactly where it started", () => {
    expect(soak(headroom).axes).toEqual({
      resolutionStep: SCENE_RESOLUTION_MAX_STEP,
      effects: "full",
      content: "full",
      survival: false,
    });
  });

  it("routes CPU pressure directly to content", () => {
    let state = reduceSceneQualityAxes(
      initialSceneQualityAxisState("balanced", 0),
      { type: "booted", now: 0 },
    );
    let contentMovedAt: number | null = null;

    for (let t = 1_000; t < 300_000; t += 250) {
      state = reduceSceneQualityAxes(state, {
        type: "sample",
        now: t,
        metrics: cpuBound,
        visible: true,
      });
      if (contentMovedAt == null && state.axes.content !== "full")
        contentMovedAt = t;
    }
    expect(contentMovedAt).not.toBeNull();
    expect(contentMovedAt!).toBeGreaterThanOrEqual(QUALITY_CONTENT_FALL_MS);
    expect(state.axes.effects).toBe("full");
    expect(state.axes.resolutionStep).toBe(SCENE_RESOLUTION_MAX_STEP);
  });
});

describe("recovery", () => {
  /** Drive a controller to the bottom, then hand it sustained headroom. */
  const bottomOut = () => {
    let state = reduceSceneQualityAxes(
      initialSceneQualityAxisState("balanced", 0),
      { type: "booted", now: 0 },
    );
    for (let t = 1_000; t < 60_000; t += 250)
      state = reduceSceneQualityAxes(state, {
        type: "sample",
        now: t,
        metrics: measuredGpuBound,
        visible: true,
      });
    return state;
  };
  const recover = (from: SceneQualityAxisState, untilMs: number) => {
    let state = from;
    for (let t = 60_000; t < untilMs; t += 250)
      state = reduceSceneQualityAxes(state, {
        type: "sample",
        now: t,
        metrics: headroom,
        visible: true,
      });
    return state;
  };

  it("climbs resolution back to the ceiling on sustained headroom", () => {
    // A single rough patch must not permanently cost a device its pixels.
    const bottom = bottomOut();
    expect(bottom.axes.resolutionStep).toBe(0);
    expect(recover(bottom, 300_000).axes.resolutionStep).toBe(
      SCENE_RESOLUTION_MAX_STEP,
    );
  });

  it("lets a fresh conservative phone start climb without a failure retry", () => {
    const startingStep = 6;
    let state = initialSceneQualityAxisState(
      "efficient",
      0,
      null,
      startingStep,
    );
    state = reduceSceneQualityAxes(state, { type: "booted", now: 0 });
    expect(state.resolutionRetryAt).toBeNull();

    state = hold(state, headroom, 2_000, QUALITY_EFFECTS_RISE_MS + 1_000);
    expect(state.axes.resolutionStep).toBeGreaterThan(startingStep);
  });

  it("holds a cheaper effects tier before retrying visible spatial passes", () => {
    let state: SceneQualityAxisState = {
      ...start(),
      axes: {
        resolutionStep: 0,
        effects: "lean",
        content: "full",
        survival: false,
      },
      effectsRetryAt: 10_000 + QUALITY_EFFECTS_RETRY_MS,
    };

    state = hold(state, headroom, 10_000, QUALITY_EFFECTS_RISE_MS * 2);
    expect(state.axes.effects).toBe("lean");

    state = hold(
      state,
      headroom,
      10_000 + QUALITY_EFFECTS_RETRY_MS,
      QUALITY_EFFECTS_RISE_MS,
    );
    expect(state.axes.effects).toBe("full");
  });

  it("climbs one step at a time rather than snapping back", () => {
    // Each step reallocates composer targets, so a jump to the ceiling would
    // be the hitch this ladder exists to avoid. Recovery also waits before
    // retrying the step that last proved too expensive.
    const bottom = bottomOut();
    const partly = recover(
      bottom,
      Math.max(60_000, bottom.resolutionRetryAt ?? 0) + 10_000,
    );
    expect(partly.axes.resolutionStep).toBeGreaterThan(0);
    expect(partly.axes.resolutionStep).toBeLessThan(SCENE_RESOLUTION_MAX_STEP);
  });

  it("restores effects too, and stops at the automatic ceiling", () => {
    const recovered = recover(bottomOut(), 300_000);
    // Showcase's tier, not Cinematic: that one stays manual.
    expect(recovered.axes.effects).toBe("full");
  });

  it("never climbs past the ceiling however long the headroom lasts", () => {
    const recovered = recover(bottomOut(), 600_000);
    expect(recovered.axes.resolutionStep).toBe(SCENE_RESOLUTION_MAX_STEP);
    expect(recovered.axes.effects).toBe("full");
    expect(recovered.axes.content).toBe("full");
  });

  it("gives back what travel borrowed, without needing headroom to do it", () => {
    // Measured on an M5 Max: `res 3/11` while CPU bound. Travel drops two
    // steps unconditionally; the restore used to live only in the headroom
    // branch, which a main-thread-bound machine never reaches. Every
    // navigation cost two more steps, permanently, on an axis that cannot
    // help a main-thread problem at all.
    const cpuBound = {
      targetFrameMs: 16.667,
      targetHz: 60,
      p95: 48,
      droppedFrameRatio: 0.089,
      sampleCount: 120,
      cpuMs: 44,
      gpuMs: null,
    };
    let state = initialSceneQualityAxisState("balanced", 0);
    state = reduceSceneQualityAxes(state, { type: "booted", now: 0 });
    let now = 20_000;
    for (let trip = 0; trip < 4; trip += 1) {
      state = reduceSceneQualityAxes(state, { type: "travel-start", now });
      now += 1_000;
      state = reduceSceneQualityAxes(state, { type: "travel-end", now });
      now += 6_000;
      state = reduceSceneQualityAxes(state, {
        type: "sample",
        now,
        metrics: cpuBound,
        visible: true,
      });
      now += QUALITY_RESOLUTION_DWELL_MS;
      state = reduceSceneQualityAxes(state, {
        type: "sample",
        now,
        metrics: cpuBound,
        visible: true,
      });
      now += 1_000;
    }
    expect(state.axes.resolutionStep).toBe(SCENE_RESOLUTION_MAX_STEP);
  });

  it("never spends resolution on main-thread pressure", () => {
    // A pixel count cannot touch the main thread: draw calls, matrix
    // updates, culling and every line of JS are identical at 0.6x and at
    // 1.75x. Measured at 0.19 ms for a 61 percent pixel cut. Spending it
    // anyway cost a blurrier scene AND a full composer reallocation.
    let state = initialSceneQualityAxisState("balanced", 0);
    state = reduceSceneQualityAxes(state, { type: "booted", now: 0 });
    const cpuBound = {
      targetFrameMs: 16.667,
      targetHz: 60,
      p95: 30,
      droppedFrameRatio: 0.4,
      sampleCount: 120,
      cpuMs: 26,
      gpuMs: null,
    };
    for (let now = 20_000; now <= 200_000; now += 1_000)
      state = reduceSceneQualityAxes(state, {
        type: "sample",
        now,
        metrics: cpuBound,
        visible: true,
      });
    expect(state.axes.resolutionStep).toBe(SCENE_RESOLUTION_MAX_STEP);
    // The visible axes are what answer a main-thread problem, and they did.
    expect(state.axes.content).toBe("minimal");
  });
});
