import { describe, expect, it } from "vitest";

import {
  PERFORMANCE_DIAGNOSTIC_RUNTIME_CHECKPOINT_MS,
  PERFORMANCE_DIAGNOSTIC_RUNTIME_MS,
  PerformanceDiagnosticRuntimeWindow,
  PerformanceDiagnosticVisibleClock,
  performanceDiagnosticPageHideAction,
  performanceDiagnosticSchedule,
} from "./performanceDiagnosticRuntime";

describe("performance diagnostic runtime window", () => {
  it("pauses a partial runtime window across BFCache and resumes its deadlines", () => {
    const runtime = new PerformanceDiagnosticRuntimeWindow();
    runtime.start(9_035, true);

    runtime.setVisible(false, 11_321);
    expect(runtime.snapshot(30_000)).toMatchObject({
      paused: true,
      observedMs: 2_286,
      checkpointRemainingMs:
        PERFORMANCE_DIAGNOSTIC_RUNTIME_CHECKPOINT_MS - 2_286,
      remainingMs: PERFORMANCE_DIAGNOSTIC_RUNTIME_MS - 2_286,
    });

    runtime.setVisible(true, 30_000);
    expect(runtime.snapshot(32_714)).toMatchObject({
      paused: false,
      observedMs: PERFORMANCE_DIAGNOSTIC_RUNTIME_CHECKPOINT_MS,
      checkpointRemainingMs: 0,
    });
    runtime.markCheckpointSent();

    expect(runtime.snapshot(42_713).remainingMs).toBe(1);
    expect(runtime.snapshot(42_714).remainingMs).toBe(0);
  });

  it("does not begin counting until the world reveals", () => {
    const runtime = new PerformanceDiagnosticRuntimeWindow();
    expect(runtime.snapshot(20_000)).toMatchObject({
      started: false,
      observedMs: 0,
      remainingMs: null,
    });
  });

  it("keeps BFCache exits resumable and finalizes real page exits", () => {
    expect(performanceDiagnosticPageHideAction(true)).toBe("checkpoint");
    expect(performanceDiagnosticPageHideAction(false)).toBe("finish");
  });

  it("pauses the overall capture deadline while the document is hidden", () => {
    const deadline = new PerformanceDiagnosticVisibleClock(45_000);
    deadline.start(0, true);
    deadline.setVisible(false, 5_000);

    expect(deadline.snapshot(40_000)).toMatchObject({
      paused: true,
      observedMs: 5_000,
      remainingMs: 40_000,
    });

    deadline.setVisible(true, 40_000);
    expect(deadline.snapshot(79_999).remainingMs).toBe(1);
    expect(deadline.snapshot(80_000).remainingMs).toBe(0);
  });

  it("schedules only deadlines that can advance in the current lifecycle", () => {
    const runtime = new PerformanceDiagnosticRuntimeWindow();
    const capture = new PerformanceDiagnosticVisibleClock(45_000);
    capture.start(0, true);

    expect(
      performanceDiagnosticSchedule({
        finished: false,
        runtime: runtime.snapshot(5_000),
        capture: capture.snapshot(5_000),
        checkpointCount: 0,
      }),
    ).toEqual({
      checkpointInMs: null,
      completionInMs: null,
      deadlineInMs: 40_000,
      progressActive: false,
    });

    runtime.start(5_000, true);
    const visibleSchedule = performanceDiagnosticSchedule({
      finished: false,
      runtime: runtime.snapshot(10_000),
      capture: capture.snapshot(10_000),
      checkpointCount: 0,
    });
    expect(visibleSchedule).toMatchObject({
      checkpointInMs: 0,
      completionInMs: 10_000,
      deadlineInMs: 35_000,
      progressActive: true,
    });

    runtime.setVisible(false, 10_000);
    capture.setVisible(false, 10_000);
    expect(
      performanceDiagnosticSchedule({
        finished: false,
        runtime: runtime.snapshot(30_000),
        capture: capture.snapshot(30_000),
        checkpointCount: 0,
      }),
    ).toEqual({
      checkpointInMs: null,
      completionInMs: null,
      deadlineInMs: null,
      progressActive: false,
    });
  });
});
