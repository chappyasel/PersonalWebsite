import { describe, expect, it } from "vitest";

import {
  isFinalPerformanceDiagnosticDelivery,
  performanceCaptureStatus,
} from "./performanceCaptureStatus";

describe("performance capture HUD status", () => {
  it("shows the automatic report lifecycle", () => {
    expect(
      performanceCaptureStatus({
        automaticReport: true,
        automaticReportQueued: false,
        trace: { active: false, hasReport: false },
      }),
    ).toEqual({ label: "AUTO REPORT · ARMED", state: "armed" });
    expect(
      performanceCaptureStatus({
        automaticReport: true,
        automaticReportQueued: false,
        trace: { active: true, hasReport: false },
      }),
    ).toEqual({ label: "AUTO REPORT · RECORDING", state: "recording" });
    expect(
      performanceCaptureStatus({
        automaticReport: true,
        automaticReportQueued: false,
        trace: { active: false, hasReport: true },
      }),
    ).toEqual({ label: "AUTO REPORT · CAPTURED", state: "ready" });
    expect(
      performanceCaptureStatus({
        automaticReport: true,
        automaticReportQueued: true,
        trace: { active: true, hasReport: false },
      }),
    ).toEqual({ label: "AUTO REPORT · RECORDING", state: "recording" });
    expect(
      performanceCaptureStatus({
        automaticReport: true,
        automaticReportQueued: true,
        runtimeProgress: {
          started: true,
          paused: false,
          remainingMs: 9_001,
        },
        trace: { active: true, hasReport: false },
      }),
    ).toEqual({
      label: "AUTO REPORT · KEEP OPEN 10s",
      state: "recording",
    });
    expect(
      performanceCaptureStatus({
        automaticReport: true,
        automaticReportQueued: true,
        runtimeProgress: {
          started: true,
          paused: true,
          remainingMs: 8_000,
        },
        trace: { active: true, hasReport: false },
      }),
    ).toEqual({
      label: "AUTO REPORT · PAUSED · 8s LEFT",
      state: "paused",
    });
    expect(
      performanceCaptureStatus({
        automaticReport: true,
        automaticReportQueued: false,
        runtimeProgress: {
          started: true,
          paused: false,
          remainingMs: 0,
        },
        trace: { active: true, hasReport: false },
      }),
    ).toEqual({
      label: "AUTO REPORT · FINALIZING",
      state: "recording",
    });
    expect(
      performanceCaptureStatus({
        automaticReport: true,
        automaticReportQueued: true,
        automaticReportUploaded: true,
        trace: { active: false, hasReport: true },
      }),
    ).toEqual({ label: "AUTO REPORT · UPLOADED", state: "uploaded" });
    expect(
      performanceCaptureStatus({
        automaticReport: true,
        automaticReportQueued: false,
        automaticReportFallback: true,
        trace: { active: false, hasReport: true },
      }),
    ).toEqual({
      label: "AUTO REPORT · SDK FALLBACK",
      state: "fallback",
    });
  });

  it("also reports manually started trace state", () => {
    expect(
      performanceCaptureStatus({
        automaticReport: false,
        automaticReportQueued: false,
        trace: { active: true, hasReport: false },
      }),
    ).toEqual({ label: "TRACE · RECORDING", state: "recording" });
    expect(
      performanceCaptureStatus({
        automaticReport: false,
        automaticReportQueued: false,
        trace: { active: false, hasReport: true },
      }),
    ).toEqual({ label: "TRACE · READY", state: "ready" });
    expect(
      performanceCaptureStatus({
        automaticReport: false,
        automaticReportQueued: false,
        trace: { active: false, hasReport: false },
      }),
    ).toBeNull();
  });

  it("only treats the terminal runtime delivery as the final upload", () => {
    expect(isFinalPerformanceDiagnosticDelivery("diagnostic_start")).toBe(
      false,
    );
    expect(isFinalPerformanceDiagnosticDelivery("boot_complete")).toBe(false);
    expect(isFinalPerformanceDiagnosticDelivery("runtime_checkpoint")).toBe(
      false,
    );
    expect(isFinalPerformanceDiagnosticDelivery("runtime")).toBe(true);
  });
});
