import { describe, expect, it } from "vitest";

import {
  NARROW_VIEWPORT_DPR_CAP_BY_PROFILE,
  SCENE_FRAME_BUDGET_MS,
  SCENE_QUALITY_PROFILES,
  type SceneQualityMetrics,
} from "./quality";
import {
  AXES_BY_PROFILE,
  QUALITY_CONTENT_FALL_MS,
  QUALITY_CONTENT_RISE_MS,
  QUALITY_EFFECTS_FALL_MS,
  QUALITY_EFFECTS_RISE_MS,
  QUALITY_BOOT_GUARD_MS,
  QUALITY_RESOLUTION_DWELL_MS,
  QUALITY_TRAVEL_OVER_BUDGET_LIMIT,
  QUALITY_TRAVEL_RESOLUTION_DROP_STEPS,
  SCENE_RESOLUTION_FLOOR,
  SCENE_RESOLUTION_MAX_STEP,
  SCENE_RESOLUTION_STEP_COUNT,
  type SceneQualityAxisState,
  initialSceneQualityAxisState,
  reduceSceneQualityAxes,
  requestContentTier,
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
) {
  let next = state;
  for (let t = fromMs; t <= fromMs + durationMs; t += stepMs)
    next = reduceSceneQualityAxes(next, {
      type: "sample",
      now: t,
      metrics: value,
      visible: true,
    });
  return next;
}

/** A booted controller in steady state, past the one-shot boot decline guard.
 * Boot suppression and that guard have their own describe block below; every
 * other test here is about behaviour once the scene has settled. */
const start = (profile = "balanced" as const): SceneQualityAxisState => ({
  ...reduceSceneQualityAxes(initialSceneQualityAxisState(profile, 0), {
    type: "booted",
    now: 0,
  }),
  bootDeclineGuard: false,
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
    const ratios = Array.from({ length: SCENE_RESOLUTION_MAX_STEP }, (_, i) =>
      resolutionScaleForStep(i + 1, 3) / resolutionScaleForStep(i, 3),
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
    expect(resolutionScaleForStep(-5, 3)).toBeCloseTo(SCENE_RESOLUTION_FLOOR, 6);
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

  it("leaves the preset narrow-viewport caps untouched", () => {
    expect(NARROW_VIEWPORT_DPR_CAP_BY_PROFILE).toMatchObject({
      showcase: 2,
      balanced: 1.75,
      efficient: 1.5,
      safety: 1.25,
    });
  });
});

describe("axis independence", () => {
  it("moves resolution and leaves content alone under GPU pressure", () => {
    const state = hold(start(), gpuBound, 2_000, QUALITY_EFFECTS_FALL_MS * 2);
    expect(state.axes.resolutionStep).toBeLessThan(SCENE_RESOLUTION_MAX_STEP);
    expect(state.axes.content).toBe("full");
  });

  it("leaves effects alone while resolution still has room", () => {
    const state = hold(start(), gpuBound, 2_000, QUALITY_EFFECTS_FALL_MS * 2);
    expect(state.axes.effects).toBe("full");
  });

  it("walks resolution to the floor under GPU pressure", () => {
    let state = start();
    for (let i = 0; i < SCENE_RESOLUTION_MAX_STEP + 2; i += 1)
      state = hold(
        state,
        gpuBound,
        2_000 + i * (QUALITY_RESOLUTION_DWELL_MS + 500),
        QUALITY_RESOLUTION_DWELL_MS + 250,
      );
    expect(state.axes.resolutionStep).toBe(0);
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
    ]);
  });
});

describe("the resolution dwell", () => {
  it("takes at most one step inside a single dwell", () => {
    const state = hold(start(), gpuBound, 2_000, QUALITY_RESOLUTION_DWELL_MS - 500);
    expect(state.axes.resolutionStep).toBe(SCENE_RESOLUTION_MAX_STEP - 1);
  });

  it("defers the whole decision rather than passing the turn to a slower axis", () => {
    // A dwell is a short wait. Spending a visible lever to avoid it is the
    // wrong trade, so nothing else may move while it is running.
    const state = hold(start(), cpuBound, 2_000, QUALITY_RESOLUTION_DWELL_MS - 500);
    expect(state.axes.effects).toBe("full");
    expect(state.axes.content).toBe("full");
  });
});

describe("the one-axis-at-a-time block", () => {
  /** Resolution spent, effects spent, one unproven change on the books. The
   * only axis left with anywhere to go is content. */
  const afterUnprovenChange = (): SceneQualityAxisState => ({
    ...start(),
    axes: { resolutionStep: 0, effects: "minimal", content: "full" },
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
    const state = hold(start(), gpuBound, 2_000, QUALITY_RESOLUTION_DWELL_MS * 4);
    expect(state.axes.resolutionStep).toBeLessThan(
      SCENE_RESOLUTION_MAX_STEP - 1,
    );
  });
});

describe("effects and content time constants", () => {
  const atFloor = (): SceneQualityAxisState => ({
    ...start(),
    axes: { resolutionStep: 0, effects: "full", content: "full" },
  });

  it("moves effects on a sustained GPU constraint and leaves content alone", () => {
    const state = hold(atFloor(), gpuBound, 2_000, QUALITY_EFFECTS_FALL_MS + 500);
    expect(state.axes.effects).toBe("lean");
    expect(state.axes.content).toBe("full");
  });

  it("does not move effects before the sustain elapses", () => {
    const state = hold(atFloor(), gpuBound, 2_000, QUALITY_EFFECTS_FALL_MS - 1_000);
    expect(state.axes.effects).toBe("full");
  });

  it("resets an axis clock when the classification breaks", () => {
    let state = hold(atFloor(), gpuBound, 2_000, QUALITY_EFFECTS_FALL_MS - 1_000);
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
      axes: { resolutionStep: 0, effects: "minimal", content: "full" },
    };
    const state = hold(base, cpuBound, 2_000, QUALITY_CONTENT_FALL_MS + 500);
    expect(state.axes.content).toBe("reduced");
  });

  it("leaves content alone under a GPU constraint however long it lasts", () => {
    const base: SceneQualityAxisState = {
      ...start(),
      axes: { resolutionStep: 0, effects: "minimal", content: "full" },
    };
    const state = hold(base, gpuBound, 2_000, QUALITY_CONTENT_FALL_MS * 2);
    expect(state.axes.content).toBe("full");
  });

  it("climbs back on sustained headroom", () => {
    const base: SceneQualityAxisState = {
      ...start(),
      axes: { resolutionStep: 0, effects: "lean", content: "reduced" },
    };
    const state = hold(base, headroom, 2_000, QUALITY_CONTENT_RISE_MS + 1_000);
    expect(state.axes.content).toBe("full");
  });

  it("climbs effects sooner than content, since content is the visible one", () => {
    expect(QUALITY_EFFECTS_RISE_MS).toBeLessThan(QUALITY_CONTENT_RISE_MS);
    expect(QUALITY_EFFECTS_FALL_MS).toBeLessThan(QUALITY_CONTENT_FALL_MS);
  });
});

describe("travel", () => {
  it("drops resolution by exactly two steps at travel start, in the same tick", () => {
    const before = start();
    const state = reduceSceneQualityAxes(before, {
      type: "travel-start",
      now: 1_000,
    });
    expect(state.axes.resolutionStep).toBe(
      before.axes.resolutionStep - QUALITY_TRAVEL_RESOLUTION_DROP_STEPS,
    );
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
    state = requestContentTier(state, "reduced");
    expect(state.axes.content).toBe("full");

    state = reduceSceneQualityAxes(state, { type: "travel-end", now: 4_000 });
    // Still inside travel validation: not yet trustworthy.
    state = hold(state, cpuBound, 4_100, 500);
    expect(state.axes.content).toBe("full");

    state = hold(state, cpuBound, 8_000, 500);
    expect(state.axes.content).toBe("reduced");
  });

  it("discards a deferred request whose classification no longer holds", () => {
    let state = reduceSceneQualityAxes(start(), {
      type: "travel-start",
      now: 1_000,
    });
    state = requestContentTier(state, "reduced");
    state = reduceSceneQualityAxes(state, { type: "travel-end", now: 4_000 });
    state = hold(state, headroom, 8_000, 500);
    expect(state.axes.content).toBe("full");
    expect(state.deferredContent).toBeNull();
  });

  it("holds at most one deferred request, replacing rather than queueing", () => {
    let state = reduceSceneQualityAxes(start(), {
      type: "travel-start",
      now: 1_000,
    });
    state = requestContentTier(state, "reduced");
    state = requestContentTier(state, "minimal");
    expect(state.deferredContent).toBe("minimal");
  });

  it("restores toward the remembered step and never above it", () => {
    let state = start();
    state = reduceSceneQualityAxes(state, { type: "travel-start", now: 1_000 });
    const during = state.axes.resolutionStep;
    state = reduceSceneQualityAxes(state, { type: "travel-end", now: 4_000 });
    state = hold(state, headroom, 8_000, 60_000);
    expect(state.axes.resolutionStep).toBeGreaterThan(during);
    expect(state.axes.resolutionStep).toBeLessThanOrEqual(
      SCENE_RESOLUTION_MAX_STEP,
    );
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
    return reduceSceneQualityAxes(next, { type: "travel-end", now: at + 2_000 });
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
    const first = reduceSceneQualityAxes(cold(), { type: "booted", now: 1_000 });
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
    // evidence-only cross-axis block, and content gated behind an effects
    // rung that only GPU pressure could move.
    const axes = soak(cpuBound).axes;
    expect(axes.effects).toBe("minimal");
    expect(axes.content).toBe("minimal");
    // Resolution deliberately does NOT bottom out here: it was shown not to
    // help, so the scene keeps the pixels it cannot profit from spending.
    expect(axes.resolutionStep).toBeGreaterThan(0);
  });

  it("takes a GPU-bound device to the cheapest pixels and effects, and no further", () => {
    // Geometry is not the GPU's problem here, so content must not move.
    expect(soak(gpuBound).axes).toEqual({
      resolutionStep: 0,
      effects: "minimal",
      content: "full",
    });
  });

  it("leaves a healthy device exactly where it started", () => {
    expect(soak(headroom).axes).toEqual({
      resolutionStep: SCENE_RESOLUTION_MAX_STEP,
      effects: "full",
      content: "full",
    });
  });

  it("spends the invisible lever first and the visible one last", () => {
    // Ordering, not just destination: resolution must bottom out before
    // effects moves, and effects before content.
    let state = reduceSceneQualityAxes(
      initialSceneQualityAxisState("balanced", 0),
      { type: "booted", now: 0 },
    );
    let effectsMovedAt: number | null = null;
    let contentMovedAt: number | null = null;

    for (let t = 1_000; t < 300_000; t += 250) {
      state = reduceSceneQualityAxes(state, {
        type: "sample",
        now: t,
        metrics: cpuBound,
        visible: true,
      });
      if (effectsMovedAt == null && state.axes.effects !== "full")
        effectsMovedAt = t;
      if (contentMovedAt == null && state.axes.content !== "full")
        contentMovedAt = t;
    }
    expect(effectsMovedAt).not.toBeNull();
    expect(contentMovedAt).not.toBeNull();
    // Effects before content is the ordering that survives: content is the
    // visible one and must be last. Resolution is tried first but may bow out
    // early under CPU pressure, so its floor is not part of the contract.
    expect(effectsMovedAt!).toBeLessThan(contentMovedAt!);
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
        metrics: gpuBound,
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

  it("climbs one step at a time rather than snapping back", () => {
    // Each step reallocates composer targets, so a jump to the ceiling would
    // be the hitch this ladder exists to avoid.
    const partly = recover(bottomOut(), 70_000);
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
