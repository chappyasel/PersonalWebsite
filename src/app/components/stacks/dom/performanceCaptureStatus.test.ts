import { describe, expect, it } from "vitest";

import { performanceCaptureStatus } from "./performanceCaptureStatus";

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
});
