import {
  type AnalyticsEventProperties,
  capture,
  startAnalyticsDelivery,
} from "~/lib/analytics";

import type {
  WorldBootState,
  WorldBootWaitStage,
} from "./boot/worldBootMachine";
import { performanceProfileFromSearch } from "./scene/performanceProfiles";
import type {
  PerformanceTraceFrame,
  PerformanceTraceReport,
} from "./scene/performanceTrace";
import type { SceneQualityLog } from "./scene/qualityLog";

export {
  PERFORMANCE_DIAGNOSTIC_PARAM,
  performanceDiagnosticRequested,
} from "./performanceDiagnosticRequest";
export const PERFORMANCE_DIAGNOSTIC_CHECKPOINTS_MS = [10_000, 30_000] as const;
export const PERFORMANCE_DIAGNOSTIC_RUNTIME_MS = 15_000;
export const PERFORMANCE_DIAGNOSTIC_MAX_RUNTIME_MS = 45_000;
export const PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION = 3;
export const PERFORMANCE_DIAGNOSTIC_REPORT_MAX_BYTES = 36_000;

const BOOT_TIMELINE_LIMIT = 32;
const QUALITY_SAMPLE_LIMIT = 24;
const QUALITY_LIFECYCLE_LIMIT = 24;
const TRACE_SPIKE_LIMIT = 16;
const LOCAL_DIAGNOSTIC_EVENT_LIMIT = 8;
const LOCAL_DIAGNOSTIC_TTL_MS = 24 * 60 * 60 * 1_000;
const LOCAL_DIAGNOSTIC_STORAGE_KEY = "stacks-performance-diagnostic:v3";

let documentDiagnosticId: string | null = null;

export type PerformanceDiagnosticEvent =
  AnalyticsEventProperties["homepage_performance_diagnostic"];

export type LocalPerformanceDiagnosticBundle = Readonly<{
  schema: "stacks-performance-diagnostic-bundle";
  version: typeof PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION;
  events: readonly PerformanceDiagnosticEvent[];
}>;

const localBundleListeners = new Set<() => void>();
let localBundle: LocalPerformanceDiagnosticBundle = {
  schema: "stacks-performance-diagnostic-bundle",
  version: PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION,
  events: [],
};
let localBundleHydrated = false;

type StoredPerformanceDiagnosticBundle = Readonly<{
  expiresAt: number;
  bundle: LocalPerformanceDiagnosticBundle;
}>;

function diagnosticStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function decodeStoredDiagnosticBundle(
  serialized: string | null,
  now: number,
): LocalPerformanceDiagnosticBundle | null {
  if (!serialized) return null;
  try {
    const stored = JSON.parse(
      serialized,
    ) as Partial<StoredPerformanceDiagnosticBundle>;
    if (
      typeof stored.expiresAt !== "number" ||
      stored.expiresAt <= now ||
      stored.bundle?.schema !== "stacks-performance-diagnostic-bundle" ||
      stored.bundle.version !== PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION ||
      !Array.isArray(stored.bundle.events)
    )
      return null;
    return {
      ...stored.bundle,
      events: stored.bundle.events.slice(-LOCAL_DIAGNOSTIC_EVENT_LIMIT),
    };
  } catch {
    return null;
  }
}

function hydrateLocalBundle() {
  if (localBundleHydrated) return;
  localBundleHydrated = true;
  const storage = diagnosticStorage();
  if (!storage) return;
  try {
    const restored = decodeStoredDiagnosticBundle(
      storage.getItem(LOCAL_DIAGNOSTIC_STORAGE_KEY),
      Date.now(),
    );
    if (restored) localBundle = restored;
    else storage.removeItem(LOCAL_DIAGNOSTIC_STORAGE_KEY);
  } catch {
    // A support artifact is optional if browser storage is unavailable.
  }
}

function persistLocalBundle() {
  const storage = diagnosticStorage();
  if (!storage) return;
  try {
    storage.setItem(
      LOCAL_DIAGNOSTIC_STORAGE_KEY,
      JSON.stringify({
        expiresAt: Date.now() + LOCAL_DIAGNOSTIC_TTL_MS,
        bundle: localBundle,
      } satisfies StoredPerformanceDiagnosticBundle),
    );
  } catch {
    // Storage denial or quota pressure must not affect the measured page.
  }
}

/** Keep an exact, redacted copy of each uploaded payload in this document so
 * a support visitor can download the run even when PostHog access is wrong. */
export const localPerformanceDiagnostic = {
  subscribe(listener: () => void) {
    localBundleListeners.add(listener);
    return () => localBundleListeners.delete(listener);
  },
  getSnapshot() {
    hydrateLocalBundle();
    return localBundle;
  },
  record(event: PerformanceDiagnosticEvent) {
    hydrateLocalBundle();
    localBundle = {
      ...localBundle,
      events: [...localBundle.events, event].slice(
        -LOCAL_DIAGNOSTIC_EVENT_LIMIT,
      ),
    };
    persistLocalBundle();
    for (const listener of localBundleListeners) listener();
  },
  clear() {
    localBundleHydrated = true;
    localBundle = { ...localBundle, events: [] };
    try {
      diagnosticStorage()?.removeItem(LOCAL_DIAGNOSTIC_STORAGE_KEY);
    } catch {
      // Clearing in-memory evidence still succeeds when storage is denied.
    }
    for (const listener of localBundleListeners) listener();
  },
};

export function downloadPerformanceDiagnosticBundle(
  bundle = localPerformanceDiagnostic.getSnapshot(),
) {
  if (typeof document === "undefined" || bundle.events.length === 0) return;
  const runId = bundle.events.at(-1)?.diagnostic_run_id ?? "report";
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `stacks-performance-diagnostic-${runId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function randomDiagnosticId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** One identifier joins the boot and runtime reports for a machine generation. */
export function performanceDiagnosticRunId(epoch: number): string {
  const host =
    typeof window === "undefined"
      ? null
      : (window as Window & { __stacksPerformanceDiagnosticId?: string });
  const base = host
    ? (host.__stacksPerformanceDiagnosticId ??= randomDiagnosticId())
    : (documentDiagnosticId ??= randomDiagnosticId());
  return `${base}.${Math.max(0, Math.floor(epoch))}`;
}

type BootTimelineEntry = Readonly<{
  event: string;
  at_ms: number;
  timing: "exact" | "observed";
}>;

type BootMilestones = {
  assets_seen: number | null;
  assets_complete: number | null;
  first_frame: number | null;
  meadow_ready: number | null;
  world_ready: number | null;
  vignette_ready: number | null;
  revealed: number | null;
  live: number | null;
  failed: number | null;
};

const emptyMilestones = (): BootMilestones => ({
  assets_seen: null,
  assets_complete: null,
  first_frame: null,
  meadow_ready: null,
  world_ready: null,
  vignette_ready: null,
  revealed: null,
  live: null,
  failed: null,
});

export function worldBootBlockingGate(
  state: WorldBootState,
): WorldBootWaitStage | null {
  if (state.status !== "booting") return null;
  if (!state.assetsSeen) return "starting";
  if (state.assetsCompleteSince === null) return "assets";
  if (!state.firstFrame) return "firstFrame";
  if (!state.meadowReady) return "meadow";
  return "opening";
}

/** Records state-machine facts only. Presentation copy and timers are not evidence. */
export class WorldBootDiagnosticRecorder {
  private epoch: number | null = null;
  private startedAt: number | null = null;
  private previous: WorldBootState | null = null;
  private timeline: BootTimelineEntry[] = [];
  private milestones = emptyMilestones();

  observe(state: WorldBootState, observedAt: number): void {
    if (state.startedAt === null) return;
    if (this.epoch !== state.epoch) this.begin(state);

    const previous = this.previous;
    const observed = (event: string) => this.append(event, observedAt, false);
    const exact = (event: string, at: number) => this.append(event, at, true);
    const mark = (
      key: keyof BootMilestones,
      event: string,
      at = observedAt,
      isExact = false,
    ) => {
      this.milestones[key] ??= this.relative(at);
      if (isExact) exact(event, at);
      else observed(event);
    };

    if (state.assetsSeen && !previous?.assetsSeen)
      mark("assets_seen", "assets_seen");
    if (
      state.assetsCompleteSince !== null &&
      previous?.assetsCompleteSince == null
    )
      mark(
        "assets_complete",
        "assets_complete",
        state.assetsCompleteSince,
        true,
      );
    if (
      state.assetsCompleteSince === null &&
      previous !== null &&
      previous.assetsCompleteSince !== null
    )
      observed("assets_reopened");
    if (state.firstFrame && !previous?.firstFrame)
      mark("first_frame", "first_frame");
    if (state.meadowReady && !previous?.meadowReady)
      mark("meadow_ready", "meadow_ready");
    if (state.worldReadyAt !== null && previous?.worldReadyAt == null)
      mark("world_ready", "world_ready", state.worldReadyAt, true);
    if (state.bootVignetteReady && !previous?.bootVignetteReady)
      mark("vignette_ready", "vignette_ready");
    if (
      (state.status === "revealing" || state.status === "live") &&
      previous?.status !== "revealing" &&
      previous?.status !== "live"
    )
      mark("revealed", "revealed");
    if (state.status === "live" && previous?.status !== "live")
      mark("live", "live");
    if (state.status === "failed" && previous?.status !== "failed")
      mark("failed", `failed:${state.failure ?? "unknown"}`);
    if (state.status === "ineligible" && previous?.status !== "ineligible")
      observed(`ineligible:${state.ineligibility ?? "unknown"}`);
    if (previous !== null && state.waitStage !== previous.waitStage)
      observed(`display_stage:${state.waitStage}`);
    if (
      state.hiddenSince !== null &&
      previous !== null &&
      previous.hiddenSince === null
    )
      observed("visibility:hidden");
    if (
      state.hiddenSince === null &&
      previous !== null &&
      previous.hiddenSince !== null
    )
      observed("visibility:visible");

    this.previous = { ...state };
  }

  snapshot(observedAt: number) {
    const state = this.previous;
    return {
      schema: "stacks-boot-diagnostic" as const,
      version: PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION,
      epoch: this.epoch ?? 0,
      elapsed_ms: this.relative(observedAt),
      status: state?.status ?? "unstarted",
      load_path: state?.loadPath ?? "cold",
      failure: state?.failure ?? null,
      ineligibility: state?.ineligibility ?? null,
      blocking_gate: state ? worldBootBlockingGate(state) : null,
      display_stage: state?.waitStage ?? "starting",
      document_hidden: state ? state.hiddenSince !== null : false,
      gates: {
        assets_seen: state?.assetsSeen ?? false,
        assets_complete: state ? state.assetsCompleteSince !== null : false,
        first_frame: state?.firstFrame ?? false,
        meadow_ready: state?.meadowReady ?? false,
        world_ready: state ? state.worldReadyAt !== null : false,
        vignette_ready: state?.bootVignetteReady ?? false,
      },
      assets_complete_for_ms:
        state?.assetsCompleteSince == null
          ? null
          : Math.max(0, Math.round(observedAt - state.assetsCompleteSince)),
      milestone_ms: { ...this.milestones },
      timeline: this.timeline.map((entry) => ({ ...entry })),
    };
  }

  private begin(state: WorldBootState) {
    this.epoch = state.epoch;
    this.startedAt = state.startedAt;
    this.previous = null;
    this.timeline = [];
    this.milestones = emptyMilestones();
    this.append("boot_started", state.startedAt!, true);
  }

  private relative(at: number): number {
    return Math.max(0, Math.round(at - (this.startedAt ?? at)));
  }

  private append(event: string, at: number, exact: boolean) {
    this.timeline.push({
      event,
      at_ms: this.relative(at),
      timing: exact ? "exact" : "observed",
    });
    if (this.timeline.length > BOOT_TIMELINE_LIMIT)
      this.timeline.splice(0, this.timeline.length - BOOT_TIMELINE_LIMIT);
  }
}

function countBy<T>(values: readonly T[], keyFor: (value: T) => string) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = keyFor(value) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function durationSummary(values: readonly number[]) {
  return {
    count: values.length,
    total_ms: Number(values.reduce((sum, value) => sum + value, 0).toFixed(1)),
    max_ms: Number(Math.max(0, ...values).toFixed(1)),
  };
}

function rendererEdges(frames: readonly PerformanceTraceFrame[]) {
  const withRenderer = frames.filter(({ renderer }) => renderer !== null);
  return {
    first: withRenderer[0]?.renderer ?? null,
    last: withRenderer.at(-1)?.renderer ?? null,
  };
}

function compactSession(session: Readonly<Record<string, unknown>>) {
  const allowed = [
    "capturedAt",
    "viewport",
    "deviceDpr",
    "hardwareConcurrency",
    "deviceMemoryGb",
    "connection",
    "userAgent",
    "performanceEntryTypes",
    "queryFlags",
    "testProfile",
    "theme",
    "buildMode",
    "quality",
    "performanceSettings",
    "renderer",
    "diagnosticRunId",
  ] as const;
  return Object.fromEntries(
    allowed.flatMap((key) =>
      Object.hasOwn(session, key) ? [[key, session[key]]] : [],
    ),
  );
}

function compactResolvedQuality(resolved: Readonly<Record<string, unknown>>) {
  const allowed = [
    "mode",
    "profile",
    "durable",
    "moving",
    "frozen",
    "forced",
    "effectiveDpr",
    "physicalPixels",
    "postprocessing",
    "meadowRung",
    "contentTier",
    "transitionReason",
    "fallbackStatus",
    "constraint",
    "axes",
    "persistence",
  ] as const;
  return Object.fromEntries(
    allowed.flatMap((key) =>
      Object.hasOwn(resolved, key) ? [[key, resolved[key]]] : [],
    ),
  );
}

/** Collapse a frame trace into a PostHog-sized report. Resource names and raw
 * frames are deliberately excluded; totals and renderer edges retain the
 * useful evidence without forwarding visited URLs or a multi-megabyte log. */
export function compactScenePerformanceDiagnostic({
  trace,
  quality,
}: {
  trace: PerformanceTraceReport;
  quality: SceneQualityLog | null;
}) {
  const resourceDurations = trace.resources.map(({ durationMs }) => durationMs);
  const slowestResources = [...trace.resources]
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 5)
    .map(({ durationMs, initiatorType, transferSize }) => ({
      duration_ms: Number(Math.max(0, durationMs).toFixed(1)),
      initiator_type: initiatorType || "unknown",
      transfer_bytes: Math.max(0, transferSize),
    }));
  const longTaskDurations = trace.longTasks.map(({ durationMs }) => durationMs);
  const longFrameDurations = trace.longAnimationFrames.map(
    ({ durationMs }) => durationMs,
  );
  const commitDurations = trace.reactCommits.map(
    ({ durationMs }) => durationMs,
  );
  const qualitySamples = quality?.evidence.samples.slice(-QUALITY_SAMPLE_LIMIT);
  const qualityLifecycle = quality?.evidence.lifecycle.slice(
    -QUALITY_LIFECYCLE_LIMIT,
  );

  return {
    schema: "stacks-performance-diagnostic" as const,
    version: PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION,
    trace: {
      version: trace.version,
      duration_ms:
        trace.startedAt === null
          ? null
          : Math.max(
              0,
              Math.round(
                (trace.stoppedAt ?? performanceNow()) - trace.startedAt,
              ),
            ),
      truncated: trace.truncated,
      frame_count: trace.frames.length,
      session: compactSession(trace.session),
      summary: trace.summary,
      spikes: trace.spikes.slice(0, TRACE_SPIKE_LIMIT),
      renderer: rendererEdges(trace.frames),
      event_counts: countBy(trace.events, ({ type }) => type),
      long_tasks: durationSummary(longTaskDurations),
      long_animation_frames: durationSummary(longFrameDurations),
      react_commits: {
        ...durationSummary(commitDurations),
        by_component: countBy(trace.reactCommits, ({ id }) => id),
      },
      resources: {
        ...durationSummary(resourceDurations),
        transfer_bytes: trace.resources.reduce(
          (sum, { transferSize }) => sum + Math.max(0, transferSize),
          0,
        ),
        by_initiator: countBy(
          trace.resources,
          ({ initiatorType }) => initiatorType,
        ),
        slowest: slowestResources,
      },
    },
    quality: quality
      ? {
          schema: quality.schema,
          version: quality.version,
          elapsed_ms: quality.elapsedMs,
          visibility: quality.visibility,
          query_flags: quality.queryFlags,
          viewport: quality.viewport,
          device: quality.device,
          renderer: quality.renderer,
          resolved: compactResolvedQuality(quality.quality),
          evidence: {
            sample_count: quality.evidence.samples.length,
            samples_truncated:
              quality.evidence.samples.length > QUALITY_SAMPLE_LIMIT,
            samples: qualitySamples,
            lifecycle_count: quality.evidence.lifecycle.length,
            lifecycle_truncated:
              quality.evidence.lifecycle.length > QUALITY_LIFECYCLE_LIMIT,
            lifecycle: qualityLifecycle,
          },
        }
      : null,
  };
}

function performanceNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function jsonBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (typeof TextEncoder !== "undefined")
    return new TextEncoder().encode(serialized).byteLength;
  return new Blob([serialized]).size;
}

function cloneSerializable(value: UnknownRecord): UnknownRecord {
  return JSON.parse(JSON.stringify(value)) as UnknownRecord;
}

function fitDiagnosticReport(report: UnknownRecord): {
  report: UnknownRecord;
  bytes: number;
  truncated: boolean;
} {
  let fitted = cloneSerializable(report);
  let bytes = jsonBytes(fitted);
  if (bytes <= PERFORMANCE_DIAGNOSTIC_REPORT_MAX_BYTES)
    return { report: fitted, bytes, truncated: false };

  const trace = asRecord(fitted.trace);
  const quality = asRecord(fitted.quality);
  const evidence = asRecord(quality?.evidence);
  if (trace && Array.isArray(trace.spikes))
    trace.spikes = trace.spikes.slice(0, 6);
  if (evidence) {
    if (Array.isArray(evidence.samples))
      evidence.samples = evidence.samples.slice(-8);
    if (Array.isArray(evidence.lifecycle))
      evidence.lifecycle = evidence.lifecycle.slice(-8);
    evidence.transport_truncated = true;
  }
  const resources = asRecord(trace?.resources);
  if (resources && Array.isArray(resources.slowest))
    resources.slowest = resources.slowest.slice(0, 3);
  fitted.transport = { payload_truncated: true };
  bytes = jsonBytes(fitted);
  if (bytes <= PERFORMANCE_DIAGNOSTIC_REPORT_MAX_BYTES)
    return { report: fitted, bytes, truncated: true };

  if (trace) trace.spikes = [];
  if (evidence) {
    evidence.samples = [];
    evidence.lifecycle = [];
  }
  bytes = jsonBytes(fitted);
  if (bytes <= PERFORMANCE_DIAGNOSTIC_REPORT_MAX_BYTES)
    return { report: fitted, bytes, truncated: true };

  fitted = {
    schema: report.schema ?? "stacks-performance-diagnostic",
    version: report.version ?? PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION,
    transport: {
      payload_truncated: true,
      summary_only: true,
      original_bytes: jsonBytes(report),
    },
    trace: trace
      ? {
          version: trace.version ?? null,
          duration_ms: trace.duration_ms ?? null,
          truncated: trace.truncated ?? null,
          frame_count: trace.frame_count ?? null,
          summary: trace.summary ?? null,
          renderer: trace.renderer ?? null,
          event_counts: trace.event_counts ?? null,
          long_tasks: trace.long_tasks ?? null,
          long_animation_frames: trace.long_animation_frames ?? null,
          resources: resources
            ? {
                count: resources.count ?? null,
                total_ms: resources.total_ms ?? null,
                max_ms: resources.max_ms ?? null,
                transfer_bytes: resources.transfer_bytes ?? null,
                by_initiator: resources.by_initiator ?? null,
              }
            : null,
        }
      : null,
    quality: quality
      ? {
          schema: quality.schema ?? null,
          version: quality.version ?? null,
          elapsed_ms: quality.elapsed_ms ?? null,
          visibility: quality.visibility ?? null,
          viewport: quality.viewport ?? null,
          device: quality.device ?? null,
          renderer: quality.renderer ?? null,
          resolved: quality.resolved ?? null,
        }
      : null,
    boot: report.boot ?? null,
    browser: report.browser ?? null,
  };
  return { report: fitted, bytes: jsonBytes(fitted), truncated: true };
}

function diagnosticConstraint(report: UnknownRecord) {
  const quality = asRecord(report.quality);
  const evidence = asRecord(quality?.evidence);
  const samples = Array.isArray(evidence?.samples) ? evidence.samples : [];
  const counts = new Map<string, number>();
  for (const sample of samples) {
    const entry = asRecord(sample);
    if (!entry || entry.usable === false || entry.visible === false) continue;
    const constraint = entry.constraint;
    if (typeof constraint !== "string") continue;
    counts.set(constraint, (counts.get(constraint) ?? 0) + 1);
  }
  const cpu = counts.get("cpu") ?? 0;
  const gpu = counts.get("gpu") ?? 0;
  const attributed = cpu + gpu;
  if (attributed > 0 && Math.min(cpu, gpu) / attributed >= 0.25)
    return { dominant: null, mixed: true } as const;
  const ordered = [...counts.entries()].sort(
    ([, left], [, right]) => right - left,
  );
  const dominant = ordered[0]?.[0];
  return {
    dominant:
      dominant === "cpu" ||
      dominant === "gpu" ||
      dominant === "headroom" ||
      dominant === "unknown"
        ? dominant
        : null,
    mixed: false,
  } as const;
}

function runtimeScalars(report: UnknownRecord) {
  const trace = asRecord(report.trace);
  const summary = asRecord(trace?.summary);
  const settled = asRecord(summary?.settled);
  const all = asRecord(summary?.all);
  const distribution = (finiteNumber(settled?.count) ?? 0) > 0 ? settled : all;
  const frame = asRecord(distribution?.frameMs);
  return {
    targetMs: finiteNumber(summary?.targetFrameMs),
    fps: finiteNumber(distribution?.fps),
    p95: finiteNumber(frame?.p95),
    dropped: finiteNumber(distribution?.droppedFrameRatio),
  };
}

function diagnosticHint({
  reportKind,
  bootStatus,
  blockingGate,
  dominantConstraint,
  mixedConstraint,
  runtime,
}: {
  reportKind: PerformanceDiagnosticEvent["report_kind"];
  bootStatus: PerformanceDiagnosticEvent["boot_status"];
  blockingGate: PerformanceDiagnosticEvent["blocking_gate"];
  dominantConstraint: PerformanceDiagnosticEvent["dominant_constraint"];
  mixedConstraint: boolean;
  runtime: ReturnType<typeof runtimeScalars>;
}): PerformanceDiagnosticEvent["diagnostic_hint"] {
  if (reportKind === "diagnostic_start") return "boot_start";
  if (reportKind !== "runtime") {
    if (bootStatus === "live" || bootStatus === "revealing")
      return "boot_complete";
    if (blockingGate === "assets") return "boot_assets";
    if (blockingGate === "firstFrame") return "boot_first_frame";
    if (blockingGate === "meadow") return "boot_meadow";
    if (blockingGate === "opening") return "boot_opening";
    return "insufficient_data";
  }
  if (runtime.p95 === null || runtime.targetMs === null)
    return "insufficient_data";
  if (runtime.p95 <= runtime.targetMs * 1.5 && (runtime.dropped ?? 0) < 0.1)
    return "runtime_healthy";
  if (dominantConstraint === "cpu") return "runtime_cpu";
  if (dominantConstraint === "gpu") return "runtime_gpu";
  if (mixedConstraint) return "runtime_mixed";
  return "runtime_unknown";
}

/** One seam owns PostHog identity, queryable verdicts, and transport sizing for
 * every boot and runtime report. Callers provide facts; they do not reproduce
 * the event contract. */
export function createPerformanceDiagnosticEvent({
  diagnosticRunId,
  reportKind,
  captureReason,
  checkpointIndex = null,
  elapsedMs,
  bootStatus,
  bootPath,
  blockingGate,
  report,
}: {
  diagnosticRunId: string;
  reportKind: PerformanceDiagnosticEvent["report_kind"];
  captureReason: PerformanceDiagnosticEvent["capture_reason"];
  checkpointIndex?: number | null;
  elapsedMs: number;
  bootStatus: PerformanceDiagnosticEvent["boot_status"];
  bootPath: PerformanceDiagnosticEvent["boot_path"];
  blockingGate: PerformanceDiagnosticEvent["blocking_gate"];
  report: UnknownRecord;
}): PerformanceDiagnosticEvent {
  const runtime = runtimeScalars(report);
  const constraint = diagnosticConstraint(report);
  const boot = asRecord(report.boot);
  const milestones = asRecord(boot?.milestone_ms);
  const browser = asRecord(report.browser);
  const trace = asRecord(report.trace);
  const session = asRecord(trace?.session);
  const quality = asRecord(report.quality);
  const resolved = asRecord(quality?.resolved);
  const axes = asRecord(resolved?.axes);
  const fitted = fitDiagnosticReport(report);
  const roundedElapsed = Math.max(0, Math.round(elapsedMs));
  const diagnosticReportId = [
    diagnosticRunId,
    reportKind,
    captureReason,
    checkpointIndex ?? roundedElapsed,
  ].join(":");

  return {
    schema_version: PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION,
    diagnostic_run_id: diagnosticRunId,
    diagnostic_report_id: diagnosticReportId,
    diagnostic_build_id:
      process.env.NEXT_PUBLIC_STACKS_BUILD_ID?.slice(0, 40) ?? "unknown",
    report_kind: reportKind,
    capture_reason: captureReason,
    checkpoint_index: checkpointIndex,
    instrumented: true,
    elapsed_ms: roundedElapsed,
    boot_status: bootStatus,
    boot_path: bootPath,
    blocking_gate: blockingGate,
    diagnostic_hint: diagnosticHint({
      reportKind,
      bootStatus,
      blockingGate,
      dominantConstraint: constraint.dominant,
      mixedConstraint: constraint.mixed,
      runtime,
    }),
    test_profile:
      typeof browser?.test_profile === "string"
        ? browser.test_profile
        : typeof session?.testProfile === "string"
          ? session.testProfile
          : null,
    dominant_constraint: constraint.dominant,
    effective_fps: runtime.fps,
    frame_p95_ms: runtime.p95,
    dropped_frame_ratio: runtime.dropped,
    survival_active: typeof axes?.survival === "boolean" ? axes.survival : null,
    first_frame_ms: finiteNumber(milestones?.first_frame),
    meadow_ready_ms: finiteNumber(milestones?.meadow_ready),
    revealed_ms: finiteNumber(milestones?.revealed),
    live_ms: finiteNumber(milestones?.live),
    report_truncated_for_transport: fitted.truncated,
    report_bytes: fitted.bytes,
    report: fitted.report,
  };
}

export type PerformanceDiagnosticDelivery = Readonly<{
  status: "uploaded" | "sdk_fallback";
  reportKind: PerformanceDiagnosticEvent["report_kind"];
  diagnosticReportId: string;
}>;

function announceDiagnosticDelivery(detail: PerformanceDiagnosticDelivery) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("chappy:performance-diagnostic-delivery", { detail }),
    );
  } catch {
    // The upload does not depend on an optional local status listener.
  }
}

/** Persist first, then use the same-origin acknowledged path. The ordinary
 * PostHog SDK remains a fallback for live pages if the relay is unavailable. */
export async function submitPerformanceDiagnostic(
  event: PerformanceDiagnosticEvent,
): Promise<PerformanceDiagnosticDelivery> {
  localPerformanceDiagnostic.record(event);
  try {
    const response = await fetch("/api/performance-diagnostic", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-stacks-diagnostic": String(PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION),
      },
      body: JSON.stringify(event),
      credentials: "omit",
      cache: "no-store",
      keepalive: true,
    });
    if (!response.ok) throw new Error(`diagnostic relay ${response.status}`);
    const delivered = {
      status: "uploaded",
      reportKind: event.report_kind,
      diagnosticReportId: event.diagnostic_report_id,
    } as const;
    announceDiagnosticDelivery(delivered);
    return delivered;
  } catch {
    capture("homepage_performance_diagnostic", event);
    void startAnalyticsDelivery();
    const fallback = {
      status: "sdk_fallback",
      reportKind: event.report_kind,
      diagnosticReportId: event.diagnostic_report_id,
    } as const;
    announceDiagnosticDelivery(fallback);
    return fallback;
  }
}

/** Browser facts useful for explaining a slow gate, with no URL values. */
export function browserPerformanceDiagnosticContext() {
  if (typeof window === "undefined") return {};
  const connection = (
    navigator as Navigator & {
      connection?: {
        effectiveType?: string;
        downlink?: number;
        rtt?: number;
        saveData?: boolean;
      };
    }
  ).connection;
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  const navigation = performance.getEntriesByType("navigation")[0] as
    | (PerformanceNavigationTiming & { activationStart?: number })
    | undefined;
  const paints = Object.fromEntries(
    performance
      .getEntriesByType("paint")
      .filter(
        ({ name }) =>
          name === "first-paint" || name === "first-contentful-paint",
      )
      .map(({ name, startTime }) => [
        name.replaceAll("-", "_"),
        Math.round(startTime),
      ]),
  );
  const jsHeap = (
    performance as Performance & {
      memory?: {
        usedJSHeapSize?: number;
        totalJSHeapSize?: number;
        jsHeapSizeLimit?: number;
      };
    }
  ).memory;
  return {
    captured_at: new Date().toISOString(),
    // Boot reports are the evidence for `light-boot` and `constrained`, so a
    // boot report must say which profile shaped it. Keys only for the rest of
    // the query, matching the runtime report's redaction.
    test_profile:
      performanceProfileFromSearch(window.location.search)?.id ?? null,
    query_keys: [
      ...new Set(new URLSearchParams(window.location.search).keys()),
    ],
    viewport: [window.innerWidth, window.innerHeight],
    device_dpr: window.devicePixelRatio,
    hardware_concurrency: navigator.hardwareConcurrency || null,
    device_memory_gb: Number.isFinite(memory) ? memory : null,
    user_agent: navigator.userAgent,
    platform: navigator.platform,
    max_touch_points: navigator.maxTouchPoints || 0,
    automated: navigator.webdriver,
    cross_origin_isolated: globalThis.crossOriginIsolated,
    visibility: document.visibilityState,
    was_discarded:
      (document as Document & { wasDiscarded?: boolean }).wasDiscarded ?? false,
    screen: window.screen
      ? {
          width: window.screen.width,
          height: window.screen.height,
          available_width: window.screen.availWidth,
          available_height: window.screen.availHeight,
          color_depth: window.screen.colorDepth,
        }
      : null,
    js_heap: jsHeap
      ? {
          used_bytes: finiteNumber(jsHeap.usedJSHeapSize),
          total_bytes: finiteNumber(jsHeap.totalJSHeapSize),
          limit_bytes: finiteNumber(jsHeap.jsHeapSizeLimit),
        }
      : null,
    connection: connection
      ? {
          effective_type: connection.effectiveType ?? null,
          downlink_mbps: connection.downlink ?? null,
          rtt_ms: connection.rtt ?? null,
          save_data: connection.saveData ?? false,
        }
      : null,
    navigation: navigation
      ? {
          type: navigation.type,
          activation_start_ms: Math.round(navigation.activationStart ?? 0),
          worker_start_ms: Math.round(navigation.workerStart),
          redirect_end_ms: Math.round(navigation.redirectEnd),
          dns_end_ms: Math.round(navigation.domainLookupEnd),
          connect_end_ms: Math.round(navigation.connectEnd),
          request_start_ms: Math.round(navigation.requestStart),
          response_start_ms: Math.round(navigation.responseStart),
          response_end_ms: Math.round(navigation.responseEnd),
          dom_interactive_ms: Math.round(navigation.domInteractive),
          dom_content_loaded_ms: Math.round(
            navigation.domContentLoadedEventEnd,
          ),
          load_event_ms: Math.round(navigation.loadEventEnd),
          transfer_bytes: navigation.transferSize,
          encoded_body_bytes: navigation.encodedBodySize,
          decoded_body_bytes: navigation.decodedBodySize,
          next_hop_protocol: navigation.nextHopProtocol || null,
        }
      : null,
    paint_ms: paints,
  };
}
