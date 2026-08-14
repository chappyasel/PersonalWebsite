import { describe, expect, it } from "vitest";

import { ScenePerformanceSampler } from "./performanceMetrics";

describe("ScenePerformanceSampler", () => {
  it("reports stable 60 Hz frame percentiles", () => {
    const sampler = new ScenePerformanceSampler();
    sampler.start(0);
    for (let i = 0; i < 120; i++) sampler.frame(1 / 60);
    sampler.stop(2_000);
    const summary = sampler.summary(2_000);
    expect(summary.count).toBe(120);
    expect(summary.fps).toBe(60);
    expect(summary.refreshHz).toBe(60);
    expect(summary.frameMs?.p95).toBeCloseTo(16.667, 2);
    expect(summary.droppedFrameRatio).toBe(0);
  });

  it("counts long frames and quality transitions", () => {
    const sampler = new ScenePerformanceSampler();
    sampler.start(100);
    for (let i = 0; i < 90; i++) sampler.frame(1 / 60);
    for (let i = 0; i < 10; i++) sampler.frame(1 / 20);
    sampler.transition({ at: 500, from: 0, to: 1, reason: "decline" });
    sampler.stop(2_100);
    const summary = sampler.summary(2_100);
    expect(summary.droppedFrameRatio).toBe(0.1);
    expect(summary.transitions).toEqual([
      { at: 500, from: 0, to: 1, reason: "decline" },
    ]);
  });

  it("resets without retaining previous samples", () => {
    const sampler = new ScenePerformanceSampler();
    sampler.start(0);
    sampler.frame(1 / 60);
    sampler.reset();
    expect(sampler.summary(10)).toMatchObject({ count: 0, active: false });
  });
});
