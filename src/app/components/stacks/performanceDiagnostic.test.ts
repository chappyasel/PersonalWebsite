import { afterEach, describe, expect, it, vi } from "vitest";

import { initialWorldBootState } from "./boot/worldBootMachine";
import {
  PERFORMANCE_DIAGNOSTIC_REPORT_MAX_BYTES,
  PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION,
  WorldBootDiagnosticRecorder,
  browserPerformanceDiagnosticContext,
  compactScenePerformanceDiagnostic,
  createPerformanceDiagnosticEvent,
  localPerformanceDiagnostic,
  performanceDiagnosticRequested,
  submitPerformanceDiagnostic,
} from "./performanceDiagnostic";
import type { PerformanceTraceReport } from "./scene/performanceTrace";

describe("browser diagnostic context", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("names the test profile and query keys without query values", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?perf-report=1&perf-profile=constrained&utm=secret",
      },
      innerWidth: 1440,
      innerHeight: 900,
      devicePixelRatio: 2,
    });
    vi.stubGlobal("navigator", {
      userAgent: "test",
      platform: "test",
      hardwareConcurrency: 8,
    });
    vi.stubGlobal("document", { visibilityState: "visible" });
    vi.stubGlobal("performance", { getEntriesByType: () => [] });

    const context = browserPerformanceDiagnosticContext();
    expect(context).toMatchObject({
      test_profile: "constrained",
      query_keys: ["perf-report", "perf-profile", "utm"],
    });
    expect(JSON.stringify(context)).not.toContain("secret");
  });

  it("reports no profile on an ordinary visit", () => {
    vi.stubGlobal("window", {
      location: { search: "" },
      innerWidth: 1,
      innerHeight: 1,
      devicePixelRatio: 1,
    });
    vi.stubGlobal("navigator", { userAgent: "t", platform: "t" });
    vi.stubGlobal("document", { visibilityState: "visible" });
    vi.stubGlobal("performance", { getEntriesByType: () => [] });

    expect(browserPerformanceDiagnosticContext()).toMatchObject({
      test_profile: null,
      query_keys: [],
    });
  });
});

describe("performance diagnostic URL mode", () => {
  it("requires the explicit perf-report opt-in", () => {
    expect(performanceDiagnosticRequested("?perf-report=1")).toBe(true);
    expect(performanceDiagnosticRequested("?perf-report=true")).toBe(false);
    expect(performanceDiagnosticRequested("?perf-report=0")).toBe(false);
    expect(performanceDiagnosticRequested("?debug=1")).toBe(false);
  });
});

describe("world boot diagnostic recorder", () => {
  it("records the real gate transitions and their time from boot start", () => {
    const recorder = new WorldBootDiagnosticRecorder();
    const booting = {
      ...initialWorldBootState(),
      epoch: 3,
      status: "booting" as const,
      startedAt: 100,
    };

    recorder.observe(booting, 110);
    recorder.observe({ ...booting, assetsSeen: true }, 250);
    recorder.observe(
      { ...booting, assetsSeen: true, assetsCompleteSince: 400 },
      410,
    );
    recorder.observe(
      {
        ...booting,
        assetsSeen: true,
        assetsCompleteSince: 400,
        firstFrame: true,
      },
      725,
    );
    recorder.observe(
      {
        ...booting,
        assetsSeen: true,
        assetsCompleteSince: 400,
        firstFrame: true,
        meadowReady: true,
        worldReadyAt: 900,
        waitStage: "opening",
      },
      905,
    );

    const report = recorder.snapshot(1_000);

    expect(report.elapsed_ms).toBe(900);
    expect(report.blocking_gate).toBe("opening");
    expect(report.milestone_ms).toMatchObject({
      assets_seen: 150,
      assets_complete: 300,
      first_frame: 625,
      meadow_ready: 805,
      world_ready: 800,
    });
    expect(report.timeline.map(({ event }) => event)).toEqual([
      "boot_started",
      "assets_seen",
      "assets_complete",
      "first_frame",
      "meadow_ready",
      "world_ready",
      "display_stage:opening",
    ]);
  });

  it("keeps an asset gate reopening in the bounded timeline", () => {
    const recorder = new WorldBootDiagnosticRecorder();
    const state = {
      ...initialWorldBootState(),
      epoch: 1,
      status: "booting" as const,
      startedAt: 0,
      assetsSeen: true,
      assetsCompleteSince: 100,
    };

    recorder.observe(state, 100);
    recorder.observe({ ...state, assetsCompleteSince: null }, 200);
    recorder.observe({ ...state, assetsCompleteSince: 230 }, 240);

    expect(
      recorder
        .snapshot(250)
        .timeline.slice(-2)
        .map(({ event, at_ms }) => ({ event, at_ms })),
    ).toEqual([
      { event: "assets_reopened", at_ms: 200 },
      { event: "assets_complete", at_ms: 230 },
    ]);
  });
});

describe("scene performance diagnostic compaction", () => {
  it("keeps useful aggregates without uploading resource URLs or raw frames", () => {
    const trace = {
      version: 3,
      startedAt: 100,
      stoppedAt: 1_100,
      truncated: false,
      session: {
        queryFlags: ["perf-report", "perf-profile"],
        testProfile: "floor",
        secret: "not forwarded",
      },
      summary: {
        targetFrameMs: 16.667,
        all: {
          count: 2,
          fps: 40,
          droppedFrameRatio: 0.5,
          frameMs: { p50: 16, p95: 34, p99: 34, max: 34 },
        },
        settled: {
          count: 1,
          fps: 60,
          droppedFrameRatio: 0,
          frameMs: { p50: 16, p95: 16, p99: 16, max: 16 },
        },
        travel: {
          count: 1,
          fps: 29.4,
          droppedFrameRatio: 1,
          frameMs: { p50: 34, p95: 34, p99: 34, max: 34 },
        },
        travelToSettledP95Ratio: 2.13,
      },
      spikes: [],
      frames: [
        {
          at: 200,
          frameMs: 16,
          moving: false,
          progress: 0,
          activeUnit: 0,
          renderer: {
            calls: 100,
            triangles: 200_000,
            points: 0,
            lines: 0,
            textures: 20,
            geometries: 30,
            programs: 10,
          },
          physicsMs: 1,
          cameraYawDeg: 0,
          cameraLookLagX: 0,
          visibleUnits: [0],
        },
        {
          at: 1_000,
          frameMs: 34,
          moving: true,
          progress: 0.2,
          activeUnit: 1,
          renderer: {
            calls: 120,
            triangles: 240_000,
            points: 0,
            lines: 0,
            textures: 22,
            geometries: 31,
            programs: 10,
          },
          physicsMs: 2,
          cameraYawDeg: 10,
          cameraLookLagX: 0.1,
          visibleUnits: [0, 1],
        },
      ],
      events: [{ at: 500, type: "quality-transition" }],
      longTasks: [{ at: 600, durationMs: 80 }],
      longAnimationFrames: [],
      reactCommits: [],
      resources: [
        {
          at: 300,
          durationMs: 120,
          name: "https://example.com/model.glb?secret=do-not-upload",
          initiatorType: "fetch",
          transferSize: 42_000,
        },
      ],
    } as PerformanceTraceReport;

    const report = compactScenePerformanceDiagnostic({ trace, quality: null });
    const serialized = JSON.stringify(report);

    expect(report.trace.frame_count).toBe(2);
    expect(report.trace.renderer).toEqual({
      first: trace.frames[0]!.renderer,
      last: trace.frames[1]!.renderer,
    });
    expect(report.trace.resources).toMatchObject({
      count: 1,
      transfer_bytes: 42_000,
      by_initiator: { fetch: 1 },
      slowest: [
        {
          duration_ms: 120,
          initiator_type: "fetch",
          transfer_bytes: 42_000,
        },
      ],
    });
    expect(report.trace.event_counts).toEqual({ "quality-transition": 1 });
    expect(report.trace.session).toEqual({
      queryFlags: ["perf-report", "perf-profile"],
      testProfile: "floor",
    });
    expect(serialized).not.toContain("example.com");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain('"frames"');

    const event = createPerformanceDiagnosticEvent({
      diagnosticRunId: "run.1",
      reportKind: "runtime",
      captureReason: "post_reveal_window",
      elapsedMs: 16_000,
      bootStatus: "live",
      bootPath: "cold",
      blockingGate: null,
      postRevealObservedMs: 15_000,
      report,
    });
    expect(event).toMatchObject({
      diagnostic_hint: "runtime_healthy",
      effective_fps: 60,
      frame_p95_ms: 16,
      dropped_frame_ratio: 0,
      post_reveal_observed_ms: 15_000,
      pagehide_persisted: null,
      report_truncated_for_transport: false,
    });
  });

  it("keeps runtime checkpoints queryable without treating them as boot reports", () => {
    const event = createPerformanceDiagnosticEvent({
      diagnosticRunId: "run.checkpoint",
      reportKind: "runtime_checkpoint",
      captureReason: "post_reveal_checkpoint",
      checkpointIndex: 1,
      elapsedMs: 12_000,
      bootStatus: "live",
      bootPath: "warm",
      blockingGate: null,
      postRevealObservedMs: 5_000,
      report: {
        trace: {
          summary: {
            targetFrameMs: 16.667,
            settled: {
              count: 20,
              fps: 30,
              droppedFrameRatio: 0.4,
              frameMs: { p95: 42 },
            },
          },
        },
      },
    });

    expect(event).toMatchObject({
      report_kind: "runtime_checkpoint",
      capture_reason: "post_reveal_checkpoint",
      checkpoint_index: 1,
      diagnostic_hint: "runtime_unknown",
      effective_fps: 30,
      post_reveal_observed_ms: 5_000,
    });
  });

  it("publishes queryable attribution and survival facts", () => {
    const event = createPerformanceDiagnosticEvent({
      diagnosticRunId: "run.2",
      reportKind: "runtime",
      captureReason: "capture_deadline",
      elapsedMs: 45_000,
      bootStatus: "live",
      bootPath: "cold",
      blockingGate: null,
      report: {
        trace: {
          summary: {
            targetFrameMs: 16.667,
            settled: {
              count: 8,
              fps: 20,
              droppedFrameRatio: 0.75,
              frameMs: { p95: 52 },
            },
          },
          session: { testProfile: "unknown-device" },
        },
        quality: {
          resolved: { axes: { survival: true } },
          evidence: {
            samples: Array.from({ length: 8 }, () => ({
              usable: true,
              visible: true,
              constraint: "cpu",
            })),
          },
        },
      },
    });

    expect(event).toMatchObject({
      diagnostic_hint: "runtime_cpu",
      dominant_constraint: "cpu",
      test_profile: "unknown-device",
      effective_fps: 20,
      frame_p95_ms: 52,
      dropped_frame_ratio: 0.75,
      survival_active: true,
    });
  });

  it("bounds the report so diagnostic page exits stay beacon-sized", () => {
    const event = createPerformanceDiagnosticEvent({
      diagnosticRunId: "run.3",
      reportKind: "runtime",
      captureReason: "pagehide",
      elapsedMs: 12_000,
      bootStatus: "booting",
      bootPath: "cold",
      blockingGate: "meadow",
      postRevealObservedMs: 2_286,
      pagehidePersisted: false,
      report: {
        unprunable_padding: "z".repeat(50_000),
        trace: {
          summary: {},
          spikes: Array.from({ length: 100 }, (_, index) => ({
            index,
            detail: "x".repeat(1_000),
          })),
        },
        quality: {
          resolved: { axes: { survival: false } },
          evidence: {
            samples: Array.from({ length: 100 }, (_, index) => ({
              index,
              detail: "y".repeat(1_000),
            })),
            lifecycle: [],
          },
        },
        runtime_capture: {
          post_reveal_observed_ms: 2_286,
          pagehide_persisted: false,
          lifecycle: [{ at_ms: 11_321, type: "pagehide", persisted: false }],
        },
      },
    });

    expect(event.report_truncated_for_transport).toBe(true);
    expect(event).toMatchObject({
      post_reveal_observed_ms: 2_286,
      pagehide_persisted: false,
    });
    expect(event.report_bytes).toBeLessThanOrEqual(
      PERFORMANCE_DIAGNOSTIC_REPORT_MAX_BYTES,
    );
    expect(event.report).toMatchObject({
      transport: { summary_only: true },
      runtime_capture: {
        post_reveal_observed_ms: 2_286,
        pagehide_persisted: false,
      },
    });
  });
});

describe("local performance diagnostic bundle", () => {
  it("keeps the exact compact upload payload available for download", () => {
    localPerformanceDiagnostic.clear();
    const event = createPerformanceDiagnosticEvent({
      diagnosticRunId: "diagnostic.4",
      reportKind: "boot_checkpoint",
      captureReason: "slow_boot_checkpoint",
      checkpointIndex: 1,
      elapsedMs: 10_000,
      bootStatus: "booting",
      bootPath: "cold",
      blockingGate: "firstFrame",
      report: { boot: { blocking_gate: "firstFrame" } },
    });

    localPerformanceDiagnostic.record(event);

    expect(localPerformanceDiagnostic.getSnapshot()).toEqual({
      schema: "stacks-performance-diagnostic-bundle",
      version: PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION,
      events: [event],
    });
    localPerformanceDiagnostic.clear();
  });

  it("persists the redacted fallback bundle when local storage is available", () => {
    const setItem = vi.fn();
    const removeItem = vi.fn();
    vi.stubGlobal("window", {
      localStorage: { getItem: vi.fn(() => null), setItem, removeItem },
    });
    localPerformanceDiagnostic.clear();
    const event = createPerformanceDiagnosticEvent({
      diagnosticRunId: "diagnostic.5",
      reportKind: "diagnostic_start",
      captureReason: "diagnostic_started",
      checkpointIndex: 0,
      elapsedMs: 0,
      bootStatus: "booting",
      bootPath: "cold",
      blockingGate: "starting",
      report: { boot: { blocking_gate: "starting" } },
    });

    localPerformanceDiagnostic.record(event);

    expect(setItem).toHaveBeenCalledOnce();
    const stored = String(setItem.mock.calls[0]?.[1]);
    expect(stored).toContain('"diagnostic_run_id":"diagnostic.5"');
    expect(stored).not.toContain("location");
    localPerformanceDiagnostic.clear();
    vi.unstubAllGlobals();
  });
});

describe("performance diagnostic delivery", () => {
  afterEach(() => {
    localPerformanceDiagnostic.clear();
    vi.unstubAllGlobals();
  });

  const event = () =>
    createPerformanceDiagnosticEvent({
      diagnosticRunId: "delivery.1",
      reportKind: "diagnostic_start",
      captureReason: "diagnostic_started",
      checkpointIndex: 0,
      elapsedMs: 0,
      bootStatus: "booting",
      bootPath: "cold",
      blockingGate: "starting",
      report: { boot: { blocking_gate: "starting" } },
    });

  it("uses the acknowledged same-origin relay first", async () => {
    const send = vi.fn(async () => Response.json({}, { status: 202 }));
    vi.stubGlobal("fetch", send);

    await expect(submitPerformanceDiagnostic(event())).resolves.toMatchObject({
      status: "uploaded",
      reportKind: "diagnostic_start",
    });
    expect(send).toHaveBeenCalledWith(
      "/api/performance-diagnostic",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
    expect(localPerformanceDiagnostic.getSnapshot().events).toHaveLength(1);
  });

  it("falls back to the existing SDK queue when the relay rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}, { status: 502 })),
    );

    await expect(submitPerformanceDiagnostic(event())).resolves.toMatchObject({
      status: "sdk_fallback",
      reportKind: "diagnostic_start",
    });
    expect(localPerformanceDiagnostic.getSnapshot().events).toHaveLength(1);
  });
});
