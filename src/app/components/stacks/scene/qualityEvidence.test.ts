import { describe, expect, it } from "vitest";

import { SceneQualityEvidence } from "./qualityEvidence";

const sample = (at: number) => ({
  at,
  instrumented: false,
  visible: true,
  focused: true,
  usable: true,
  moving: false,
  constraint: "gpu" as const,
  axes: {
    resolutionStep: 8,
    effects: "lean" as const,
    content: "reduced" as const,
  },
  metrics: {
    targetFrameMs: 16.667,
    targetHz: 60,
    p50: 24,
    p95: 31,
    droppedFrameRatio: 0.3,
    sampleCount: 84,
    windowMs: 1_993,
    cpuP50: 5,
    cpuMs: 7,
    gpuMs: null,
  },
  renderer: {
    programs: 93,
    textures: 128,
    geometries: 484,
  },
});

describe("production quality evidence", () => {
  it("retains bounded samples and page lifecycle events", () => {
    const evidence = new SceneQualityEvidence({
      sampleLimit: 2,
      lifecycleLimit: 2,
    });

    evidence.recordSample(sample(1));
    evidence.recordSample(sample(2));
    evidence.recordSample(sample(3));
    evidence.recordLifecycle({ at: 4, type: "window-blur", persisted: null });
    evidence.recordLifecycle({ at: 5, type: "pagehide", persisted: true });
    evidence.recordLifecycle({ at: 6, type: "pageshow", persisted: true });

    expect(evidence.snapshot()).toEqual({
      samples: [sample(2), sample(3)],
      lifecycle: [
        { at: 5, type: "pagehide", persisted: true },
        { at: 6, type: "pageshow", persisted: true },
      ],
    });
  });

  it("returns copies and resets between scene mounts", () => {
    const evidence = new SceneQualityEvidence({
      sampleLimit: 2,
      lifecycleLimit: 2,
    });
    const input = sample(1);
    evidence.recordSample(input);

    const first = evidence.snapshot();
    expect(first.samples[0]).not.toBe(input);
    expect(first.samples[0]?.metrics).not.toBe(input.metrics);
    expect(first.samples[0]?.axes).not.toBe(input.axes);
    expect(first.samples[0]?.renderer).not.toBe(input.renderer);

    evidence.reset();
    expect(evidence.snapshot()).toEqual({ samples: [], lifecycle: [] });
  });
});
