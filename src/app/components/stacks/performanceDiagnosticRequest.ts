export const PERFORMANCE_DIAGNOSTIC_PARAM = "perf-report";

export function performanceDiagnosticRequested(
  search: string | URLSearchParams,
): boolean {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  return params.get(PERFORMANCE_DIAGNOSTIC_PARAM) === "1";
}
