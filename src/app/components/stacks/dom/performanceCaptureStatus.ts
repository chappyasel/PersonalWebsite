export type PerformanceCaptureStatus = Readonly<{
  label: string;
  state: "armed" | "recording" | "ready" | "queued" | "uploaded" | "fallback";
}>;

export function performanceCaptureStatus({
  automaticReport,
  automaticReportQueued,
  automaticReportUploaded = false,
  automaticReportFallback = false,
  trace,
}: {
  automaticReport: boolean;
  automaticReportQueued: boolean;
  automaticReportUploaded?: boolean;
  automaticReportFallback?: boolean;
  trace: Readonly<{ active: boolean; hasReport: boolean }>;
}): PerformanceCaptureStatus | null {
  if (automaticReport) {
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
