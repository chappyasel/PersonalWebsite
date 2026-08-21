import { describe, expect, it } from "vitest";

import {
  SCENE_QUALITY_LOG_SCHEMA_VERSION,
  createSceneQualityLog,
  sceneQualityLogFilename,
} from "./qualityLog";

describe("scene quality device logs", () => {
  it("builds a versioned, attributable payload without query values", () => {
    const log = createSceneQualityLog({
      generatedAt: "2026-08-20T18:30:45.000Z",
      elapsedMs: 42_000,
      visibility: "visible",
      queryFlags: ["hud", "secret"],
      viewport: { width: 393, height: 852, deviceDpr: 3 },
      device: {
        userAgent: "Mobile Safari",
        platform: "iPhone",
        hardwareConcurrency: 6,
        deviceMemoryGb: null,
      },
      renderer: {
        maxTextureSize: 16_384,
        maxSamples: 4,
        unmaskedRenderer: "Apple GPU",
      },
      evidence: {
        samples: [],
        lifecycle: [{ at: 41_000, type: "window-blur", persisted: null }],
      },
      quality: { axes: { resolutionStep: 0 } },
    });

    expect(log).toEqual({
      schema: "stacks-quality-log",
      version: SCENE_QUALITY_LOG_SCHEMA_VERSION,
      generatedAt: "2026-08-20T18:30:45.000Z",
      elapsedMs: 42_000,
      visibility: "visible",
      queryFlags: ["hud", "secret"],
      viewport: { width: 393, height: 852, deviceDpr: 3 },
      device: {
        userAgent: "Mobile Safari",
        platform: "iPhone",
        hardwareConcurrency: 6,
        deviceMemoryGb: null,
      },
      renderer: {
        maxTextureSize: 16_384,
        maxSamples: 4,
        unmaskedRenderer: "Apple GPU",
      },
      evidence: {
        samples: [],
        lifecycle: [{ at: 41_000, type: "window-blur", persisted: null }],
      },
      quality: { axes: { resolutionStep: 0 } },
    });
    expect(JSON.stringify(log)).not.toContain("secret=");
  });

  it("creates a filesystem-safe UTC filename", () => {
    expect(sceneQualityLogFilename("2026-08-20T18:30:45.000Z")).toBe(
      "stacks-quality-2026-08-20T18-30-45-000Z.json",
    );
  });
});
