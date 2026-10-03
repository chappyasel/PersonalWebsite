import { isCancelledError } from "@tanstack/react-query";

import { captureException } from "~/lib/analytics";

import {
  type ErrorReportContext,
  buildErrorReport,
  errorReportingEnabled,
  isReportableRequestFailure,
  procedureFromKey,
  trpcErrorFacts,
} from "./sanitize";

/** One outage can fail every query on a page; a handful of reports says so. */
const MAX_REPORTS_PER_PAGE = 20;
const reportedKeys = new Set<string>();

/**
 * Sends a browser error to PostHog error tracking. Repeats of one failure on
 * the same page are sent once. Never throws: reporting must not become the
 * page's second failure.
 */
export function reportClientError(
  error: unknown,
  context: ErrorReportContext,
): void {
  if (typeof window === "undefined" || !errorReportingEnabled()) return;
  try {
    const report = buildErrorReport(
      error,
      { route: window.location.pathname, ...context },
      {
        runtime: "browser",
        environment:
          process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
      },
    );
    if (
      reportedKeys.has(report.key) ||
      reportedKeys.size >= MAX_REPORTS_PER_PAGE
    ) {
      return;
    }
    reportedKeys.add(report.key);
    captureException(report.error, report.properties);
  } catch {
    // Nothing to fall back to.
  }
}

/**
 * The QueryClient's cache hook: one report per query or mutation that fails
 * after its retries, whichever component asked for it. A failed prefetch
 * counts too, since the open that follows will fail the same way.
 */
export function reportFailedRequest(
  error: unknown,
  key: readonly unknown[] | undefined,
  source: "query" | "mutation",
): void {
  if (typeof window === "undefined" || isCancelledError(error)) return;
  if (!isReportableRequestFailure(error, window.navigator.onLine)) return;
  const procedure = procedureFromKey(key) ?? "unknown";
  const { code } = trpcErrorFacts(error);
  reportClientError(error, {
    source,
    procedure,
    code,
    fingerprint: `${source}:${procedure}:${code ?? "NO_RESPONSE"}`,
    issueName: `${procedure} ${source} failed`,
  });
}
