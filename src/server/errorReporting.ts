import { after } from "next/server";
import type { PostHog } from "posthog-node";

import {
  type ErrorReportContext,
  buildErrorReport,
  errorReportingEnabled,
} from "~/lib/error-reporting/sanitize";

/** A report that cannot reach PostHog in this long is dropped, so a slow
 * PostHog never holds a cron run or a response open. */
const SEND_TIMEOUT_MS = 3_000;
/** One outage fails every request; a warm instance reports it once a minute. */
const REPEAT_WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 500;

const lastSentAt = new Map<string, number>();
let client: Promise<PostHog | null> | undefined;

function getClient(): Promise<PostHog | null> {
  client ??= (async () => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!key || !host) return null;
    const { PostHog } = await import("posthog-node");
    // Serverless: send each event as it comes, and skip GeoIP, which would
    // only locate the server.
    return new PostHog(key, {
      host,
      flushAt: 1,
      flushInterval: 0,
      disableGeoip: true,
    });
  })().catch(() => null);
  return client;
}

function isRepeat(key: string): boolean {
  const now = Date.now();
  const previous = lastSentAt.get(key);
  if (previous !== undefined && now - previous < REPEAT_WINDOW_MS) return true;
  if (lastSentAt.size >= MAX_TRACKED_KEYS) lastSentAt.clear();
  lastSentAt.set(key, now);
  return false;
}

/**
 * Sends a server error to PostHog error tracking and resolves once it is
 * delivered or given up on. The event has no distinct ID, so it creates no
 * person. Never throws.
 */
export async function reportServerError(
  error: unknown,
  context: ErrorReportContext,
): Promise<void> {
  if (!errorReportingEnabled()) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const report = buildErrorReport(error, context, {
      runtime: "server",
      environment:
        process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    });
    if (isRepeat(report.key)) return;
    const posthog = await getClient();
    if (!posthog) return;
    await Promise.race([
      posthog.captureExceptionImmediate(
        report.error,
        undefined,
        report.properties,
      ),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, SEND_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // The original failure is already logged; a lost report is not news.
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * For callers that cannot wait, like tRPC's synchronous `onError`. Inside a
 * request the send runs after the response; outside one (a build, a script)
 * there is nothing to attach it to and it goes out best effort.
 */
export function reportServerErrorAfterResponse(
  error: unknown,
  context: ErrorReportContext,
): void {
  const sending = reportServerError(error, context);
  try {
    after(sending);
  } catch {
    void sending;
  }
}
