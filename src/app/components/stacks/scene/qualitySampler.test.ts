import { describe, expect, it } from "vitest";

import { createSceneQualitySampler } from "./qualitySampler";

describe("scene quality frame sampler", () => {
  it("summarises one rolling foreground window at the sample cadence", () => {
    const sampler = createSceneQualitySampler({ now: 0, foreground: true });

    expect(
      sampler.push({
        now: 100,
        frameMs: 16,
        cpuMs: 3,
        instrumented: false,
        foreground: true,
      }),
    ).toBeNull();
    const sample = sampler.push({
      now: 300,
      frameMs: 17,
      cpuMs: 4,
      instrumented: false,
      foreground: true,
    });

    expect(sample?.metrics).toMatchObject({
      sampleCount: 2,
      p50: 16,
      p95: 17,
      fps: 1_000 / 16.5,
    });
    expect(sample?.instrumented).toBe(false);
  });

  it("clears background history and discards two lagging CPU samples after resume", () => {
    const sampler = createSceneQualitySampler({ now: 0, foreground: true });
    sampler.push({
      now: 100,
      frameMs: 40,
      cpuMs: 90,
      instrumented: false,
      foreground: true,
    });
    sampler.setForegroundActive(false, 200);
    sampler.push({
      now: 20_000,
      frameMs: 900,
      cpuMs: 90,
      instrumented: false,
      foreground: false,
    });
    sampler.setForegroundActive(true, 60_000);

    for (const [now, cpuMs] of [
      [60_010, 90],
      [60_020, 80],
      [60_030, 3],
    ] as const)
      expect(
        sampler.push({
          now,
          frameMs: 16,
          cpuMs,
          instrumented: false,
          foreground: true,
        }),
      ).toBeNull();

    const sample = sampler.push({
      now: 60_300,
      frameMs: 17,
      cpuMs: 4,
      instrumented: false,
      foreground: true,
    });
    expect(sample?.metrics).toMatchObject({
      sampleCount: 2,
      cpuP50: 3,
      cpuMs: 4,
    });
  });

  it("treats window blur like suspension even when the document stays visible", () => {
    const sampler = createSceneQualitySampler({ now: 0, foreground: true });
    sampler.push({
      now: 100,
      frameMs: 16,
      cpuMs: 3,
      instrumented: false,
      foreground: true,
    });
    sampler.setForegroundActive(false, 200);

    expect(
      sampler.push({
        now: 4_000,
        frameMs: 900,
        cpuMs: 500,
        instrumented: false,
        foreground: false,
      }),
    ).toBeNull();

    sampler.setForegroundActive(true, 5_000);
    for (const now of [5_100, 5_116])
      expect(
        sampler.push({
          now,
          frameMs: 900,
          cpuMs: 500,
          instrumented: false,
          foreground: true,
        }),
      ).toBeNull();

    sampler.push({
      now: 5_132,
      frameMs: 16,
      cpuMs: 3,
      instrumented: false,
      foreground: true,
    });
    const sample = sampler.push({
      now: 5_400,
      frameMs: 17,
      cpuMs: 4,
      instrumented: false,
      foreground: true,
    });

    expect(sample?.metrics).toMatchObject({
      sampleCount: 2,
      p95: 17,
      cpuMs: 4,
    });
  });

  it("marks a window unusable when any retained frame was instrumented", () => {
    const sampler = createSceneQualitySampler({ now: 0, foreground: true });
    sampler.push({
      now: 100,
      frameMs: 16,
      cpuMs: 3,
      instrumented: true,
      foreground: true,
    });
    const sample = sampler.push({
      now: 300,
      frameMs: 17,
      cpuMs: 4,
      instrumented: false,
      foreground: true,
    });

    expect(sample?.instrumented).toBe(true);
  });
});
