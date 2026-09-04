import { describe, expect, it } from "vitest";

import { type SceneQualityMetrics, resolveSceneQualityPlan } from "./quality";
import {
  initialSceneQualityAxisState,
  reduceSceneQualityAxes,
  resolutionStepForScale,
} from "./qualityAxes";

// The axes are only worth having if they reach the renderer. Every unit test
// in this directory stops at the reducer, and the effects axis spent its
// whole life moving in state that nothing read: the overlay printed
// `fx minimal` beside a plan still carrying the full composer, bloom,
// ambient occlusion and depth of field. This file crosses that seam.

const metrics = (over: Partial<SceneQualityMetrics>): SceneQualityMetrics => ({
  targetFrameMs: 16.667,
  targetHz: 60,
  p95: 11,
  droppedFrameRatio: 0.01,
  sampleCount: 120,
  cpuMs: 5,
  gpuMs: null,
  ...over,
});

const soak = (m: SceneQualityMetrics) => {
  let state = initialSceneQualityAxisState("balanced", 0);
  state = reduceSceneQualityAxes(state, { type: "booted", now: 0 });
  for (let now = 20_000; now <= 260_000; now += 1_000)
    state = reduceSceneQualityAxes(state, {
      type: "sample",
      now,
      metrics: m,
      visible: true,
    });
  return state;
};

const planFor = (state: ReturnType<typeof soak>) =>
  resolveSceneQualityPlan({
    mode: "auto",
    profile: "balanced",
    cssWidth: 1600,
    cssHeight: 900,
    deviceDpr: 2,
    touch: false,
    contentTier: state.axes.content,
    effectsTier: state.axes.effects,
    resolutionStep: state.axes.resolutionStep,
    survival: state.axes.survival,
  });

describe("axes reach the rendered plan", () => {
  it("turns the expensive passes off when the effects axis says minimal", () => {
    const state = soak(metrics({ p95: 30, cpuMs: 4, droppedFrameRatio: 0.4 }));
    expect(state.axes.effects).toBe("minimal");

    const plan = planFor(state);
    expect(plan.effects.ambientOcclusion).toBe(false);
    expect(plan.effects.depthOfField).toBe(false);
    expect(plan.environment.meadow).toBe(false);
  });

  it("keeps them on when the axis is at full", () => {
    const state = soak(metrics({}));
    expect(state.axes.effects).toBe("full");

    const plan = planFor(state);
    expect(plan.effects.ambientOcclusion).toBe(true);
  });

  it("never lets a tier upgrade the profile it caps", () => {
    // Balanced and Showcase both sit at `full`, with different blocks. A tier
    // that replaced rather than capped would hand Balanced Showcase's
    // ambient occlusion and eight bloom levels unasked.
    const balanced = resolveSceneQualityPlan({
      mode: "auto",
      profile: "balanced",
      cssWidth: 1600,
      cssHeight: 900,
      deviceDpr: 2,
      touch: false,
      effectsTier: "full",
    });
    const plain = resolveSceneQualityPlan({
      mode: "auto",
      profile: "balanced",
      cssWidth: 1600,
      cssHeight: 900,
      deviceDpr: 2,
      touch: false,
    });
    expect(balanced.effects).toEqual(plain.effects);
  });

  it("carries the content axis through as well", () => {
    const state = soak(metrics({ p95: 30, cpuMs: 26, droppedFrameRatio: 0.4 }));
    expect(state.axes.content).toBe("minimal");
    expect(planFor(state).environment.contentTier).toBe("minimal");
  });

  it("lets a phone earn resolution without crossing its automatic pixel budget", () => {
    const phone = {
      mode: "auto" as const,
      cssWidth: 390,
      cssHeight: 844,
      deviceDpr: 3,
      touch: true,
      narrowViewport: true,
    };
    const ceiling = resolveSceneQualityPlan({
      ...phone,
      profile: "showcase",
    }).dpr;
    const starting = resolveSceneQualityPlan({
      ...phone,
      profile: "efficient",
    }).dpr;
    let state = initialSceneQualityAxisState(
      "efficient",
      0,
      null,
      resolutionStepForScale(starting, ceiling),
    );
    state = reduceSceneQualityAxes(state, { type: "booted", now: 0 });
    for (let now = 20_000; now <= 260_000; now += 1_000)
      state = reduceSceneQualityAxes(state, {
        type: "sample",
        now,
        metrics: metrics({}),
        visible: true,
      });

    const plan = resolveSceneQualityPlan({
      ...phone,
      profile: "showcase",
      contentTier: state.axes.content,
      effectsTier: state.axes.effects,
      resolutionStep: state.axes.resolutionStep,
      survival: state.axes.survival,
    });

    expect(plan.dpr).toBe(3);
    expect(plan.physicalPixels).toBeLessThanOrEqual(plan.pixelBudget);
    expect(plan.resolutionCeilingOverridden).toBe(false);
  });
});
