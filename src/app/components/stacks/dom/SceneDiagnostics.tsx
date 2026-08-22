"use client";

import { browserStorage } from "../mobile/liveness";
import { requestDevHooks } from "../scene/devHooks";
import { freeRoamDiagnosticsController } from "../scene/freeRoamDiagnostics";
import {
  insectDiagnosticsController,
  summarizeInsectPerchDiagnostics,
} from "../scene/insectPerchDiagnostic";
import { meadowDiagnosticsController } from "../scene/meadowDiagnostics";
import {
  downloadPerformanceTrace,
  scenePerformanceTrace,
} from "../scene/performanceTrace";
import { physicsDiagnosticsController } from "../scene/physicsDiagnostics";
import { QUALITY_SAMPLE_INTERVAL_MS } from "../scene/quality";
import {
  type DiagnosticControlDescriptor,
  type DiagnosticRegistrySnapshot,
  sceneDiagnosticsRegistry,
} from "../scene/sceneDiagnosticsRegistry";
import {
  clearSceneFirstVisitStorage,
  sceneFirstVisitUrl,
} from "../scene/sceneFirstVisitReset";
import { readSceneMatrixMs } from "../scene/sceneFrameCost";
import {
  sceneQualityController,
  useSceneQualityControls,
  useSceneQualityRuntime,
} from "../scene/sceneQualityController";
import { useStacks } from "../store";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import "./SceneDiagnostics.module.css";
import { type DevHudInput, createDevHudRows } from "./devHudPresentation";
import { qualityRenderingReadout } from "./qualityReadout";

/** Plain words for the constraint, because "cpu"/"gpu" alone reads as a
 * category rather than as a verdict about this window. */
const CONSTRAINT_LABEL = {
  cpu: "CPU bound",
  gpu: "GPU bound",
  headroom: "headroom",
  unknown: "no verdict",
} as const;

type DevHudSnapshot = DevHudInput;

const EMPTY_DEV_HUD: DevHudSnapshot = {
  fps: null,
  hooksStatus: "starting",
  profile: null,
  mode: null,
  moving: null,
  frozen: null,
  customOverrides: null,
  fallbackStatus: null,
  p95: null,
  targetFrameMs: null,
  droppedFrameRatio: null,
  resolutionStep: null,
  effectsTier: null,
  contentTier: null,
  constraint: null,
  lastTransition: null,
  dpr: null,
  physicalPixels: null,
  pixelBudget: null,
  bloomLevels: null,
  ambientOcclusion: null,
  ambientOcclusionHalfRes: null,
  ambientOcclusionQuality: null,
  depthOfField: null,
  depthOfFieldResolutionScale: null,
  depthOfFieldBokehScale: null,
};

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function lastQualityTransition(
  value: unknown,
  now: number,
): DevHudSnapshot["lastTransition"] {
  if (!Array.isArray(value) || value.length === 0) return null;
  const transition = record(value[value.length - 1]);
  const axis = transition?.axis;
  const direction = transition?.direction;
  const at = numeric(transition?.at);
  if (
    (axis !== "resolution" && axis !== "effects" && axis !== "content") ||
    (direction !== "down" && direction !== "up") ||
    at == null
  )
    return null;
  return { axis, direction, ageMs: Math.max(0, now - at) };
}

function rendererSnapshot(): DevHudSnapshot {
  const hooksAvailable = window.__stacks != null;
  const state = window.__stacks?.state();
  const quality = record(state?.quality);
  const metrics = record(quality?.metrics);
  const axes = record(quality?.axes);
  const plan = record(quality?.plan);
  const effects = record(plan?.effects);
  const effectsTier = axes?.effects;
  const contentTier = axes?.content;
  const constraint = quality?.constraint;
  return {
    fps: numeric(metrics?.fps),
    hooksStatus: hooksAvailable ? "ready" : "missing",
    profile: typeof quality?.profile === "string" ? quality.profile : null,
    mode: typeof quality?.mode === "string" ? quality.mode : null,
    moving: typeof quality?.moving === "boolean" ? quality.moving : null,
    frozen: typeof quality?.frozen === "boolean" ? quality.frozen : null,
    customOverrides:
      typeof quality?.customOverrides === "boolean"
        ? quality.customOverrides
        : null,
    fallbackStatus:
      typeof quality?.fallbackStatus === "string"
        ? quality.fallbackStatus
        : null,
    p95: numeric(metrics?.p95),
    targetFrameMs: numeric(metrics?.targetFrameMs),
    droppedFrameRatio: numeric(metrics?.droppedFrameRatio),
    resolutionStep: numeric(axes?.resolutionStep),
    effectsTier:
      effectsTier === "cinematic" ||
      effectsTier === "full" ||
      effectsTier === "lean" ||
      effectsTier === "minimal"
        ? effectsTier
        : null,
    contentTier:
      contentTier === "full" ||
      contentTier === "reduced" ||
      contentTier === "minimal"
        ? contentTier
        : null,
    constraint:
      constraint === "cpu" ||
      constraint === "gpu" ||
      constraint === "headroom" ||
      constraint === "unknown"
        ? constraint
        : null,
    lastTransition: lastQualityTransition(
      quality?.transitions,
      performance.now(),
    ),
    dpr: numeric(state?.dpr) ?? numeric(quality?.effectiveDpr),
    physicalPixels: numeric(quality?.physicalPixels),
    pixelBudget: numeric(plan?.pixelBudget),
    bloomLevels: numeric(effects?.bloomLevels),
    ambientOcclusion:
      typeof effects?.ambientOcclusion === "boolean"
        ? effects.ambientOcclusion
        : null,
    ambientOcclusionHalfRes:
      typeof effects?.ambientOcclusionHalfRes === "boolean"
        ? effects.ambientOcclusionHalfRes
        : null,
    ambientOcclusionQuality:
      typeof effects?.ambientOcclusionQuality === "string"
        ? effects.ambientOcclusionQuality
        : null,
    depthOfField:
      typeof effects?.depthOfField === "boolean" ? effects.depthOfField : null,
    depthOfFieldResolutionScale: numeric(effects?.depthOfFieldResolutionScale),
    depthOfFieldBokehScale: numeric(effects?.depthOfFieldBokehScale),
  };
}

/** A live readout of the same rolling scene window that drives Auto. */
function DevPerformanceHud({
  expanded,
  tracing,
  launcher,
  onToggle,
}: {
  expanded: boolean;
  tracing: boolean;
  launcher: React.RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
}) {
  const [snapshot, setSnapshot] = useState(EMPTY_DEV_HUD);

  useEffect(() => {
    const interval = window.setInterval(
      () => setSnapshot(rendererSnapshot()),
      QUALITY_SAMPLE_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, []);

  const rows = createDevHudRows(snapshot);

  return (
    <button
      ref={launcher}
      type="button"
      className="stacks-dev-hud"
      aria-label="Open scene debug console"
      aria-keyshortcuts="h"
      aria-expanded={expanded}
      aria-controls="stacks-scene-diagnostics"
      aria-haspopup="dialog"
      data-tracing={tracing || undefined}
      title={
        tracing
          ? "Performance trace recording · press H to stop and review"
          : "Scene debug · press H · FPS, policy, effects, and decisions"
      }
      onClick={onToggle}
    >
      {rows.map((row) => (
        <span key={row.id} data-row={row.id}>
          {row.segments.map((segment, index) => (
            <span
              key={`${row.id}:${index}`}
              data-tone={segment.tone ?? "normal"}
              data-emphasis={segment.emphasis ? true : undefined}
            >
              {segment.text}
            </span>
          ))}
        </span>
      ))}
    </button>
  );
}

type DiagnosticsPanel = "overview" | "render" | "simulate" | "inspect";

type DiagnosticsNotice = Readonly<{
  tone: "danger" | "warning" | "info";
  title: string;
  detail: string;
  panel: Exclude<DiagnosticsPanel, "overview">;
}>;

const DIAGNOSTICS_PANELS: ReadonlyArray<{
  id: DiagnosticsPanel;
  label: string;
}> = [
  { id: "overview", label: "Overview" },
  { id: "render", label: "Render" },
  { id: "simulate", label: "Simulate" },
  { id: "inspect", label: "Inspect" },
];

function isPresent<T>(value: T | null): value is T {
  return value != null;
}

function DiagnosticsTabs({
  active,
  onChange,
}: {
  active: DiagnosticsPanel;
  onChange: (panel: DiagnosticsPanel) => void;
}) {
  return (
    <div
      className="stacks-diagnostics-tabs"
      role="tablist"
      aria-label="Scene diagnostics views"
    >
      {DIAGNOSTICS_PANELS.map(({ id, label }) => (
        <button
          id={`stacks-diagnostics-tab-${id}`}
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          aria-controls={`stacks-diagnostics-panel-${id}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function diagnosticOptionValue(value: string | number | boolean | null) {
  if (value === null) return "null";
  return `${typeof value}:${String(value)}`;
}

function DiagnosticControl({
  descriptor,
  snapshot,
  fallbackValue,
}: {
  descriptor: DiagnosticControlDescriptor;
  snapshot: DiagnosticRegistrySnapshot;
  fallbackValue?: number;
}) {
  const state = snapshot[descriptor.id];
  if (!state) throw new Error(`Missing diagnostic state for ${descriptor.id}`);
  const inputId =
    descriptor.inputId ??
    `stacks-diagnostic-${descriptor.id.replaceAll(".", "-")}`;
  if (descriptor.valueKind === "boolean")
    return (
      <label className="stacks-diagnostics-control" title={descriptor.help}>
        <input
          id={inputId}
          type="checkbox"
          checked={Boolean(state.value)}
          disabled={state.disabled}
          aria-keyshortcuts={descriptor.ariaKeyShortcuts}
          onChange={(event) =>
            sceneDiagnosticsRegistry.update(
              descriptor.id,
              event.currentTarget.checked,
            )
          }
        />{" "}
        {descriptor.label}
      </label>
    );

  if (descriptor.allowedValues.kind === "range") {
    const allowed = descriptor.allowedValues;
    const value =
      typeof state.value === "number"
        ? state.value
        : (fallbackValue ?? allowed.min);
    return (
      <label
        className="stacks-diagnostics-range"
        htmlFor={inputId}
        title={descriptor.help}
      >
        <span>{descriptor.label}</span>
        <output htmlFor={inputId}>
          {value.toFixed(allowed.decimals)}
          {allowed.unit ?? ""}
        </output>
        <input
          id={inputId}
          type="range"
          min={allowed.min}
          max={allowed.max}
          step={allowed.step}
          value={value}
          disabled={state.disabled}
          onChange={(event) =>
            sceneDiagnosticsRegistry.update(
              descriptor.id,
              event.currentTarget.valueAsNumber,
            )
          }
        />
      </label>
    );
  }

  const options = descriptor.allowedValues.values;
  const ungrouped = options.filter((option) => !option.optionGroup);
  const optionGroups = [
    ...new Set(options.flatMap((option) => option.optionGroup ?? [])),
  ];
  return (
    <label className="stacks-diagnostics-control" title={descriptor.help}>
      {descriptor.label}
      <select
        id={inputId}
        className="ml-auto rounded border border-white/15 bg-black/40 px-1.5 py-1 text-white"
        value={diagnosticOptionValue(state.value)}
        disabled={state.disabled}
        onChange={(event) => {
          const selected = options.find(
            (option) =>
              diagnosticOptionValue(option.value) === event.currentTarget.value,
          );
          if (selected)
            sceneDiagnosticsRegistry.update(descriptor.id, selected.value);
        }}
      >
        {ungrouped.map((option) => (
          <option
            key={diagnosticOptionValue(option.value)}
            value={diagnosticOptionValue(option.value)}
          >
            {option.label}
          </option>
        ))}
        {optionGroups.map((group) => (
          <optgroup key={group} label={group}>
            {options
              .filter((option) => option.optionGroup === group)
              .map((option) => (
                <option
                  key={diagnosticOptionValue(option.value)}
                  value={diagnosticOptionValue(option.value)}
                >
                  {option.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function DiagnosticRegistrySection({
  groupId,
  snapshot,
  fallbackValues = {},
  beforeControls,
  children,
}: {
  groupId: string;
  snapshot: DiagnosticRegistrySnapshot;
  fallbackValues?: Readonly<Record<string, number>>;
  beforeControls?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const section = [
    ...sceneDiagnosticsRegistry.sections("simulate"),
    ...sceneDiagnosticsRegistry.sections("render"),
    ...sceneDiagnosticsRegistry.sections("inspect"),
  ].find((candidate) => candidate.id === groupId);
  if (!section) throw new Error(`Missing diagnostic group ${groupId}`);
  const direct = section.controls.filter((control) => !control.subgroup);
  const subgroups = [
    ...new Set(section.controls.flatMap((control) => control.subgroup ?? [])),
  ];
  return (
    <fieldset className="stacks-diagnostics-section">
      <legend>{section.label}</legend>
      {beforeControls}
      {direct.map((descriptor) => (
        <DiagnosticControl
          key={descriptor.id}
          descriptor={descriptor}
          snapshot={snapshot}
          fallbackValue={fallbackValues[descriptor.id]}
        />
      ))}
      {subgroups.length > 0 ? (
        <div className="stacks-diagnostics-option-groups">
          {subgroups.map((subgroup) => (
            <div
              className="stacks-diagnostics-option-group"
              key={subgroup}
              data-span={subgroup === "overlay.perches" ? "full" : undefined}
            >
              <strong>
                {sceneDiagnosticsRegistry.subgroupLabel(subgroup)}
              </strong>
              {section.controls
                .filter((control) => control.subgroup === subgroup)
                .map((descriptor) => (
                  <DiagnosticControl
                    key={descriptor.id}
                    descriptor={descriptor}
                    snapshot={snapshot}
                    fallbackValue={fallbackValues[descriptor.id]}
                  />
                ))}
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </fieldset>
  );
}

function DiagnosticSegmentedControl({
  id,
  snapshot,
}: {
  id: string;
  snapshot: DiagnosticRegistrySnapshot;
}) {
  const descriptor = sceneDiagnosticsRegistry.descriptors.find(
    (control) => control.id === id,
  );
  const state = snapshot[id];
  if (!descriptor || !state || descriptor.allowedValues.kind !== "set")
    throw new Error(`Invalid segmented diagnostic control ${id}`);
  return (
    <div className="stacks-diagnostics-toolbar">
      <span>{descriptor.label}</span>
      <div
        className="stacks-diagnostics-segmented"
        role="group"
        aria-label={descriptor.help}
      >
        {descriptor.allowedValues.values.map((option) => (
          <button
            key={diagnosticOptionValue(option.value)}
            type="button"
            onClick={() =>
              sceneDiagnosticsRegistry.update(descriptor.id, option.value)
            }
            aria-pressed={Object.is(state.value, option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PerformanceTraceControls({
  onStartCapture,
}: {
  onStartCapture: () => void;
}) {
  const status = useSyncExternalStore(
    scenePerformanceTrace.subscribe,
    scenePerformanceTrace.getStatus,
    scenePerformanceTrace.getStatus,
  );
  const report = status.hasReport ? scenePerformanceTrace.report() : null;
  const signalCounts = new Map<string, number>();
  for (const spike of report?.spikes ?? [])
    for (const signal of spike.signals)
      signalCounts.set(signal, (signalCounts.get(signal) ?? 0) + 1);
  const strongestSignals = [...signalCounts]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([signal, count]) => `${signal} ${count}`)
    .join(" · ");
  const state = status.active ? "recording" : report ? "ready" : "idle";

  return (
    <details
      className="stacks-diagnostics-details stacks-diagnostics-inline-details stacks-performance-trace"
      data-state={state}
    >
      <summary>
        Performance trace ·{" "}
        <strong>
          {status.active ? "Recording" : report ? "Ready" : "No capture"}
        </strong>
      </summary>
      <p>
        Start closes this console. Pause, pan across a few shelves, then press H
        to stop and review; attach the JSON for analysis.
      </p>
      <div className="stacks-diagnostics-actions">
        <button type="button" disabled={status.active} onClick={onStartCapture}>
          {report ? "New capture" : "Start capture"}
        </button>
        <button
          type="button"
          disabled={!status.active}
          onClick={() => window.__stacks?.trace("stop")}
        >
          Stop
        </button>
        <button
          type="button"
          disabled={!report || status.active}
          onClick={() => report && downloadPerformanceTrace(report)}
        >
          Download JSON
        </button>
        <button
          type="button"
          disabled={!report && !status.active}
          onClick={() => window.__stacks?.trace("reset")}
        >
          Clear
        </button>
      </div>
      {status.active ? (
        <small>
          Recording frame cadence, scene movement, renderer load, physics, React
          commits, long tasks, and resource activity.
        </small>
      ) : report ? (
        <div className="stacks-performance-trace-result">
          <span>
            Settled <strong>{report.summary.settled.frameMs.p95} ms</strong>
          </span>
          <span>
            Travel <strong>{report.summary.travel.frameMs.p95} ms</strong>
          </span>
          <span>
            Ratio{" "}
            <strong>
              {report.summary.travelToSettledP95Ratio?.toFixed(2) ?? "—"}×
            </strong>
          </span>
          <span>
            Spikes <strong>{report.spikes.length}</strong>
          </span>
          <small>
            {strongestSignals || "No correlated spike signals found."}
          </small>
        </div>
      ) : null}
    </details>
  );
}

function QualityDecisionLogControls() {
  const hooksAvailable =
    typeof window !== "undefined" && window.__stacks != null;
  const quality = hooksAvailable
    ? record(window.__stacks?.state().quality)
    : null;
  const transitions = Array.isArray(quality?.transitions)
    ? quality.transitions.length
    : 0;

  return (
    <details className="stacks-diagnostics-details stacks-diagnostics-inline-details">
      <summary>
        Quality decisions · <strong>{transitions} retained</strong>
      </summary>
      <p>
        Download after the measurement. Opening this console stops Auto from
        consuming later frames, but decisions captured before it opened remain
        intact. With `hud=1`, the log also keeps the last four minutes of
        sampled cadence, renderer-resource counts, and focus or page-lifecycle
        events.
      </p>
      <div className="stacks-diagnostics-actions">
        <button
          type="button"
          disabled={!hooksAvailable}
          onClick={() => window.__stacks?.qualityLog("download")}
        >
          Download quality log
        </button>
      </div>
    </details>
  );
}

function DiagnosticsOverview({
  activeSummary,
  stalledFlights,
  visibleFlightCount,
  overlayState,
  physicsSnapshot,
  qualityControls,
  onStartTrace,
  onNavigate,
}: {
  activeSummary: ReturnType<typeof summarizeInsectPerchDiagnostics>;
  stalledFlights: number;
  visibleFlightCount: number;
  overlayState: ReturnType<typeof sceneDiagnosticsRegistry.groupState>;
  physicsSnapshot: ReturnType<typeof physicsDiagnosticsController.getSnapshot>;
  qualityControls: ReturnType<typeof useSceneQualityControls> & {
    runtime: ReturnType<typeof useSceneQualityRuntime>;
  };
  onStartTrace: () => void;
  onNavigate: (panel: DiagnosticsPanel) => void;
}) {
  const runtime = qualityControls.runtime;
  const metrics = runtime?.metrics;
  const renderingReadout = qualityRenderingReadout({
    cinematicPlus: qualityControls.cinematicPlus,
    forcedProfile: runtime?.forcedProfile ?? null,
    pinnedResolutionStep: qualityControls.resolutionStep,
    runtime: runtime
      ? {
          profile: runtime.plan.profile,
          axisResolutionStep: runtime.axes.resolutionStep,
          dpr: runtime.plan.dpr,
          physicalPixels: runtime.plan.physicalPixels,
          effectsTier: runtime.axes.effects,
          contentTier: runtime.axes.content,
        }
      : null,
  });
  const direct = runtime?.fallbackStatus.startsWith("direct") ?? false;
  const failedPhysics = physicsSnapshot.moduleState === "failed";
  const framePressure = Boolean(
    metrics &&
      (metrics.p95 > metrics.targetFrameMs * 1.25 ||
        metrics.droppedFrameRatio > 0.15),
  );
  const needsAttention =
    direct ||
    failedPhysics ||
    framePressure ||
    stalledFlights > 0 ||
    physicsSnapshot.hullFallbacks.length > 0;
  const notices = (
    [
      direct
        ? {
            tone: "danger" as const,
            title: "Direct-render fallback",
            detail: runtime?.fallbackStatus ?? "composer unavailable",
            panel: "render" as const,
          }
        : null,
      failedPhysics
        ? {
            tone: "danger" as const,
            title: "Physics failed",
            detail: physicsSnapshot.lastBlocker ?? "inspect recent events",
            panel: "inspect" as const,
          }
        : null,
      framePressure
        ? {
            tone: "warning" as const,
            title: "Frame pressure",
            detail: `${metrics?.p95.toFixed(1)} ms p95 · ${((metrics?.droppedFrameRatio ?? 0) * 100).toFixed(1)}% dropped`,
            panel: "render" as const,
          }
        : null,
      stalledFlights > 0
        ? {
            tone: "warning" as const,
            title: `${stalledFlights} stalled flight${stalledFlights === 1 ? "" : "s"}`,
            detail: "inspect insect telemetry",
            panel: "inspect" as const,
          }
        : null,
      qualityControls.frozen
        ? {
            tone: "info" as const,
            title: "Auto adaptation frozen",
            detail: "live metrics are still recording",
            panel: "render" as const,
          }
        : null,
      runtime?.plan.customOverrides
        ? {
            tone: "info" as const,
            title: "Custom rendering overrides",
            detail: "profile defaults are not the final plan",
            panel: "render" as const,
          }
        : null,
      physicsSnapshot.hullFallbacks.length > 0
        ? {
            tone: "warning" as const,
            title: `${physicsSnapshot.hullFallbacks.length} hull fallback${physicsSnapshot.hullFallbacks.length === 1 ? "" : "s"}`,
            detail: "inspect physics state",
            panel: "inspect" as const,
          }
        : null,
      overlayState.any
        ? {
            tone: "info" as const,
            title: `${overlayState.enabled}/${overlayState.total} overlays visible`,
            detail: "scene helpers are affecting the view",
            panel: "inspect" as const,
          }
        : null,
    ] satisfies Array<DiagnosticsNotice | null>
  ).filter(isPresent);
  // Share of main-thread cost spent on the world-matrix traversal. Read live
  // rather than sampled: it informs a decision about whether to freeze
  // matrices, and feeds nothing automatic.
  const matrixMs = readSceneMatrixMs();
  const matrixLabel =
    metrics && matrixMs > 0
      ? `${matrixMs.toFixed(2)} ms matrices · ${Math.round(
          (matrixMs / Math.max(metrics.cpuMs, matrixMs)) * 100,
        )}% of main thread`
      : "matrix cost not measured";

  return (
    <div
      id="stacks-diagnostics-panel-overview"
      className="stacks-diagnostics-panel"
      role="tabpanel"
      aria-labelledby="stacks-diagnostics-tab-overview"
    >
      <section
        className="stacks-diagnostics-health"
        data-status={needsAttention ? "attention" : "healthy"}
      >
        <div>
          <span>Scene health</span>
          <strong>{needsAttention ? "Needs attention" : "Healthy"}</strong>
        </div>
        <span>{runtime?.transitionReason ?? "calibrating"}</span>
      </section>

      <section
        className="stacks-diagnostics-notices"
        aria-label="Active signals"
        data-empty={notices.length === 0 || undefined}
      >
        <strong>Active signals</strong>
        {notices.length === 0 ? (
          <span className="stacks-diagnostics-notices-empty">
            No active signals
          </span>
        ) : (
          notices.map((notice) => (
            <button
              key={`${notice.title}:${notice.detail}`}
              type="button"
              data-tone={notice.tone}
              onClick={() => onNavigate(notice.panel)}
            >
              <span>{notice.title}</span>
              <small>{notice.detail}</small>
            </button>
          ))
        )}
      </section>

      <div className="stacks-diagnostics-metrics">
        <article>
          <span>Rendering</span>
          {/* Every rule these three lines follow lives in qualityReadout.ts,
              which is also where they are tested. */}
          <strong>{renderingReadout.mode}</strong>
          <small>{renderingReadout.effective}</small>
          <small>{renderingReadout.plan}</small>
        </article>
        <article>
          <span>Frame signal</span>
          <strong>
            {metrics
              ? `${metrics.p95.toFixed(1)} / ${metrics.targetFrameMs.toFixed(1)} ms`
              : "Calibrating"}
          </strong>
          <small>
            {metrics
              ? `${(metrics.droppedFrameRatio * 100).toFixed(1)}% dropped · ${metrics.targetHz} Hz target`
              : "Waiting for a valid frame window"}
          </small>
          {/* Main-thread cost beside the interval is what separates a
              saturated CPU from a saturated GPU, so both are shown. */}
          <small>
            {metrics
              ? `${metrics.cpuMs.toFixed(1)} ms main thread${
                  metrics.gpuMs == null
                    ? ""
                    : ` · ${metrics.gpuMs.toFixed(1)} ms GPU`
                } · ${CONSTRAINT_LABEL[runtime?.constraint ?? "unknown"]}`
              : "No main-thread cost yet"}
          </small>
          <small>
            {metrics?.p50 == null
              ? "No median yet"
              : `median ${metrics.p50.toFixed(1)} ms · ${matrixLabel}`}
          </small>
        </article>
        <article data-span="full">
          <span>Scene systems</span>
          <div className="stacks-diagnostics-system-grid">
            <span>
              Perches
              <strong>
                {activeSummary.ready + activeSummary.occupied}/
                {activeSummary.total} ready
              </strong>
            </span>
            <span>
              Flights
              <strong>
                {visibleFlightCount} live · {stalledFlights} stalled
              </strong>
            </span>
            <span>
              Physics
              <strong>
                {physicsSnapshot.moduleState} · {physicsSnapshot.bodyCount}{" "}
                bodies
              </strong>
            </span>
          </div>
        </article>
      </div>

      <QualityDecisionLogControls />
      <PerformanceTraceControls onStartCapture={onStartTrace} />
    </div>
  );
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.matches("input, select, textarea, [role='textbox']")
  );
}

export default function SceneDiagnostics({
  initiallyOpen = false,
}: {
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const snapshot = useSyncExternalStore(
    insectDiagnosticsController.subscribe,
    insectDiagnosticsController.getSnapshot,
    insectDiagnosticsController.getSnapshot,
  );
  const physicsSnapshot = useSyncExternalStore(
    physicsDiagnosticsController.subscribe,
    physicsDiagnosticsController.getSnapshot,
    physicsDiagnosticsController.getSnapshot,
  );
  const diagnosticSnapshot = useSyncExternalStore(
    sceneDiagnosticsRegistry.subscribe,
    sceneDiagnosticsRegistry.getSnapshot,
    sceneDiagnosticsRegistry.getSnapshot,
  );
  const qualityControlState = useSceneQualityControls();
  const qualityRuntime = useSceneQualityRuntime(open);
  const qualityControls = {
    ...qualityControlState,
    runtime: qualityRuntime,
  };
  const traceStatus = useSyncExternalStore(
    scenePerformanceTrace.subscribe,
    scenePerformanceTrace.getStatus,
    scenePerformanceTrace.getStatus,
  );
  const meadowSnapshot = useSyncExternalStore(
    meadowDiagnosticsController.subscribe,
    meadowDiagnosticsController.getSnapshot,
    meadowDiagnosticsController.getSnapshot,
  );
  const freeRoamSnapshot = useSyncExternalStore(
    freeRoamDiagnosticsController.subscribe,
    freeRoamDiagnosticsController.getSnapshot,
    freeRoamDiagnosticsController.getSnapshot,
  );
  const activeUnit = useStacks((state) => state.activeUnit);
  const summary = summarizeInsectPerchDiagnostics(snapshot.diagnostics);
  const activeSummary = summarizeInsectPerchDiagnostics(
    snapshot.diagnostics.filter(
      (diagnostic) => diagnostic.unitIndex === activeUnit,
    ),
  );
  const visibleFlights = snapshot.flightStates.filter(
    ({ telemetry }) =>
      snapshot.filter === "all" || telemetry.unitIndex === activeUnit,
  );
  const stalledFlights = visibleFlights.filter(
    ({ telemetry }) => telemetry.stalled,
  ).length;
  const hovered = snapshot.diagnostics.find(
    (diagnostic) => diagnostic.perchId === snapshot.hoveredPerchId,
  );
  const [panel, setPanel] = useState<DiagnosticsPanel>("overview");
  const launcher = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const overlayState = sceneDiagnosticsRegistry.groupState("inspect.overlays");
  const depthOfFieldBokehMultiplier =
    qualityControls.depthOfFieldBokehMultiplier ?? 1;
  const depthOfFieldResolutionScale =
    qualityControls.depthOfFieldResolutionScale ??
    qualityControls.runtime?.plan.effects.depthOfFieldResolutionScale ??
    0.6;

  const setAllOverlays = (enabled: boolean) => {
    sceneDiagnosticsRegistry.setGroup("inspect.overlays", enabled);
  };

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      launcher.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key.toLowerCase() !== "h" ||
        isEditableShortcutTarget(event.target)
      )
        return;
      event.preventDefault();
      if (document.pointerLockElement !== null) document.exitPointerLock();
      if (!open) requestDevHooks();
      if (!open && traceStatus.active) window.__stacks?.trace("stop");
      setOpen((current) => {
        if (current) requestAnimationFrame(() => launcher.current?.focus());
        return !current;
      });
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [open, traceStatus.active]);

  const startPerformanceTrace = () => {
    setOpen(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => window.__stacks?.trace("start")),
    );
  };

  const toggleConsole = () => {
    if (!open) requestDevHooks();
    if (!open && traceStatus.active) window.__stacks?.trace("stop");
    setOpen((current) => !current);
  };

  const resetSceneToFirstVisit = () => {
    if (
      !window.confirm(
        "Clear saved scene state and reload with the default render settings?",
      )
    )
      return;

    clearSceneFirstVisitStorage(
      browserStorage("localStorage"),
      browserStorage("sessionStorage"),
    );
    const cleanUrl = sceneFirstVisitUrl(window.location.href);
    if (cleanUrl === window.location.href) window.location.reload();
    else window.location.replace(cleanUrl);
  };

  const drawer = open ? (
    <section
      id="stacks-scene-diagnostics"
      data-stacks-scrollable
      className="stacks-perch-drawer pointer-events-auto"
      role="dialog"
      aria-modal="false"
      aria-labelledby="stacks-scene-diagnostics-title"
    >
      <header className="stacks-perch-drawer-header">
        <div>
          <strong id="stacks-scene-diagnostics-title">Scene console</strong>
          <span>
            {qualityControls.runtime?.plan.profile ?? "calibrating"} ·{" "}
            {qualityControls.cinematicPlus
              ? "cinematic+"
              : qualityControls.mode}
            {" · "}
            {overlayState.enabled} helpers visible
          </span>
        </div>
        <button
          ref={closeButton}
          type="button"
          aria-label="Close scene diagnostics"
          onClick={() => {
            setOpen(false);
            launcher.current?.focus();
          }}
        >
          <XIcon aria-hidden="true" size={18} weight="bold" />
        </button>
      </header>
      <DiagnosticsTabs active={panel} onChange={setPanel} />
      {panel === "overview" ? (
        <DiagnosticsOverview
          activeSummary={activeSummary}
          stalledFlights={stalledFlights}
          visibleFlightCount={visibleFlights.length}
          overlayState={overlayState}
          physicsSnapshot={physicsSnapshot}
          qualityControls={qualityControls}
          onStartTrace={startPerformanceTrace}
          onNavigate={setPanel}
        />
      ) : null}
      {panel === "simulate" ? (
        <div
          id="stacks-diagnostics-panel-simulate"
          className="stacks-diagnostics-panel"
          role="tabpanel"
          aria-labelledby="stacks-diagnostics-tab-simulate"
        >
          <header className="stacks-diagnostics-panel-heading">
            <strong>Simulation controls</strong>
          </header>
          <DiagnosticRegistrySection
            groupId="simulate.camera"
            snapshot={diagnosticSnapshot}
          >
            <p className="stacks-diagnostics-note">
              Free roam captures the mouse on entry. Look with the mouse, move
              with WASD, use Q/E to move down/up, and hold Shift for one-third
              speed. F resumes or exits free roam, Shift+F starts from the
              current view, H opens debug, and Escape releases the mouse. Click
              the scene to recapture it.
            </p>
          </DiagnosticRegistrySection>

          <DiagnosticRegistrySection
            groupId="simulate.meadow"
            snapshot={diagnosticSnapshot}
          >
            <div className="stacks-diagnostics-actions">
              <button
                type="button"
                disabled={!meadowSnapshot.available}
                onClick={() => meadowDiagnosticsController.reset()}
              >
                Reset wind
              </button>
            </div>
            <details className="stacks-diagnostics-details stacks-diagnostics-inline-details">
              <summary>
                Deformation ·{" "}
                {meadowSnapshot.available
                  ? meadowSnapshot.deformation.active
                    ? "active"
                    : "idle"
                  : "unavailable"}
              </summary>
              <div className="stacks-diagnostics-stat-grid">
                <span>
                  Textures
                  <strong>{meadowSnapshot.deformation.textureCount}</strong>
                </span>
                <span>
                  Stamps
                  <strong>{meadowSnapshot.deformation.acceptedStamps}</strong>
                </span>
                <span>
                  Dropped
                  <strong>{meadowSnapshot.deformation.droppedStamps}</strong>
                </span>
                <span>
                  CPU
                  <strong>
                    {meadowSnapshot.deformation.cpuSubmissionMs.toFixed(2)} ms
                  </strong>
                </span>
              </div>
              <div className="stacks-perch-summary">
                <span>
                  {meadowSnapshot.deformation.outOfBoundsStamps} outside ·{" "}
                  {meadowSnapshot.deformation.recoveryDraws} recovery draws ·
                  reset {meadowSnapshot.deformation.resetRevision}
                </span>
              </div>
            </details>
          </DiagnosticRegistrySection>

          <DiagnosticRegistrySection
            groupId="simulate.insects"
            snapshot={diagnosticSnapshot}
          >
            <div className="stacks-diagnostics-actions">
              <button
                type="button"
                onClick={() =>
                  insectDiagnosticsController.forceLandingAttempt()
                }
              >
                Force landing attempt
              </button>
              {snapshot.forceResult ? (
                <span className="stacks-diagnostics-result">
                  {snapshot.forceResult}
                </span>
              ) : null}
            </div>
          </DiagnosticRegistrySection>

          <DiagnosticRegistrySection
            groupId="simulate.physics"
            snapshot={diagnosticSnapshot}
          />
        </div>
      ) : null}
      {panel === "render" ? (
        <div
          id="stacks-diagnostics-panel-render"
          className="stacks-diagnostics-panel"
          role="tabpanel"
          aria-labelledby="stacks-diagnostics-tab-render"
        >
          <header className="stacks-diagnostics-panel-heading">
            <strong>Scene quality</strong>
          </header>
          <DiagnosticRegistrySection
            groupId="render.quality"
            snapshot={diagnosticSnapshot}
          >
            <div className="stacks-diagnostics-current">
              <span>Now</span>
              <strong>
                {qualityControls.cinematicPlus
                  ? "Cinematic+"
                  : qualityControls.mode === "auto"
                    ? "Auto"
                    : qualityControls.mode}
              </strong>
              <small>
                {qualityControls.runtime
                  ? `Effective ${qualityControls.runtime.plan.profile} · fx ${qualityControls.runtime.axes.effects} · geo ${qualityControls.runtime.axes.content}`
                  : "Waiting for the scene to publish its render plan"}
              </small>
            </div>
          </DiagnosticRegistrySection>

          <DiagnosticRegistrySection
            groupId="render.resolution"
            snapshot={diagnosticSnapshot}
          >
            {qualityControls.runtime?.plan.resolutionCeilingOverridden ? (
              <p className="text-[11px] text-amber-300/80">
                {`Over budget: ${(
                  qualityControls.runtime.plan.physicalPixels / 1_000_000
                ).toFixed(2)} MP against a ${(
                  qualityControls.runtime.plan.pixelBudget / 1_000_000
                ).toFixed(2)} MP budget. This is manual-only; the controller
                will never choose it.`}
              </p>
            ) : null}
            {qualityControls.runtime ? (
              <p className="text-[11px] text-white/50">
                {`DPR ${qualityControls.runtime.plan.dpr.toFixed(2)} · ${(
                  qualityControls.runtime.plan.physicalPixels / 1_000_000
                ).toFixed(2)} MP`}
                {qualityControls.resolutionStep != null ? " · pinned" : ""}
              </p>
            ) : null}
          </DiagnosticRegistrySection>

          <DiagnosticRegistrySection
            groupId="render.automatic"
            snapshot={diagnosticSnapshot}
          >
            <div className="stacks-diagnostics-actions">
              <button
                type="button"
                onClick={() => sceneQualityController.resetLearnedProfile()}
              >
                Reset learned profile
              </button>
              <button type="button" onClick={resetSceneToFirstVisit}>
                Reset scene to first visit
              </button>
            </div>
            <small>
              Clears saved scene quality, warm-load, sound, and session state,
              then reloads without render or diagnostics URL overrides. Theme
              and font preferences are preserved.
            </small>
          </DiagnosticRegistrySection>
          <details className="stacks-diagnostics-details stacks-diagnostics-inline-details">
            <summary>Policy internals</summary>
            {qualityControls.runtime ? (
              <div className="stacks-perch-summary">
                <span>
                  Effective {qualityControls.runtime.plan.profile} · DPR{" "}
                  {qualityControls.runtime.plan.dpr.toFixed(2)} ·{" "}
                  {qualityControls.runtime.plan.physicalPixels.toLocaleString()}{" "}
                  px
                </span>
                <span>
                  Target {qualityControls.runtime.metrics?.targetHz ?? "–"} Hz ·
                  p95 {qualityControls.runtime.metrics?.p95.toFixed(1) ?? "–"}{" "}
                  ms · drops{" "}
                  {qualityControls.runtime.metrics
                    ? `${(qualityControls.runtime.metrics.droppedFrameRatio * 100).toFixed(1)}%`
                    : "–"}
                </span>
                <span>
                  Cooldown{" "}
                  {(
                    qualityControls.runtime.cooldownRemainingMs / 1_000
                  ).toFixed(1)}
                  s{" · "}
                  {qualityControls.runtime.transitionReason} ·{" "}
                  {qualityControls.runtime.fallbackStatus}
                </span>
                <span>
                  Bucket {qualityControls.runtime.storageBucket} · learned{" "}
                  {qualityControls.runtime.learnedProfile ?? "none"}
                </span>
                <span>
                  Bloom{" "}
                  {qualityControls.runtime.plan.effects.bloomResolutionScale.toFixed(
                    2,
                  )}
                  × · AO{" "}
                  {qualityControls.runtime.plan.effects.ambientOcclusionQuality}{" "}
                  · DoF q
                  {qualityControls.runtime.plan.effects.depthOfFieldResolutionScale.toFixed(
                    2,
                  )}
                  /b
                  {qualityControls.runtime.plan.effects.depthOfFieldBokehScale.toFixed(
                    2,
                  )}{" "}
                  · far grass{" "}
                  {qualityControls.runtime.plan.environment.farGrassShader}
                </span>
              </div>
            ) : (
              <small>
                Scene not mounted yet. The canvas publishes this on its first
                frame.
              </small>
            )}
          </details>
          <details className="stacks-diagnostics-details stacks-diagnostics-experiments">
            <summary>
              Rendering experiments ·{" "}
              {qualityControls.runtime?.plan.customOverrides
                ? "custom overrides active"
                : "profile defaults"}
            </summary>
            <div className="stacks-diagnostics-actions">
              <button
                type="button"
                onClick={() =>
                  sceneDiagnosticsRegistry.applyOptimizationPreset("optimized")
                }
                disabled={sceneDiagnosticsRegistry.matchesOptimizationPreset(
                  "optimized",
                )}
              >
                Enable all optimizations
              </button>
              <button
                type="button"
                onClick={() =>
                  sceneDiagnosticsRegistry.applyOptimizationPreset(
                    "unoptimized",
                  )
                }
                disabled={sceneDiagnosticsRegistry.matchesOptimizationPreset(
                  "unoptimized",
                )}
              >
                Disable all optimizations
              </button>
            </div>
            <DiagnosticRegistrySection
              groupId="render.optional"
              snapshot={diagnosticSnapshot}
            />
            <DiagnosticRegistrySection
              groupId="render.optimizations"
              snapshot={diagnosticSnapshot}
            />
            <DiagnosticRegistrySection
              groupId="render.compositing"
              snapshot={diagnosticSnapshot}
              fallbackValues={{
                "render.dof-strength": depthOfFieldBokehMultiplier,
                "render.dof-buffer-quality": depthOfFieldResolutionScale,
              }}
            >
              <div className="stacks-diagnostics-actions">
                <button
                  type="button"
                  disabled={
                    qualityControls.depthOfFieldBokehMultiplier == null &&
                    qualityControls.depthOfFieldResolutionScale == null
                  }
                  onClick={() => sceneQualityController.resetDepthOfField()}
                >
                  Reset DoF tuning
                </button>
              </div>
            </DiagnosticRegistrySection>
            <DiagnosticRegistrySection
              groupId="render.scheduling"
              snapshot={diagnosticSnapshot}
            />
          </details>
        </div>
      ) : null}
      {panel === "inspect" ? (
        <div
          id="stacks-diagnostics-panel-inspect"
          className="stacks-diagnostics-panel"
          role="tabpanel"
          aria-labelledby="stacks-diagnostics-tab-inspect"
        >
          <header className="stacks-diagnostics-panel-heading">
            <strong>Scene inspection</strong>
          </header>

          <DiagnosticSegmentedControl
            id="inspect.scope"
            snapshot={diagnosticSnapshot}
          />

          <DiagnosticRegistrySection
            groupId="inspect.overlays"
            snapshot={diagnosticSnapshot}
            beforeControls={
              <div className="stacks-diagnostics-actions">
                <button
                  type="button"
                  onClick={() => setAllOverlays(true)}
                  disabled={overlayState.all}
                >
                  Show all overlays
                </button>
                <button
                  type="button"
                  onClick={() => setAllOverlays(false)}
                  disabled={!overlayState.any}
                >
                  Hide all overlays
                </button>
              </div>
            }
          />

          <details className="stacks-diagnostics-details">
            <summary>
              Perches · {summary.total} visible · {summary.rejected} rejected
            </summary>
            <div className="stacks-diagnostics-stat-grid">
              <span>
                Ready
                <strong>{summary.ready}</strong>
              </span>
              <span>
                Waiting
                <strong>{summary.waiting}</strong>
              </span>
              <span>
                Occupied
                <strong>{summary.occupied}</strong>
              </span>
              <span>
                Rejected
                <strong>{summary.rejected}</strong>
              </span>
            </div>
            {summary.rejections.length > 0 ? (
              <div className="stacks-perch-summary">
                <dl>
                  {summary.rejections.map(({ code, count }) => (
                    <div key={code}>
                      <dt>{code}</dt>
                      <dd>×{count}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            <details className="stacks-diagnostics-details stacks-diagnostics-inline-details">
              <summary>Overlay legend</summary>
              <div
                className="stacks-perch-legend"
                aria-label="Perch diagnostic marker legend"
              >
                <span>
                  <i data-marker="anchor" /> Authored anchor
                </span>
                <span>
                  <i data-marker="contact" data-disposition="ready" /> Resolved
                  contact
                </span>
                <span>
                  <i data-marker="normal" /> Surface normal
                </span>
                <span>
                  <i data-marker="moth-ring" /> Moth-eligible perch
                </span>
                <span>
                  <i data-marker="status" data-disposition="ready" /> Ready
                </span>
                <span>
                  <i data-marker="status" data-disposition="waiting" /> Waiting
                </span>
                <span>
                  <i data-marker="status" data-disposition="occupied" />
                  Occupied
                </span>
                <span>
                  <i data-marker="status" data-disposition="rejected" />
                  Rejected
                </span>
              </div>
            </details>
            <div className="stacks-perch-list">
              {snapshot.diagnostics.map((diagnostic) => (
                <button
                  key={`${diagnostic.species}:${diagnostic.perchId}`}
                  type="button"
                  onMouseEnter={() =>
                    insectDiagnosticsController.update({
                      hoveredPerchId: diagnostic.perchId,
                    })
                  }
                  onMouseLeave={() =>
                    insectDiagnosticsController.update({ hoveredPerchId: null })
                  }
                  onFocus={() =>
                    insectDiagnosticsController.update({
                      hoveredPerchId: diagnostic.perchId,
                    })
                  }
                  onBlur={() =>
                    insectDiagnosticsController.update({ hoveredPerchId: null })
                  }
                >
                  <span>
                    <span data-disposition={diagnostic.disposition}>●</span>{" "}
                    {diagnostic.perchId} ({diagnostic.species})
                  </span>
                  <span>{diagnostic.rejectionCode}</span>
                </button>
              ))}
            </div>
            {hovered ? (
              <output className="stacks-perch-detail">
                {hovered.species} · {hovered.disposition}
                <br />
                owner {hovered.ownerId ?? "–"} · occupant{" "}
                {hovered.occupantId ?? "–"}
                <br />
                {hovered.rejectionCode}: {hovered.rejectionReason}
              </output>
            ) : null}
          </details>

          <details className="stacks-diagnostics-details">
            <summary>
              Flights · {visibleFlights.length} visible · {stalledFlights}{" "}
              stalled
            </summary>
            <div
              className="stacks-perch-list"
              aria-label="Butterfly flight telemetry"
            >
              {visibleFlights.map(({ telemetry }) => (
                <output
                  key={telemetry.occupantId}
                  data-stalled={telemetry.stalled ? "true" : undefined}
                >
                  <span>
                    {telemetry.occupantId} · {telemetry.phase} ·{" "}
                    {telemetry.region} · {telemetry.speed.toFixed(2)} u/s
                  </span>
                  <span>
                    y {telemetry.altitude.toFixed(2)} · clear{" "}
                    {Number.isFinite(telemetry.clearance)
                      ? telemetry.clearance.toFixed(2)
                      : "∞"}{" "}
                    · edge {telemetry.containment.toFixed(2)} · rev{" "}
                    {telemetry.collisionRevision ?? "–"}
                  </span>
                </output>
              ))}
            </div>
          </details>

          <PhysicsDiagnosticsDetails snapshot={physicsSnapshot} />
        </div>
      ) : null}
    </section>
  ) : null;

  return (
    <>
      {freeRoamSnapshot.enabled ? (
        <div className="stacks-free-roam-hint" role="status">
          Free roam · WASD move · Q/E down/up · Shift ⅓× · H debug · F exit ·
          Shift+F starts here · Esc release
        </div>
      ) : null}
      <div className="stacks-debug-launchers pointer-events-auto">
        <DevPerformanceHud
          expanded={open}
          tracing={traceStatus.active}
          launcher={launcher}
          onToggle={toggleConsole}
        />
        {drawer && typeof document !== "undefined"
          ? createPortal(drawer, document.body)
          : null}
      </div>
    </>
  );
}

function PhysicsDiagnosticsDetails({
  snapshot,
}: {
  snapshot: ReturnType<typeof physicsDiagnosticsController.getSnapshot>;
}) {
  return (
    <details className="stacks-diagnostics-details">
      <summary>
        Physics state · {snapshot.bodyCount} bodies · {snapshot.staticCount}{" "}
        statics
      </summary>
      <div className="stacks-diagnostics-stat-grid">
        <span>
          Module
          <strong>{snapshot.moduleState}</strong>
        </span>
        <span>
          Bodies
          <strong>{snapshot.bodyCount}</strong>
        </span>
        <span>
          Statics
          <strong>{snapshot.staticCount}</strong>
        </span>
        <span>
          Frame
          <strong>{snapshot.timing.frameMs.toFixed(2)} ms</strong>
        </span>
      </div>
      <div className="stacks-perch-summary">
        <span>
          {snapshot.activeWorld ?? "no world"} ·{" "}
          {snapshot.broadphase ?? "no broadphase"} · gravity {snapshot.gravity}
        </span>
        <span>
          Surface {snapshot.authoredSurface ?? snapshot.plane ?? "–"} · revision{" "}
          {snapshot.geometryRevision?.slice(0, 18) ?? "–"}
        </span>
        <span>
          Phase {snapshot.phase ?? "–"} · sleep {snapshot.sleepState ?? "–"}
        </span>
        <span>
          {snapshot.readyHandles.length} ready ·{" "}
          {snapshot.pendingHandles.length} pending · blocker{" "}
          {snapshot.lastBlocker ?? "–"}
        </span>
        <span>
          {snapshot.rootGeometry.length} roots · release{" "}
          {snapshot.requestedReleaseSpeed?.toFixed(2) ?? "–"} →{" "}
          {snapshot.acceptedReleaseSpeed?.toFixed(2) ?? "–"} · reset{" "}
          {snapshot.visibilityResetState ?? "–"}
        </span>
        <span>
          Timing {snapshot.timing.stepMs.toFixed(2)} ms step ·{" "}
          {snapshot.timing.peakMs.toFixed(2)} ms peak
        </span>
        {snapshot.hullFallbacks.length ? (
          <span>
            Hull fallbacks:{" "}
            {snapshot.hullFallbacks
              .map((item) => `${item.handle}:${item.code}`)
              .join(", ")}
          </span>
        ) : null}
      </div>
      <details className="stacks-diagnostics-details stacks-diagnostics-inline-details">
        <summary>Events · {snapshot.events.length}</summary>
        <div className="stacks-perch-list">
          {snapshot.events
            .slice()
            .reverse()
            .map((event, index) => (
              <output key={`${event.at}:${index}`}>
                <span>{event.code}</span>
                <span>{event.handle ?? event.detail ?? "world"}</span>
              </output>
            ))}
        </div>
      </details>
    </details>
  );
}
