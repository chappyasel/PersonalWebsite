import { describe, expect, it } from "vitest";

import { QUALITY_PERSIST_STABLE_MS } from "./quality";
import {
  type SceneQualityAxisState,
  initialSceneQualityAxisState,
  reduceSceneQualityAxes,
} from "./qualityAxes";
import { sceneQualityPersistenceStatus } from "./qualityPersistence";

const readyState = (): SceneQualityAxisState => ({
  ...reduceSceneQualityAxes(initialSceneQualityAxisState("balanced", 0), {
    type: "booted",
    now: 0,
  }),
  foregroundReadyAt: 2_500,
  validation: {
    at: 6_000,
    reason: "acceptable-pacing",
    metrics: {
      targetFrameMs: 16.7,
      targetHz: 60,
      p95: 16.7,
      droppedFrameRatio: 0.01,
      sampleCount: 120,
      cpuMs: 5,
      gpuMs: null,
    },
  },
});

const gates = {
  automatic: true,
  documentVisible: true,
  samplesUsable: true,
  composerHealthy: true,
  sceneTravelling: false,
} as const;

describe("scene quality persistence eligibility", () => {
  it("reaches its deadline from a reducer-produced headroom validation", () => {
    const initial = {
      ...reduceSceneQualityAxes(initialSceneQualityAxisState("showcase", 0), {
        type: "booted",
        now: 0,
      }),
      bootDeclineGuard: false,
      foregroundReadyAt: 0,
    };
    const validated = reduceSceneQualityAxes(initial, {
      type: "sample",
      now: 3_000,
      metrics: {
        targetFrameMs: 16.7,
        targetHz: 60,
        p50: 16.7,
        p95: 18,
        droppedFrameRatio: 0.01,
        sampleCount: 120,
        cpuP50: 5,
        cpuMs: 6,
        gpuMs: null,
      },
      visible: true,
    });
    const repeated = reduceSceneQualityAxes(validated, {
      type: "sample",
      now: 6_000,
      metrics: validated.validation!.metrics,
      visible: true,
    });

    expect(repeated.validation?.at).toBe(3_000);
    expect(
      sceneQualityPersistenceStatus(
        repeated,
        gates,
        3_000 + QUALITY_PERSIST_STABLE_MS,
      ),
    ).toEqual({
      eligible: true,
      readyAt: 3_000 + QUALITY_PERSIST_STABLE_MS,
      reason: "ready",
    });
  });

  it("uses one deadline covering foreground, travel, and axis stability", () => {
    const state = {
      ...readyState(),
      settledAt: 6_000,
      axisChangedAt: { resolution: 4_000, effects: 3_000, content: 5_000 },
    };
    const readyAt = 6_000 + QUALITY_PERSIST_STABLE_MS;

    expect(sceneQualityPersistenceStatus(state, gates, readyAt - 1)).toEqual({
      eligible: false,
      readyAt,
      reason: "stabilizing",
    });
    expect(sceneQualityPersistenceStatus(state, gates, readyAt)).toEqual({
      eligible: true,
      readyAt,
      reason: "ready",
    });
  });

  it("blocks while suspended, instrumented, or carrying travel debt", () => {
    const state = { ...readyState(), preTravelStep: 11 };
    expect(
      sceneQualityPersistenceStatus(
        { ...state, foregroundReadyAt: null },
        gates,
        100_000,
      ).reason,
    ).toBe("foreground-validation");
    expect(
      sceneQualityPersistenceStatus(
        state,
        { ...gates, samplesUsable: false },
        100_000,
      ).reason,
    ).toBe("samples-unusable");
    expect(sceneQualityPersistenceStatus(state, gates, 100_000).reason).toBe(
      "travel-debt",
    );
  });

  it("blocks an unfinished decline comparison", () => {
    const state = {
      ...readyState(),
      pendingBaseline: {
        targetFrameMs: 16.7,
        targetHz: 60,
        p95: 24,
        droppedFrameRatio: 0.2,
        sampleCount: 120,
        cpuMs: 4,
        gpuMs: null,
      },
    };
    expect(sceneQualityPersistenceStatus(state, gates, 100_000).reason).toBe(
      "transition-pending",
    );
  });

  it("refuses an axis triple that fresh evidence has not validated", () => {
    const state = { ...readyState(), validation: null };
    expect(sceneQualityPersistenceStatus(state, gates, 100_000).reason).toBe(
      "unvalidated",
    );
  });
});
