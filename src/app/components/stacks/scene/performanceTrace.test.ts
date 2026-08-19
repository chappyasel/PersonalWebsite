import { describe, expect, it } from "vitest";

import { ScenePerformanceTrace } from "./performanceTrace";

describe("ScenePerformanceTrace", () => {
  it("makes smooth-settled / slow-travel behavior and overlapping signals explicit", () => {
    const trace = new ScenePerformanceTrace();
    trace.start({
      now: 0,
      session: { viewport: [1728, 1117], deviceDpr: 2, userAgent: "fixture" },
    });

    let at = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      at += 16.667;
      trace.frame({
        at,
        frameMs: 16.667,
        moving: false,
        progress: 0,
        activeUnit: 0,
        renderer: {
          calls: 80,
          triangles: 900_000,
          points: 380,
          lines: 0,
          textures: 36,
          geometries: 120,
          programs: 18,
        },
        physicsMs: 0.4,
        cameraYawDeg: 0,
        cameraLookLagX: 0,
        visibleUnits: [0],
      });
    }

    trace.event({ at, type: "travel-start", detail: { from: 0 } });
    for (let frame = 0; frame < 30; frame += 1) {
      at += 50;
      trace.frame({
        at,
        frameMs: 50,
        moving: true,
        progress: frame / 30,
        activeUnit: frame < 15 ? 0 : 1,
        renderer: {
          calls: 120,
          triangles: 1_250_000,
          points: 380,
          lines: 0,
          textures: frame < 4 ? 36 : 44,
          geometries: 140,
          programs: frame < 2 ? 18 : 24,
        },
        physicsMs: frame === 2 ? 18 : 0.8,
        cameraYawDeg: 12,
        cameraLookLagX: 1.4,
        visibleUnits: frame < 15 ? [0, 1] : [1, 2],
      });
    }
    trace.longTask({ at: at - 90, durationMs: 72 });
    trace.longAnimationFrame({
      at: at - 110,
      durationMs: 88,
      blockingDurationMs: 42,
      renderStart: at - 48,
      styleAndLayoutStart: at - 35,
      scripts: [
        {
          name: "Window.requestAnimationFrame",
          source: "/_next/static/chunks/app.js",
          durationMs: 31,
          forcedStyleAndLayoutMs: 8,
        },
      ],
    });
    trace.reactCommit({
      at: at - 60,
      id: "scene",
      phase: "update",
      durationMs: 24,
    });
    trace.event({ at, type: "travel-end", detail: { to: 1 } });
    trace.stop({ now: at });

    const report = trace.report();
    expect(report.summary.settled.frameMs.p95).toBeCloseTo(16.667, 2);
    expect(report.summary.travel.frameMs.p95).toBe(50);
    expect(report.summary.travel.droppedFrameRatio).toBe(1);
    expect(report.summary.travel.frameMs.p95).toBeGreaterThan(
      report.summary.settled.frameMs.p95 * 2,
    );
    expect(report.version).toBe(2);
    expect(report.frames.at(-1)).toMatchObject({
      cameraYawDeg: 12,
      cameraLookLagX: 1.4,
      visibleUnits: [1, 2],
    });
    expect(report.spikes.flatMap((spike) => spike.signals)).toEqual(
      expect.arrayContaining([
        "long-task",
        "long-animation-frame",
        "react-commit",
        "program-count-change",
        "texture-count-change",
        "physics-cost",
      ]),
    );
  });

  it("stays bounded during long manual captures", () => {
    const trace = new ScenePerformanceTrace({ maxFrames: 5 });
    trace.start({ now: 0, session: {} });
    for (let frame = 0; frame < 10; frame += 1)
      trace.frame({
        at: frame * 16,
        frameMs: 16,
        moving: false,
        progress: 0,
        activeUnit: 0,
        renderer: null,
        physicsMs: null,
        cameraYawDeg: null,
        cameraLookLagX: null,
        visibleUnits: [],
      });
    expect(trace.report().frames).toHaveLength(5);
  });

  it("attributes a one-frame compile spike against its preceding baseline", () => {
    const trace = new ScenePerformanceTrace();
    trace.start({ now: 0, session: {} });
    for (let frame = 1; frame <= 8; frame += 1)
      trace.frame({
        at: frame * 16,
        frameMs: 16,
        moving: false,
        progress: 0,
        activeUnit: 0,
        renderer: {
          calls: 80,
          triangles: 900_000,
          points: 0,
          lines: 0,
          textures: 30,
          geometries: 100,
          programs: 12,
        },
        physicsMs: 0.2,
        cameraYawDeg: 0,
        cameraLookLagX: 0,
        visibleUnits: [0],
      });
    trace.frame({
      at: 178,
      frameMs: 50,
      moving: true,
      progress: 0.1,
      activeUnit: 1,
      renderer: {
        calls: 110,
        triangles: 1_100_000,
        points: 0,
        lines: 0,
        textures: 34,
        geometries: 114,
        programs: 17,
      },
      physicsMs: 0.3,
      cameraYawDeg: 18,
      cameraLookLagX: 2,
      visibleUnits: [0, 1, 2],
    });

    expect(trace.report().spikes[0]?.signals).toEqual(
      expect.arrayContaining(["program-count-change", "render-load-change"]),
    );
  });

  it("does not label periodic composer texture bookkeeping as a persistent upload", () => {
    const trace = new ScenePerformanceTrace();
    trace.start({ now: 0, session: {} });
    for (let frame = 1; frame <= 16; frame += 1)
      trace.frame({
        at: frame * 16,
        frameMs: frame === 12 ? 50 : 16,
        moving: false,
        progress: 0,
        activeUnit: 0,
        renderer: {
          calls: 300,
          triangles: 500_000,
          points: 0,
          lines: 0,
          textures: frame % 6 === 0 ? 165 : 171,
          geometries: 100,
          programs: 20,
        },
        physicsMs: 0.2,
        cameraYawDeg: 0,
        cameraLookLagX: 0,
        visibleUnits: [0],
      });

    expect(trace.report().spikes[0]?.signals).not.toContain(
      "texture-count-change",
    );
  });
});
