import type { PerformanceDiagnosticEvent } from "../../components/stacks/performanceDiagnostic";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_DIAGNOSTIC_REQUEST_BYTES = 48_000;
const POSTHOG_CAPTURE_PATH = "/i/v0/e/";
const REPORT_KINDS = new Set([
  "diagnostic_start",
  "boot_checkpoint",
  "boot_complete",
  "runtime",
]);
const CAPTURE_REASONS = new Set([
  "diagnostic_started",
  "slow_boot_checkpoint",
  "boot_terminal",
  "post_reveal_window",
  "boot_failed",
  "capture_deadline",
  "pagehide",
]);
const BOOT_STATUSES = new Set([
  "unstarted",
  "ineligible",
  "booting",
  "revealing",
  "live",
  "failed",
  "exited",
]);
const BOOT_PATHS = new Set(["cold", "warm"]);
const BLOCKING_GATES = new Set([
  "starting",
  "assets",
  "firstFrame",
  "meadow",
  "opening",
]);
const DIAGNOSTIC_HINTS = new Set([
  "boot_start",
  "boot_assets",
  "boot_first_frame",
  "boot_meadow",
  "boot_opening",
  "boot_complete",
  "runtime_healthy",
  "runtime_cpu",
  "runtime_gpu",
  "runtime_mixed",
  "runtime_unknown",
  "insufficient_data",
]);
const CONSTRAINTS = new Set(["cpu", "gpu", "headroom", "unknown"]);
const EVENT_KEYS = new Set([
  "schema_version",
  "diagnostic_run_id",
  "diagnostic_report_id",
  "diagnostic_build_id",
  "report_kind",
  "capture_reason",
  "checkpoint_index",
  "instrumented",
  "elapsed_ms",
  "boot_status",
  "boot_path",
  "blocking_gate",
  "diagnostic_hint",
  "test_profile",
  "dominant_constraint",
  "effective_fps",
  "frame_p95_ms",
  "dropped_frame_ratio",
  "survival_active",
  "first_frame_ms",
  "meadow_ready_ms",
  "revealed_ms",
  "live_ms",
  "report_truncated_for_transport",
  "report_bytes",
  "report",
]);

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function nullableFinite(value: unknown) {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

function isSameOriginDiagnosticRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const forwardedHost = request.headers.get("x-forwarded-host");
      const host = forwardedHost ?? request.headers.get("host");
      if (!host) return origin === new URL(request.url).origin;
      return originUrl.host === host;
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}

function isPerformanceDiagnosticEvent(
  value: unknown,
): value is PerformanceDiagnosticEvent {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const event = value as Partial<PerformanceDiagnosticEvent>;
  return (
    Object.keys(value).every((key) => EVENT_KEYS.has(key)) &&
    event.schema_version === 3 &&
    typeof event.diagnostic_run_id === "string" &&
    event.diagnostic_run_id.length > 0 &&
    event.diagnostic_run_id.length <= 200 &&
    typeof event.diagnostic_report_id === "string" &&
    event.diagnostic_report_id.length > 0 &&
    event.diagnostic_report_id.length <= 320 &&
    typeof event.diagnostic_build_id === "string" &&
    event.diagnostic_build_id.length > 0 &&
    event.diagnostic_build_id.length <= 40 &&
    typeof event.report_kind === "string" &&
    REPORT_KINDS.has(event.report_kind) &&
    typeof event.capture_reason === "string" &&
    CAPTURE_REASONS.has(event.capture_reason) &&
    (event.checkpoint_index === null ||
      (typeof event.checkpoint_index === "number" &&
        Number.isInteger(event.checkpoint_index) &&
        event.checkpoint_index >= 0)) &&
    event.instrumented === true &&
    typeof event.elapsed_ms === "number" &&
    Number.isFinite(event.elapsed_ms) &&
    event.elapsed_ms >= 0 &&
    typeof event.boot_status === "string" &&
    BOOT_STATUSES.has(event.boot_status) &&
    typeof event.boot_path === "string" &&
    BOOT_PATHS.has(event.boot_path) &&
    (event.blocking_gate === null ||
      (typeof event.blocking_gate === "string" &&
        BLOCKING_GATES.has(event.blocking_gate))) &&
    typeof event.diagnostic_hint === "string" &&
    DIAGNOSTIC_HINTS.has(event.diagnostic_hint) &&
    (event.test_profile === null || typeof event.test_profile === "string") &&
    (event.dominant_constraint === null ||
      (typeof event.dominant_constraint === "string" &&
        CONSTRAINTS.has(event.dominant_constraint))) &&
    nullableFinite(event.effective_fps) &&
    nullableFinite(event.frame_p95_ms) &&
    nullableFinite(event.dropped_frame_ratio) &&
    (event.survival_active === null ||
      typeof event.survival_active === "boolean") &&
    nullableFinite(event.first_frame_ms) &&
    nullableFinite(event.meadow_ready_ms) &&
    nullableFinite(event.revealed_ms) &&
    nullableFinite(event.live_ms) &&
    typeof event.report_truncated_for_transport === "boolean" &&
    typeof event.report_bytes === "number" &&
    event.report_bytes >= 0 &&
    event.report_bytes <= 36_000 &&
    event.report !== null &&
    typeof event.report === "object" &&
    !Array.isArray(event.report) &&
    event.report_bytes === byteLength(JSON.stringify(event.report))
  );
}

function posthogCaptureUrl(host: string) {
  const url = new URL(host);
  if (url.protocol !== "https:" && url.hostname !== "localhost")
    throw new Error("PostHog host must use HTTPS");
  url.pathname = POSTHOG_CAPTURE_PATH;
  url.search = "";
  url.hash = "";
  return url.href;
}

export async function POST(request: Request) {
  if (
    request.headers.get("x-stacks-diagnostic") !== "3" ||
    !isSameOriginDiagnosticRequest(request)
  )
    return NextResponse.json({ accepted: false }, { status: 403 });

  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_DIAGNOSTIC_REQUEST_BYTES
  )
    return NextResponse.json({ accepted: false }, { status: 413 });

  let serialized: string;
  let event: unknown;
  try {
    serialized = await request.text();
    if (byteLength(serialized) > MAX_DIAGNOSTIC_REQUEST_BYTES)
      return NextResponse.json({ accepted: false }, { status: 413 });
    event = JSON.parse(serialized);
  } catch {
    return NextResponse.json({ accepted: false }, { status: 400 });
  }
  if (!isPerformanceDiagnosticEvent(event))
    return NextResponse.json({ accepted: false }, { status: 400 });

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host)
    return NextResponse.json({ accepted: false }, { status: 503 });

  try {
    const upstream = await fetch(posthogCaptureUrl(host), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event: "homepage_performance_diagnostic",
        distinct_id: event.diagnostic_run_id,
        properties: {
          ...event,
          $process_person_profile: false,
          $lib: "stacks-diagnostic-relay",
          $lib_version: "3",
        },
        timestamp: new Date().toISOString(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!upstream.ok)
      return NextResponse.json({ accepted: false }, { status: 502 });
    return NextResponse.json(
      { accepted: true, report_id: event.diagnostic_report_id },
      { status: 202, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ accepted: false }, { status: 502 });
  }
}
