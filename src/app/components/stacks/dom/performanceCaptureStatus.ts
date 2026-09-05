export type PerformanceCaptureStatus = Readonly<{
  label: string;
  state:
    | "armed"
    | "recording"
    | "paused"
    | "ready"
    | "queued"
    | "uploaded"
    | "fallback";
}>;

export function isFinalPerformanceDiagnosticDelivery(reportKind: unknown) {
  return reportKind === "runtime";
}

export function performanceCaptureStatus({
  automaticReport,
  automaticReportQueued,
  automaticReportUploaded = false,
  automaticReportFallback = false,
  runtimeProgress,
  trace,
}: {
  automaticReport: boolean;
  automaticReportQueued: boolean;
  automaticReportUploaded?: boolean;
  automaticReportFallback?: boolean;
  runtimeProgress?: Readonly<{
    started: boolean;
    paused: boolean;
    remainingMs: number | null;
  }>;
  trace: Readonly<{ active: boolean; hasReport: boolean }>;
}): PerformanceCaptureStatus | null {
  if (automaticReport) {
    if (
      trace.active &&
      runtimeProgress?.started &&
      runtimeProgress.remainingMs !== null
    ) {
      if (runtimeProgress.remainingMs <= 0)
        return {
          label: "AUTO REPORT · FINALIZING",
          state: "recording",
        };
      const seconds = Math.ceil(runtimeProgress.remainingMs / 1_000);
      return runtimeProgress.paused
        ? {
            label: `AUTO REPORT · PAUSED · ${seconds}s LEFT`,
            state: "paused",
          }
        : {
            label: `AUTO REPORT · KEEP OPEN ${seconds}s`,
            state: "recording",
          };
    }
    if (trace.active)
      return { label: "AUTO REPORT · RECORDING", state: "recording" };
    if (automaticReportUploaded)
      return { label: "AUTO REPORT · UPLOADED", state: "uploaded" };
    if (automaticReportQueued)
      return { label: "AUTO REPORT · QUEUED", state: "queued" };
    if (automaticReportFallback)
      return { label: "AUTO REPORT · SDK FALLBACK", state: "fallback" };
    if (trace.hasReport)
      return { label: "AUTO REPORT · CAPTURED", state: "ready" };
    return { label: "AUTO REPORT · ARMED", state: "armed" };
  }
  if (trace.active) return { label: "TRACE · RECORDING", state: "recording" };
  if (trace.hasReport) return { label: "TRACE · READY", state: "ready" };
  return null;
}
