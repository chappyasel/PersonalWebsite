"use client";

import { browserStorage } from "../mobile/liveness";
import { cameraDepthDiagnosticsController } from "../scene/cameraDepthDiagnostics";
import { requestDevHooks } from "../scene/devHooks";
import {
  sceneDebugOverlayPatches,
  sceneDebugOverlayState,
} from "../scene/diagnosticsOverlayControls";
import {
  insectDiagnosticsController,
  summarizeInsectPerchDiagnostics,
} from "../scene/insectPerchDiagnostic";
import { meadowDiagnosticsController } from "../scene/meadowDiagnostics";
import { MEADOW_WIND } from "../scene/meadowMotion";
import {
  downloadPerformanceTrace,
  scenePerformanceTrace,
} from "../scene/performanceTrace";
import { physicsDiagnosticsController } from "../scene/physicsDiagnostics";
import {
  DEPTH_OF_FIELD_BOKEH_MULTIPLIER_MAX,
  DEPTH_OF_FIELD_BOKEH_MULTIPLIER_MIN,
  DEPTH_OF_FIELD_RESOLUTION_SCALE_MAX,
  DEPTH_OF_FIELD_RESOLUTION_SCALE_MIN,
} from "../scene/quality";
import {
  clearSceneFirstVisitStorage,
  sceneFirstVisitUrl,
} from "../scene/sceneFirstVisitReset";
import { readSceneMatrixMs } from "../scene/sceneFrameCost";
import {
  allScenePerformanceSettings,
  scenePerformanceController,
  scenePerformanceSettingsEqual,
} from "../scene/scenePerformance";
import {
  sceneQualityController,
  useSceneQualityControls,
} from "../scene/sceneQualityController";
import { useStacks } from "../store";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import "./SceneDiagnostics.module.css";
import { type DevHudInput, createDevHudRows } from "./devHudPresentation";

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
  fps: 0,
  profile: null,
  mode: null,
  moving: null,
  frozen: null,
  customOverrides: null,
  fallbackStatus: null,
  p95: null,
  targetFrameMs: null,
  droppedFrameRatio: null,
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
  calls: null,
  triangles: null,
  textures: null,
  programs: null,
};

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function rendererSnapshot(): Omit<DevHudSnapshot, "fps"> {
  const state = window.__stacks?.state();
  const quality = record(state?.quality);
  const metrics = record(quality?.metrics);
  const plan = record(quality?.plan);
  const effects = record(plan?.effects);
  return {
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
    calls: numeric(state?.calls),
    triangles: numeric(state?.triangles),
    textures: numeric(state?.textures),
    programs: numeric(state?.programs),
  };
}

/** A live, self-contained development readout. It deliberately samples RAF
 * cadence rather than the opt-in performance harness, so it remains useful
 * while visually inspecting ordinary navigation. */
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
  const samples = useRef<number[]>([]);

  useEffect(() => {
    let animationFrame = 0;
    let previousFrame = performance.now();
    let lastPublish = previousFrame;

    const frame = (now: number) => {
      const elapsed = now - previousFrame;
      previousFrame = now;
      // Ignore long background-tab pauses; they describe visibility, not the
      // scene's steady rendering performance.
      if (elapsed > 0 && elapsed < 1_000) {
        samples.current.push(elapsed);
        if (samples.current.length > 240) samples.current.shift();
      }

      if (now - lastPublish >= 500) {
        const frameTimes = samples.current;
        const mean =
          frameTimes.reduce((total, value) => total + value, 0) /
          Math.max(1, frameTimes.length);
        setSnapshot({
          fps: mean > 0 ? 1_000 / mean : 0,
          ...rendererSnapshot(),
        });
        lastPublish = now;
      }
      animationFrame = requestAnimationFrame(frame);
    };

    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const rows = createDevHudRows(snapshot);

  return (
    <button
      ref={launcher}
      type="button"
      className="stacks-dev-hud"
      aria-label="Open scene debug console"
      aria-keyshortcuts="d"
      aria-expanded={expanded}
      aria-controls="stacks-scene-diagnostics"
      aria-haspopup="dialog"
      data-tracing={tracing || undefined}
      title={
        tracing
          ? "Performance trace recording · press D to stop and review"
          : "Scene debug · press D · FPS, policy, effects, and renderer load"
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
        Start closes this console. Pause, pan across a few shelves, then press D
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
  overlayState: ReturnType<typeof sceneDebugOverlayState>;
  physicsSnapshot: ReturnType<typeof physicsDiagnosticsController.getSnapshot>;
  qualityControls: ReturnType<typeof useSceneQualityControls>;
  onStartTrace: () => void;
  onNavigate: (panel: DiagnosticsPanel) => void;
}) {
  const runtime = qualityControls.runtime;
  const metrics = runtime?.metrics;
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

      {notices.length > 0 ? (
        <section
          className="stacks-diagnostics-notices"
          aria-label="Active signals"
        >
          <strong>Active signals</strong>
          {notices.map((notice) => (
            <button
              key={`${notice.title}:${notice.detail}`}
              type="button"
              data-tone={notice.tone}
              onClick={() => onNavigate(notice.panel)}
            >
              <span>{notice.title}</span>
              <small>{notice.detail}</small>
            </button>
          ))}
        </section>
      ) : null}

      <div className="stacks-diagnostics-metrics">
        <article>
          <span>Rendering</span>
          {/* In automatic mode the scene does not stand at a preset, so a
              preset name here would misdescribe an independent axis state.
              A forced preset shows its name and the axes it resolved to. */}
          {/* Never collapse to a bare "Waiting": the profile name is known
              from the control store before the canvas has published anything,
              and hiding it makes a booting scene look like a broken one. */}
          {/* Report the step the frame was RENDERED at, not the one the axis
              controller is holding. Pinning a step leaves the controller
              adapting underneath, so those two disagree exactly when someone
              is watching to see whether their pin took effect — which is the
              worst possible moment for the panel to describe the wrong one.
              A pinned step says so, since an unmarked number that ignores the
              control beside it reads as a broken control. */}
          <strong>
            {qualityControls.cinematicPlus
              ? "Cinematic+ · manual"
              : runtime?.forcedProfile
                ? `${runtime.forcedProfile} · manual`
                : "Auto · adapting"}
          </strong>
          <small>
            {runtime
              ? `Effective ${runtime.plan.profile} · res ${
                  qualityControls.resolutionStep ?? runtime.axes.resolutionStep
                }/11${qualityControls.resolutionStep != null ? " pinned" : ""}`
              : "no frame published yet"}
          </small>
          <small>
            {runtime
              ? `DPR ${runtime.plan.dpr.toFixed(2)} · ${(
                  runtime.plan.physicalPixels / 1_000_000
                ).toFixed(
                  1,
                )} MP · fx ${runtime.axes.effects} · geo ${runtime.axes.content}`
              : "Resolving render plan"}
          </small>
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
  const performanceSettings = useSyncExternalStore(
    scenePerformanceController.subscribe,
    scenePerformanceController.getSnapshot,
    scenePerformanceController.getSnapshot,
  );
  const qualityControls = useSceneQualityControls();
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
  const cameraDepthSnapshot = useSyncExternalStore(
    cameraDepthDiagnosticsController.subscribe,
    cameraDepthDiagnosticsController.getSnapshot,
    cameraDepthDiagnosticsController.getSnapshot,
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
  const [open, setOpen] = useState(initiallyOpen);
  const [panel, setPanel] = useState<DiagnosticsPanel>("overview");
  const launcher = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const overlayState = sceneDebugOverlayState(snapshot, physicsSnapshot);
  const allOptimized = allScenePerformanceSettings(true);
  const allUnoptimized = allScenePerformanceSettings(false);
  const depthOfFieldBokehMultiplier =
    qualityControls.depthOfFieldBokehMultiplier ?? 1;
  const depthOfFieldResolutionScale =
    qualityControls.depthOfFieldResolutionScale ??
    qualityControls.runtime?.plan.effects.depthOfFieldResolutionScale ??
    0.6;

  const setAllOverlays = (enabled: boolean) => {
    const patches = sceneDebugOverlayPatches(enabled);
    insectDiagnosticsController.update(patches.perches);
    physicsDiagnosticsController.update(patches.physics);
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
        event.key.toLowerCase() !== "d" ||
        isEditableShortcutTarget(event.target)
      )
        return;
      event.preventDefault();
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
          Close
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
          <fieldset className="stacks-diagnostics-section">
            <legend>Camera</legend>
            <label className="stacks-diagnostics-control">
              <input
                type="checkbox"
                checked={cameraDepthSnapshot.enabled}
                onChange={(event) =>
                  cameraDepthDiagnosticsController.setEnabled(
                    event.currentTarget.checked,
                  )
                }
              />{" "}
              Authored camera depth
            </label>
          </fieldset>

          <fieldset className="stacks-diagnostics-section">
            <legend>Meadow wind</legend>
            <label
              className="stacks-diagnostics-range"
              htmlFor="stacks-wind-strength"
            >
              <span>Base strength</span>
              <output htmlFor="stacks-wind-strength">
                {meadowSnapshot.wind.toFixed(2)}
              </output>
              <input
                id="stacks-wind-strength"
                type="range"
                min="0"
                max="0.3"
                step="0.01"
                value={meadowSnapshot.wind}
                disabled={!meadowSnapshot.available}
                onChange={(event) =>
                  meadowDiagnosticsController.update({
                    wind: event.currentTarget.valueAsNumber,
                  })
                }
              />
            </label>
            <label
              className="stacks-diagnostics-range"
              htmlFor="stacks-wind-live"
            >
              <span>Live gust</span>
              <output htmlFor="stacks-wind-live">
                {meadowSnapshot.liveWind.toFixed(3)}
              </output>
              <input
                id="stacks-wind-live"
                type="range"
                min="0"
                max={MEADOW_WIND.gustCeiling}
                step="0.001"
                value={meadowSnapshot.liveWind}
                disabled
              />
            </label>
            <label
              className="stacks-diagnostics-range"
              htmlFor="stacks-wind-speed"
            >
              <span>Animation speed</span>
              <output htmlFor="stacks-wind-speed">
                {meadowSnapshot.speed.toFixed(2)}×
              </output>
              <input
                id="stacks-wind-speed"
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={meadowSnapshot.speed}
                disabled={!meadowSnapshot.available}
                onChange={(event) =>
                  meadowDiagnosticsController.update({
                    speed: event.currentTarget.valueAsNumber,
                  })
                }
              />
            </label>
            <label className="stacks-diagnostics-control">
              <input
                id="stacks-grass-deformation"
                type="checkbox"
                checked={meadowSnapshot.deformationEnabled}
                disabled={!meadowSnapshot.available}
                onChange={(event) =>
                  meadowDiagnosticsController.update({
                    deformationEnabled: event.currentTarget.checked,
                  })
                }
              />{" "}
              Persistent grass deformation
            </label>
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
          </fieldset>

          <fieldset className="stacks-diagnostics-section">
            <legend>Insect behavior</legend>
            <label className="stacks-diagnostics-control">
              <input
                type="checkbox"
                checked={snapshot.pauseAutomaticLandings}
                onChange={(event) =>
                  insectDiagnosticsController.update({
                    pauseAutomaticLandings: event.currentTarget.checked,
                  })
                }
              />{" "}
              Pause automatic landings
            </label>
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
          </fieldset>

          <fieldset className="stacks-diagnostics-section">
            <legend>Physics runtime</legend>
            <div className="stacks-diagnostics-option-groups">
              <div className="stacks-diagnostics-option-group">
                <strong>Motion</strong>
                <label>
                  <input
                    type="checkbox"
                    checked={physicsSnapshot.runtime.simulation}
                    onChange={(event) =>
                      physicsDiagnosticsController.update({
                        runtime: {
                          ...physicsSnapshot.runtime,
                          simulation: event.currentTarget.checked,
                        },
                      })
                    }
                  />{" "}
                  Step free-body simulation
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={physicsSnapshot.runtime.visibilityResets}
                    onChange={(event) =>
                      physicsDiagnosticsController.update({
                        runtime: {
                          ...physicsSnapshot.runtime,
                          visibilityResets: event.currentTarget.checked,
                        },
                      })
                    }
                  />{" "}
                  Run off-screen resets
                </label>
              </div>
              <div className="stacks-diagnostics-option-group">
                <strong>Collision</strong>
                <label>
                  <input
                    type="checkbox"
                    checked={physicsSnapshot.runtime.heldCollisionProbes}
                    onChange={(event) =>
                      physicsDiagnosticsController.update({
                        runtime: {
                          ...physicsSnapshot.runtime,
                          heldCollisionProbes: event.currentTarget.checked,
                        },
                      })
                    }
                  />{" "}
                  Probe held collisions
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={physicsSnapshot.runtime.generatedStatics}
                    onChange={(event) =>
                      physicsDiagnosticsController.update({
                        runtime: {
                          ...physicsSnapshot.runtime,
                          generatedStatics: event.currentTarget.checked,
                        },
                      })
                    }
                  />{" "}
                  Use generated scene statics
                </label>
              </div>
            </div>
          </fieldset>
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
          <fieldset className="stacks-diagnostics-section">
            <legend>Quality mode</legend>
            <label className="stacks-diagnostics-control">
              Mode
              <select
                className="ml-auto rounded border border-white/15 bg-black/40 px-1.5 py-1 text-white"
                value={
                  qualityControls.cinematicPlus
                    ? "cinematic+"
                    : qualityControls.mode
                }
                onChange={(event) =>
                  sceneQualityController.setMode(
                    event.currentTarget.value as
                      | "auto"
                      | "cinematic"
                      | "cinematic+"
                      | "showcase"
                      | "balanced"
                      | "efficient"
                      | "safety",
                  )
                }
              >
                <optgroup label="Manual only">
                  <option value="cinematic+">Cinematic+</option>
                  <option value="cinematic">Cinematic</option>
                </optgroup>
                <optgroup label="Adaptive range">
                  <option value="auto">Auto</option>
                  <option value="showcase">Showcase</option>
                  <option value="balanced">Balanced</option>
                  <option value="efficient">Efficient</option>
                  <option value="safety">Safety</option>
                </optgroup>
              </select>
            </label>
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
          </fieldset>

          <fieldset className="stacks-diagnostics-section">
            <legend>Resolution</legend>
            {/* Resolution is a twelve-step ladder now, and the preset only
                sets its ceiling. Pinning a step is the only way to compare
                two render scales without waiting for the ladder to walk
                between them. Auto hands it back to the controller. */}
            <label className="stacks-diagnostics-control">
              Render scale
              <select
                className="ml-auto rounded border border-white/15 bg-black/40 px-1.5 py-1 text-white"
                value={qualityControls.resolutionStep ?? "auto"}
                onChange={(event) =>
                  sceneQualityController.setResolutionStep(
                    event.currentTarget.value === "auto"
                      ? null
                      : Number(event.currentTarget.value),
                  )
                }
              >
                <option value="auto">
                  Auto
                  {qualityControls.runtime
                    ? ` (step ${qualityControls.runtime.axes.resolutionStep})`
                    : ""}
                </option>
                {Array.from({ length: 12 }, (_, step) => (
                  <option key={step} value={step}>
                    {`step ${step}${step === 0 ? " · floor" : step === 11 ? " · cap" : ""}`}
                  </option>
                ))}
              </select>
            </label>
            {/* The pixel budget is the AUTOMATIC controller's constraint, and
                on a large window it binds well below the display's density —
                5.2 MP over a 1940x1021 window caps the ladder at DPR 1.62, so
                no preset there can show what 3x looks like. This replaces the
                budget rather than raising it: nothing automatic ever sets it,
                and the readout below says when a frame is outside the
                envelope the controller would choose for itself. */}
            <label className="stacks-diagnostics-control">
              Scale ceiling
              <select
                className="ml-auto rounded border border-white/15 bg-black/40 px-1.5 py-1 text-white"
                value={qualityControls.resolutionCeiling ?? "auto"}
                onChange={(event) =>
                  sceneQualityController.setResolutionCeiling(
                    event.currentTarget.value === "auto"
                      ? null
                      : Number(event.currentTarget.value),
                  )
                }
              >
                <option value="auto">Auto (pixel budget)</option>
                {[1, 1.5, 2, 2.5, 3, 4].map((dpr) => (
                  <option key={dpr} value={dpr}>
                    {`${dpr}x${
                      typeof window !== "undefined" &&
                      dpr === window.devicePixelRatio
                        ? " · this display"
                        : ""
                    }`}
                  </option>
                ))}
              </select>
            </label>
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
          </fieldset>

          <fieldset
            className="stacks-diagnostics-section"
            data-disabled={qualityControls.mode !== "auto" || undefined}
          >
            <legend>Automatic adaptation</legend>
            <label>
              <input
                type="checkbox"
                checked={qualityControls.frozen}
                disabled={qualityControls.mode !== "auto"}
                onChange={(event) =>
                  sceneQualityController.setFrozen(event.currentTarget.checked)
                }
              />{" "}
              Freeze Auto adaptation
            </label>
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
          </fieldset>
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
            <fieldset className="stacks-diagnostics-section">
              <legend>Overrides</legend>
              <div className="stacks-diagnostics-actions">
                <button
                  type="button"
                  onClick={() =>
                    scenePerformanceController.replace(
                      allScenePerformanceSettings(true),
                    )
                  }
                  disabled={scenePerformanceSettingsEqual(
                    performanceSettings,
                    allOptimized,
                  )}
                >
                  Enable all optimizations
                </button>
                <button
                  type="button"
                  onClick={() =>
                    scenePerformanceController.replace(
                      allScenePerformanceSettings(false),
                    )
                  }
                  disabled={scenePerformanceSettingsEqual(
                    performanceSettings,
                    allUnoptimized,
                  )}
                >
                  Disable all optimizations
                </button>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={performanceSettings.suspendSettledPropWork}
                  onChange={(event) =>
                    scenePerformanceController.update({
                      suspendSettledPropWork: event.currentTarget.checked,
                    })
                  }
                />{" "}
                Suspend settled distant props
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={performanceSettings.pausePrewarmDuringTravel}
                  onChange={(event) =>
                    scenePerformanceController.update({
                      pausePrewarmDuringTravel: event.currentTarget.checked,
                    })
                  }
                />{" "}
                Pause prewarming during travel
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={performanceSettings.activeNeighborhoodLights}
                  onChange={(event) =>
                    scenePerformanceController.update({
                      activeNeighborhoodLights: event.currentTarget.checked,
                    })
                  }
                />{" "}
                Limit real lights to nearby shelves
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={
                    qualityControls.runtime?.plan.environment.farGrassShader ===
                    "simplified"
                  }
                  onChange={(event) =>
                    scenePerformanceController.update({
                      simplifiedFarMeadow: event.currentTarget.checked,
                    })
                  }
                />{" "}
                Simplify far-grass shader
              </label>
              <strong className="stacks-diagnostics-subhead">
                Compositing
              </strong>
              <label>
                Practical glow
                <select
                  className="ml-auto rounded border border-white/15 bg-black/40 px-1.5 py-1 text-white"
                  value={performanceSettings.practicalGlowMode}
                  onChange={(event) =>
                    scenePerformanceController.update({
                      practicalGlowMode: event.currentTarget.value as
                        | "aperture"
                        | "halo"
                        | "sprite",
                    })
                  }
                >
                  <option value="halo">Analytic halo</option>
                  <option value="aperture">Aperture only</option>
                  <option value="sprite">Legacy sprites</option>
                </select>
              </label>
              <label>
                Placard material
                <select
                  className="ml-auto rounded border border-white/15 bg-black/40 px-1.5 py-1 text-white"
                  value={performanceSettings.placardGlassMode}
                  onChange={(event) =>
                    scenePerformanceController.update({
                      placardGlassMode: event.currentTarget.value as
                        | "auto"
                        | "native"
                        | "paper",
                    })
                  }
                >
                  <option value="auto">Auto (paper touch)</option>
                  <option value="paper">Opaque paper</option>
                  <option value="native">Native live blur</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={performanceSettings.effectiveDprLadder}
                  onChange={(event) =>
                    scenePerformanceController.update({
                      effectiveDprLadder: event.currentTarget.checked,
                    })
                  }
                />{" "}
                Use effective DPR rungs
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={performanceSettings.adaptiveSharpen}
                  onChange={(event) =>
                    scenePerformanceController.update({
                      adaptiveSharpen: event.currentTarget.checked,
                    })
                  }
                />{" "}
                Sharpen reduced-DPR output
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={performanceSettings.skipAmbientOcclusion}
                  onChange={(event) =>
                    scenePerformanceController.update({
                      skipAmbientOcclusion: event.currentTarget.checked,
                    })
                  }
                />{" "}
                Skip ambient occlusion
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={performanceSettings.skipBloom}
                  onChange={(event) =>
                    scenePerformanceController.update({
                      skipBloom: event.currentTarget.checked,
                    })
                  }
                />{" "}
                Skip bloom
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={performanceSettings.skipDepthOfField}
                  onChange={(event) =>
                    scenePerformanceController.update({
                      skipDepthOfField: event.currentTarget.checked,
                    })
                  }
                />{" "}
                Skip depth of field
              </label>
              <label
                className="stacks-diagnostics-range"
                htmlFor="stacks-dof-strength"
              >
                <span>DoF strength</span>
                <output htmlFor="stacks-dof-strength">
                  {depthOfFieldBokehMultiplier.toFixed(2)}×
                </output>
                <input
                  id="stacks-dof-strength"
                  type="range"
                  min={DEPTH_OF_FIELD_BOKEH_MULTIPLIER_MIN}
                  max={DEPTH_OF_FIELD_BOKEH_MULTIPLIER_MAX}
                  step="0.05"
                  value={depthOfFieldBokehMultiplier}
                  disabled={performanceSettings.skipDepthOfField}
                  onChange={(event) =>
                    sceneQualityController.setDepthOfFieldBokehMultiplier(
                      event.currentTarget.valueAsNumber,
                    )
                  }
                />
              </label>
              <label
                className="stacks-diagnostics-range"
                htmlFor="stacks-dof-quality"
              >
                <span>DoF buffer quality</span>
                <output htmlFor="stacks-dof-quality">
                  {depthOfFieldResolutionScale.toFixed(2)}×
                </output>
                <input
                  id="stacks-dof-quality"
                  type="range"
                  min={DEPTH_OF_FIELD_RESOLUTION_SCALE_MIN}
                  max={DEPTH_OF_FIELD_RESOLUTION_SCALE_MAX}
                  step="0.05"
                  value={depthOfFieldResolutionScale}
                  disabled={performanceSettings.skipDepthOfField}
                  onChange={(event) =>
                    sceneQualityController.setDepthOfFieldResolutionScale(
                      event.currentTarget.valueAsNumber,
                    )
                  }
                />
              </label>
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
              <strong className="stacks-diagnostics-subhead">Scheduling</strong>
              <label>
                <input
                  type="checkbox"
                  checked={performanceSettings.virtualizeUnitWork}
                  onChange={(event) =>
                    scenePerformanceController.update({
                      virtualizeUnitWork: event.currentTarget.checked,
                    })
                  }
                />{" "}
                Virtualize distant unit work
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={performanceSettings.rememberTravelDeclines}
                  onChange={(event) =>
                    scenePerformanceController.update({
                      rememberTravelDeclines: event.currentTarget.checked,
                    })
                  }
                />{" "}
                Remember slow travel frames
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={performanceSettings.populationBalancedMeadowTiles}
                  onChange={(event) =>
                    scenePerformanceController.update({
                      populationBalancedMeadowTiles:
                        event.currentTarget.checked,
                    })
                  }
                />{" "}
                Balance dense meadow tiles
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={performanceSettings.suspendSettledHoverWork}
                  onChange={(event) =>
                    scenePerformanceController.update({
                      suspendSettledHoverWork: event.currentTarget.checked,
                    })
                  }
                />{" "}
                Suspend settled hover work
              </label>
            </fieldset>
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

          <div className="stacks-diagnostics-toolbar">
            <span>Scope</span>
            <div
              className="stacks-diagnostics-segmented"
              role="group"
              aria-label="Inspection scope"
            >
              <button
                type="button"
                onClick={() =>
                  insectDiagnosticsController.update({ filter: "active" })
                }
                aria-pressed={snapshot.filter === "active"}
              >
                Active shelf
              </button>
              <button
                type="button"
                onClick={() =>
                  insectDiagnosticsController.update({ filter: "all" })
                }
                aria-pressed={snapshot.filter === "all"}
              >
                All shelves
              </button>
            </div>
          </div>

          <fieldset className="stacks-diagnostics-section">
            <legend>Scene overlays</legend>
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
            <div className="stacks-diagnostics-option-groups">
              <div className="stacks-diagnostics-option-group" data-span="full">
                <strong>Perches and butterflies</strong>
                <label>
                  <input
                    type="checkbox"
                    checked={snapshot.showEnvelopes}
                    onChange={(event) =>
                      insectDiagnosticsController.update({
                        showEnvelopes: event.currentTarget.checked,
                      })
                    }
                  />{" "}
                  Markers and wing envelopes
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={snapshot.showRoutes}
                    onChange={(event) =>
                      insectDiagnosticsController.update({
                        showRoutes: event.currentTarget.checked,
                      })
                    }
                  />{" "}
                  Approach and departure routes
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={snapshot.showFlightVolumes}
                    onChange={(event) =>
                      insectDiagnosticsController.update({
                        showFlightVolumes: event.currentTarget.checked,
                      })
                    }
                  />{" "}
                  Flight volumes
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={snapshot.showFlightTrails}
                    onChange={(event) =>
                      insectDiagnosticsController.update({
                        showFlightTrails: event.currentTarget.checked,
                      })
                    }
                  />{" "}
                  Flight trails · 30 s
                </label>
              </div>
              <div className="stacks-diagnostics-option-group">
                <strong>Moths</strong>
                <label>
                  <input
                    type="checkbox"
                    checked={snapshot.showLampCones}
                    onChange={(event) =>
                      insectDiagnosticsController.update({
                        showLampCones: event.currentTarget.checked,
                      })
                    }
                  />{" "}
                  Lamp cones
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={snapshot.showMothTrails}
                    onChange={(event) =>
                      insectDiagnosticsController.update({
                        showMothTrails: event.currentTarget.checked,
                      })
                    }
                  />{" "}
                  Flight trails · 30 s
                </label>
              </div>
              <div className="stacks-diagnostics-option-group">
                <strong>Physics</strong>
                <label>
                  <input
                    type="checkbox"
                    checked={physicsSnapshot.showHelpers}
                    onChange={(event) =>
                      physicsDiagnosticsController.update({
                        showHelpers: event.currentTarget.checked,
                      })
                    }
                  />{" "}
                  Hulls, poses, vectors, and contacts
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={physicsSnapshot.showAllBounds}
                    onChange={(event) =>
                      physicsDiagnosticsController.update({
                        showAllBounds: event.currentTarget.checked,
                      })
                    }
                  />{" "}
                  Prop collider boxes
                </label>
              </div>
            </div>
          </fieldset>

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
