"use client";

import { cameraDepthDiagnosticsController } from "../scene/cameraDepthDiagnostics";
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
  allScenePerformanceSettings,
  scenePerformanceController,
  scenePerformanceSettingsEqual,
} from "../scene/scenePerformance";
import {
  sceneQualityController,
  useSceneQualityControls,
} from "../scene/sceneQualityController";

/** Plain words for the constraint, because "cpu"/"gpu" alone reads as a
 * category rather than as a verdict about this window. */
const CONSTRAINT_LABEL = {
  cpu: "CPU bound",
  gpu: "GPU bound",
  headroom: "headroom",
  unknown: "no verdict",
} as const;
import { useStacks } from "../store";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { type DevHudInput, createDevHudRows } from "./devHudPresentation";

const DIAGNOSTICS_STYLES = String.raw`.stacks-dev-hud {
                position: relative;
                box-sizing: border-box;
                display: grid;
                gap: 1px;
                inline-size: 240px;
                min-inline-size: 240px;
                max-inline-size: 240px;
                padding: 5px 19px 5px 7px;
                border: 1px solid rgb(255 255 255 / 0.16);
                border-radius: 5px;
                appearance: none;
                color: rgb(255 255 255 / 0.88);
                background: rgb(4 10 18 / 0.42);
                box-shadow: 0 1px 5px rgb(0 0 0 / 0.24);
                cursor: pointer;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: 8px;
                font-variant-numeric: tabular-nums;
                font-weight: 500;
                letter-spacing: -0.01em;
                line-height: 1.12;
                text-align: left;
                text-shadow: 0 1px 2px rgb(0 0 0 / 0.75);
                white-space: nowrap;
                backdrop-filter: blur(4px);
              }
              .stacks-dev-hud:hover,
              .stacks-dev-hud:focus-visible,
              .stacks-dev-hud[aria-expanded="true"] {
                border-color: rgb(125 220 255 / 0.38);
                background: rgb(4 10 18 / 0.68);
              }
              .stacks-dev-hud:focus-visible {
                outline: 1px solid rgb(125 220 255 / 0.58);
                outline-offset: 2px;
              }
              .stacks-dev-hud::after {
                position: absolute;
                top: 4px;
                right: 5px;
                display: grid;
                width: 11px;
                height: 11px;
                place-items: center;
                border: 1px solid rgb(255 255 255 / 0.18);
                border-radius: 2px;
                color: rgb(255 255 255 / 0.48);
                content: "D";
                font-size: 7px;
                line-height: 1;
                text-shadow: none;
              }
              .stacks-dev-hud > [data-row] {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              .stacks-dev-hud [data-emphasis="true"] { font-weight: 750; }
              .stacks-dev-hud [data-tone="muted"] { color: rgb(255 255 255 / 0.46); }
              .stacks-dev-hud [data-tone="accent"] { color: #7ddcff; }
              .stacks-dev-hud [data-tone="positive"] { color: #66e3a1; }
              .stacks-dev-hud [data-tone="warning"] { color: #f0bd4f; }
              .stacks-dev-hud [data-tone="danger"] { color: #ff7e87; }
              .stacks-dev-hud[data-tracing="true"] {
                border-color: rgb(125 220 255 / 0.5);
                box-shadow:
                  inset 0 0 0 1px rgb(125 220 255 / 0.12),
                  0 0 14px rgb(125 220 255 / 0.13);
              }
              .stacks-debug-launchers {
                display: flex;
                align-items: flex-start;
                gap: 3px;
              }
              .stacks-perch-drawer {
                position: fixed;
                z-index: 1000;
                top: max(12px, env(safe-area-inset-top, 0px));
                right: max(12px, env(safe-area-inset-right, 0px));
                display: grid;
                width: min(460px, calc(100vw - 24px));
                max-height: calc(100dvh - max(24px, env(safe-area-inset-top, 0px) + 12px));
                gap: 5px;
                padding: 10px;
                overflow: auto;
                border: 1px solid rgb(255 255 255 / 0.18);
                border-radius: 8px;
                color: rgb(255 255 255 / 0.92);
                background: rgb(4 10 18 / 0.96);
                box-shadow: 0 12px 42px rgb(0 0 0 / 0.52);
                font: 500 10px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
                overscroll-behavior: contain;
              }
              .stacks-perch-drawer-header {
                display: flex;
                align-items: start;
                justify-content: space-between;
                gap: 12px;
                padding-bottom: 7px;
                border-bottom: 1px solid rgb(255 255 255 / 0.14);
              }
              .stacks-perch-drawer-header > div { display: grid; gap: 2px; }
              .stacks-perch-drawer-header strong { font-size: 12px; }
              .stacks-perch-drawer button { text-align: left; }
              .stacks-perch-drawer button[aria-pressed="true"] { color: #66e3a1; }
              .stacks-diagnostics-tabs {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 3px;
                padding: 3px;
                border: 1px solid rgb(255 255 255 / 0.1);
                border-radius: 6px;
                background: rgb(255 255 255 / 0.025);
              }
              .stacks-diagnostics-tabs button {
                padding: 5px 4px;
                border-radius: 4px;
                color: rgb(255 255 255 / 0.58);
                text-align: center;
              }
              .stacks-diagnostics-tabs button[aria-selected="true"] {
                color: rgb(255 255 255 / 0.96);
                background: rgb(255 255 255 / 0.1);
                box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08);
              }
              .stacks-diagnostics-panel {
                display: grid;
                min-width: 0;
                gap: 6px;
              }
              .stacks-diagnostics-health {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 9px 10px;
                border: 1px solid rgb(102 227 161 / 0.2);
                border-radius: 6px;
                background: rgb(102 227 161 / 0.055);
              }
              .stacks-diagnostics-health[data-status="attention"] {
                border-color: rgb(255 126 135 / 0.24);
                background: rgb(255 89 100 / 0.065);
              }
              .stacks-diagnostics-health > div { display: grid; gap: 1px; }
              .stacks-diagnostics-health > div > span,
              .stacks-diagnostics-metrics article > span,
              .stacks-diagnostics-notices > strong {
                color: rgb(255 255 255 / 0.5);
                font-size: 8px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
              }
              .stacks-diagnostics-health > div > strong { font-size: 13px; }
              .stacks-diagnostics-health > span {
                padding: 2px 5px;
                border-radius: 999px;
                color: rgb(255 255 255 / 0.7);
                background: rgb(255 255 255 / 0.07);
              }
              .stacks-diagnostics-metrics {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 5px;
              }
              .stacks-diagnostics-metrics article {
                display: grid;
                min-width: 0;
                gap: 3px;
                padding: 8px;
                border: 1px solid rgb(255 255 255 / 0.1);
                border-radius: 5px;
                background: rgb(255 255 255 / 0.025);
              }
              .stacks-diagnostics-metrics article:last-child {
                grid-column: 1 / -1;
                grid-template-columns: 1fr auto;
              }
              .stacks-diagnostics-metrics article:last-child > span,
              .stacks-diagnostics-metrics article:last-child > strong {
                grid-column: 1 / -1;
              }
              .stacks-diagnostics-metrics article > strong {
                overflow: hidden;
                font-size: 11px;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .stacks-diagnostics-metrics article > small {
                overflow: hidden;
                color: rgb(255 255 255 / 0.64);
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .stacks-diagnostics-notices {
                display: grid;
                gap: 3px;
                padding: 8px;
                border: 1px solid rgb(255 255 255 / 0.1);
                border-radius: 5px;
                background: rgb(255 255 255 / 0.025);
              }
              .stacks-diagnostics-notices > p {
                margin: 1px 0 0;
                color: rgb(255 255 255 / 0.62);
              }
              .stacks-diagnostics-notices > button {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 8px;
                padding: 4px 5px;
                border-radius: 3px;
                background: rgb(255 255 255 / 0.035);
              }
              .stacks-diagnostics-notices > button:hover,
              .stacks-diagnostics-notices > button:focus-visible {
                background: rgb(255 255 255 / 0.08);
              }
              .stacks-diagnostics-notices > button[data-tone="danger"] > span { color: #ff7e87; }
              .stacks-diagnostics-notices > button[data-tone="warning"] > span { color: #f0bd4f; }
              .stacks-diagnostics-notices > button[data-tone="info"] > span { color: #7ddcff; }
              .stacks-diagnostics-notices > button > small { color: rgb(255 255 255 / 0.5); }
              .stacks-diagnostics-section {
                display: grid;
                min-width: 0;
                gap: 5px;
                margin: 0;
                padding: 7px;
                border: 1px solid rgb(255 255 255 / 0.12);
                border-radius: 5px;
                background: rgb(255 255 255 / 0.025);
              }
              .stacks-diagnostics-section legend {
                padding: 0 4px;
                color: rgb(255 255 255 / 0.72);
                font-size: 9px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
              }
              .stacks-diagnostics-section label {
                display: flex;
                align-items: start;
                gap: 5px;
              }
              .stacks-diagnostics-section input { margin-top: 1px; }
              .stacks-diagnostics-range {
                display: grid !important;
                grid-template-columns: 1fr auto;
                align-items: center !important;
                gap: 3px 8px !important;
              }
              .stacks-diagnostics-range output {
                color: rgb(255 255 255 / 0.82);
                font-variant-numeric: tabular-nums;
              }
              .stacks-diagnostics-range input[type="range"] {
                grid-column: 1 / -1;
                width: 100%;
                margin: 0;
              }
              .stacks-diagnostics-subhead {
                margin-top: 2px;
                color: rgb(255 255 255 / 0.7);
                font-size: 9px;
              }
              .stacks-diagnostics-actions {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 5px;
              }
              .stacks-diagnostics-actions button,
              .stacks-perch-drawer-header button {
                padding: 3px 6px;
                border: 1px solid rgb(255 255 255 / 0.16);
                border-radius: 4px;
                background: rgb(255 255 255 / 0.04);
              }
              .stacks-diagnostics-actions button:disabled {
                opacity: 0.42;
              }
              .stacks-diagnostics-details {
                display: grid;
                gap: 5px;
                padding: 7px;
                border: 1px solid rgb(255 255 255 / 0.12);
                border-radius: 5px;
                background: rgb(255 255 255 / 0.025);
              }
              .stacks-diagnostics-details > summary {
                cursor: pointer;
                color: rgb(255 255 255 / 0.76);
                user-select: none;
              }
              .stacks-diagnostics-details[open] > summary {
                margin-bottom: 2px;
                color: rgb(255 255 255 / 0.94);
              }
              .stacks-diagnostics-inline-details {
                padding: 5px 7px;
                background: rgb(0 0 0 / 0.08);
              }
              .stacks-performance-trace[data-state="recording"] {
                border-color: rgb(125 220 255 / 0.3);
                background: rgb(125 220 255 / 0.055);
              }
              .stacks-performance-trace[data-state="ready"] {
                border-color: rgb(102 227 161 / 0.24);
              }
              .stacks-performance-trace > summary strong {
                color: rgb(255 255 255 / 0.92);
              }
              .stacks-performance-trace[data-state="recording"] > summary strong {
                color: #7ddcff;
              }
              .stacks-performance-trace[data-state="ready"] > summary strong {
                color: #66e3a1;
              }
              .stacks-performance-trace > p {
                margin: 2px 0;
                color: rgb(255 255 255 / 0.64);
              }
              .stacks-performance-trace > small {
                color: rgb(255 255 255 / 0.58);
              }
              .stacks-performance-trace-result {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 4px;
                font-variant-numeric: tabular-nums;
              }
              .stacks-performance-trace-result > span {
                display: grid;
                gap: 1px;
                padding: 4px;
                border-radius: 3px;
                color: rgb(255 255 255 / 0.5);
                background: rgb(255 255 255 / 0.035);
              }
              .stacks-performance-trace-result > span > strong {
                color: rgb(255 255 255 / 0.88);
              }
              .stacks-performance-trace-result > small {
                grid-column: 1 / -1;
                color: rgb(255 255 255 / 0.58);
              }
              .stacks-diagnostics-experiments > .stacks-diagnostics-section {
                margin-top: 5px;
                padding: 2px 0 0;
                border: 0;
                background: transparent;
              }
              .stacks-perch-legend {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 4px 10px;
                padding: 7px;
                border: 1px solid rgb(255 255 255 / 0.12);
                border-radius: 5px;
                background: rgb(255 255 255 / 0.035);
              }
              .stacks-perch-legend strong,
              .stacks-perch-legend small { grid-column: 1 / -1; }
              .stacks-perch-legend span {
                display: flex;
                align-items: center;
                gap: 5px;
              }
              .stacks-perch-legend small { color: rgb(255 255 255 / 0.68); }
              .stacks-perch-legend i { display: inline-block; flex: none; }
              .stacks-perch-legend [data-marker="anchor"] {
                width: 7px;
                height: 7px;
                background: #ff334d;
                transform: rotate(45deg);
              }
              .stacks-perch-legend [data-marker="contact"] {
                width: 7px;
                height: 7px;
                background: #55d98b;
              }
              .stacks-perch-legend [data-marker="normal"] {
                width: 12px;
                height: 2px;
                background: #7ddcff;
              }
              .stacks-perch-legend [data-marker="status"] {
                width: 6px;
                height: 6px;
                border-radius: 50%;
              }
              .stacks-perch-legend [data-marker="moth-ring"] {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                border: 1.5px solid #c79bff;
              }
              .stacks-perch-legend [data-disposition="ready"] { background: #55d98b; }
              .stacks-perch-legend [data-disposition="waiting"] { background: #f0bd4f; }
              .stacks-perch-legend [data-disposition="occupied"] { background: #5aa9ff; }
              .stacks-perch-legend [data-disposition="rejected"] { background: #ff5964; }
              .stacks-perch-summary {
                display: grid;
                gap: 4px;
                padding: 7px;
                border: 1px solid rgb(255 255 255 / 0.12);
                border-radius: 5px;
                background: rgb(255 255 255 / 0.035);
              }
              .stacks-perch-summary dl { display: grid; gap: 2px; }
              .stacks-perch-summary dl > div {
                display: flex;
                justify-content: space-between;
                gap: 12px;
              }
              .stacks-perch-list { display: grid; gap: 2px; }
              .stacks-perch-list > button {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                padding: 3px 4px;
              }
              .stacks-perch-list > output {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                padding: 3px 4px;
                color: rgb(255 255 255 / 0.78);
              }
              .stacks-perch-list > output[data-stalled="true"] {
                color: #ff5964;
              }
              .stacks-perch-list > button:hover,
              .stacks-perch-list > button:focus-visible { background: rgb(255 255 255 / 0.07); }
              .stacks-perch-detail {
                position: sticky;
                bottom: 0;
                padding: 7px;
                border: 1px solid rgb(255 255 255 / 0.14);
                border-radius: 5px;
                background: rgb(4 10 18 / 0.98);
                white-space: normal;
              }
              .stacks-perch-list [data-disposition="ready"] { color: #55d98b; }
              .stacks-perch-list [data-disposition="waiting"] { color: #f0bd4f; }
              .stacks-perch-list [data-disposition="occupied"] { color: #5aa9ff; }
              .stacks-perch-list [data-disposition="rejected"] { color: #ff5964; }`;

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
  const effects = runtime?.plan.effects;
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
  const ao = effects?.ambientOcclusion
    ? `AO ${effects.ambientOcclusionHalfRes ? "½" : "full"}/${effects.ambientOcclusionQuality}`
    : "AO off";
  const dof = effects?.depthOfField
    ? `DoF ${effects.depthOfFieldResolutionScale.toFixed(2)}×`
    : "DoF off";

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

      <div className="stacks-diagnostics-metrics">
        <article>
          <span>Quality</span>
          {/* In automatic mode the scene does not stand at a preset, so a
              preset name here would misdescribe an independent axis state.
              A forced preset shows its name and the axes it resolved to. */}
          {/* Never collapse to a bare "Waiting": the profile name is known
              from the control store before the canvas has published anything,
              and hiding it makes a booting scene look like a broken one. */}
          <strong>
            {runtime
              ? `${runtime.forcedProfile ?? runtime.plan.profile}${
                  runtime.forcedProfile ? " (forced)" : ""
                } · res ${runtime.axes.resolutionStep}/11`
              : `${qualityControls.mode} · scene not mounted`}
          </strong>
          <small>
            {runtime
              ? `fx ${runtime.axes.effects} · geo ${runtime.axes.content}`
              : "no frame published yet"}
          </small>
          <small>
            {runtime
              ? `${(runtime.plan.physicalPixels / 1_000_000).toFixed(1)}/${(
                  runtime.plan.pixelBudget / 1_000_000
                ).toFixed(1)} MP · DPR ${runtime.plan.dpr.toFixed(2)}`
              : "Resolving render plan"}
          </small>
          <small>
            {effects
              ? `B${effects.bloomLevels}@${effects.bloomResolutionScale.toFixed(2)}× · ${ao} · ${dof}`
              : "Effects unavailable"}
          </small>
          {runtime ? (
            <small>
              {runtime.plan.environment.farGrassShader} far grass ·{" "}
              {runtime.plan.effects.multisampling}× composer MSAA
            </small>
          ) : null}
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
            {runtime
              ? `${(runtime.cooldownRemainingMs / 1_000).toFixed(1)}s cooldown · ${runtime.fallbackStatus}`
              : "Composer status unavailable"}
          </small>
        </article>
        <article>
          <span>Scene systems</span>
          <strong>
            {activeSummary.ready + activeSummary.occupied}/{activeSummary.total}{" "}
            perches ready
          </strong>
          <small>
            {visibleFlightCount} flights · {stalledFlights} stalled
          </small>
          <small>
            Physics {physicsSnapshot.moduleState} · {physicsSnapshot.bodyCount}{" "}
            bodies · {physicsSnapshot.pendingHandles.length} pending
          </small>
        </article>
      </div>

      <PerformanceTraceControls onStartCapture={onStartTrace} />

      <section
        className="stacks-diagnostics-notices"
        aria-label="Active signals"
      >
        <strong>Active signals</strong>
        {notices.length > 0 ? (
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
        ) : (
          <p>No fallbacks, overrides, stalls, or visible helpers.</p>
        )}
      </section>

      <div className="stacks-diagnostics-actions">
        <button type="button" onClick={() => onNavigate("render")}>
          Tune rendering
        </button>
        <button type="button" onClick={() => onNavigate("inspect")}>
          Inspect scene
        </button>
      </div>
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
    if (!open && traceStatus.active) window.__stacks?.trace("stop");
    setOpen((current) => !current);
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
            {qualityControls.mode} · {overlayState.enabled} helpers visible
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
      {panel === "inspect" ? (
        <fieldset
          id="stacks-diagnostics-panel-inspect"
          className="stacks-diagnostics-section"
          role="tabpanel"
          aria-labelledby="stacks-diagnostics-tab-inspect"
        >
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
          <strong className="stacks-diagnostics-subhead">Perches</strong>
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
            Butterfly flight volumes
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
            Butterfly flight trails (30 s)
          </label>
          {/* Moths get their own pair. They are only ever on screen once the
            lamps are lit, so sharing the butterflies' switches meant every
            toggle also drew the half of the room you were not looking at. */}
          <strong className="stacks-diagnostics-subhead">Moths</strong>
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
            Moth flight trails (30 s)
          </label>
          <strong className="stacks-diagnostics-subhead">Physics</strong>
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
            Hulls, poses, velocity, contacts, and normals
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
            Show granular prop collider boxes
          </label>
        </fieldset>
      ) : null}

      {panel === "simulate" ? (
        <div
          id="stacks-diagnostics-panel-simulate"
          className="stacks-diagnostics-panel"
          role="tabpanel"
          aria-labelledby="stacks-diagnostics-tab-simulate"
        >
          <fieldset className="stacks-diagnostics-section">
            <legend>Camera</legend>
            <label>
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
            <small>Changes apply on the next frame and reset on reload.</small>
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
            <div className="stacks-diagnostics-actions">
              <button
                type="button"
                disabled={!meadowSnapshot.available}
                onClick={() => meadowDiagnosticsController.reset()}
              >
                Reset wind
              </button>
            </div>
            <small>
              {meadowSnapshot.available
                ? "Live gust samples the changing wind near the camera. Edits reset on reload."
                : "Waiting for the meadow renderer."}
            </small>
          </fieldset>

          <fieldset className="stacks-diagnostics-section">
            <legend>Insect behavior</legend>
            <div className="stacks-diagnostics-actions">
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
            <label>
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
                <span>{snapshot.forceResult}</span>
              ) : null}
            </div>
          </fieldset>

          <fieldset className="stacks-diagnostics-section">
            <legend>Physics runtime</legend>
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
          <fieldset className="stacks-diagnostics-section">
            <legend>Scene quality</legend>
            <label>
              Quality policy
              <select
                className="ml-auto rounded border border-white/15 bg-black/40 px-1.5 py-1 text-white"
                value={qualityControls.mode}
                onChange={(event) =>
                  sceneQualityController.setMode(
                    event.currentTarget.value as
                      | "auto"
                      | "cinematic"
                      | "showcase"
                      | "balanced"
                      | "efficient"
                      | "safety",
                  )
                }
              >
                <option value="auto">Auto</option>
                <option value="cinematic">Cinematic</option>
                <option value="showcase">Showcase</option>
                <option value="balanced">Balanced</option>
                <option value="efficient">Efficient</option>
                <option value="safety">Safety</option>
              </select>
            </label>
            {/* Resolution is a twelve-step ladder now, and the preset only
                sets its ceiling. Pinning a step is the only way to compare
                two render scales without waiting for the ladder to walk
                between them. Auto hands it back to the controller. */}
            <label>
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
            {qualityControls.runtime ? (
              <p className="text-[11px] text-white/50">
                {`DPR ${qualityControls.runtime.plan.dpr.toFixed(2)} · ${(
                  qualityControls.runtime.plan.physicalPixels / 1_000_000
                ).toFixed(2)} MP`}
                {qualityControls.resolutionStep != null ? " · pinned" : ""}
              </p>
            ) : null}
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
              {qualityControls.runtime?.plan.customOverrides ? (
                <span data-stacks-quality-custom>custom overrides</span>
              ) : null}
            </div>
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
                    Target {qualityControls.runtime.metrics?.targetHz ?? "–"} Hz
                    · p95{" "}
                    {qualityControls.runtime.metrics?.p95.toFixed(1) ?? "–"} ms
                    · drops{" "}
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
                    {
                      qualityControls.runtime.plan.effects
                        .ambientOcclusionQuality
                    }{" "}
                    · DoF{" "}
                    {qualityControls.runtime.plan.effects.depthOfFieldResolutionScale.toFixed(
                      2,
                    )}
                    × · far grass{" "}
                    {qualityControls.runtime.plan.environment.farGrassShader}
                  </span>
                </div>
              ) : (
                <small>
                  Scene not mounted yet — the canvas publishes this on its
                  first frame.
                </small>
              )}
            </details>
          </fieldset>
          <details className="stacks-diagnostics-details stacks-diagnostics-experiments">
            <summary>
              Rendering experiments ·{" "}
              {qualityControls.runtime?.plan.customOverrides
                ? "custom active"
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
              <small>
                Disable all restores the previous full-cost rendering for direct
                A/B comparison. These controls reset on reload.
              </small>
              <small>
                Placard material: {performanceSettings.placardGlassMode}
              </small>
            </fieldset>
          </details>
        </div>
      ) : null}
      {panel === "inspect" ? (
        <details className="stacks-diagnostics-details">
          <summary>
            Perch status · {summary.total} sites · {visibleFlights.length}{" "}
            flights
          </summary>
          <div
            className="stacks-perch-legend"
            aria-label="Perch diagnostic marker legend"
          >
            <strong>Scene marker legend</strong>
            <span>
              <i data-marker="anchor" /> Diamond = authored anchor
            </span>
            <span>
              <i data-marker="contact" data-disposition="ready" /> Colored
              square = resolved contact
            </span>
            <span>
              <i data-marker="normal" /> Blue line = surface normal
            </span>
            <span>
              <i data-marker="status" data-disposition="ready" /> ready ·{" "}
              <i data-marker="status" data-disposition="waiting" /> claimed,
              inbound · <i data-marker="status" data-disposition="occupied" />{" "}
              insect settled ·{" "}
              <i data-marker="status" data-disposition="rejected" /> rejected
            </span>
            <span>
              <i data-marker="moth-ring" /> Ring = a moth may land here (Lamp
              Perches only)
            </span>
            <small>
              Helpers are hidden by default and are diagnostic markers, not
              insects. Hover a Perch below to reveal only that site.
            </small>
          </div>
          <div className="stacks-perch-summary">
            <span>
              Showing {summary.total} · {summary.ready} ready ·{" "}
              {summary.waiting} temporarily unavailable · {summary.occupied}{" "}
              with an insect settled · {summary.rejected} safety/authoring
              rejected
            </span>
            {summary.rejections.length > 0 ? (
              <dl>
                {summary.rejections.map(({ code, count }) => (
                  <div key={code}>
                    <dt>{code}</dt>
                    <dd>×{count}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
          <div className="stacks-perch-summary">
            <span>
              Flights {visibleFlights.length} · stalled {stalledFlights}
            </span>
          </div>
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
      ) : null}
      {panel === "inspect" ? (
        <PhysicsDiagnosticsDetails snapshot={physicsSnapshot} />
      ) : null}
    </section>
  ) : null;

  return (
    <>
      <style>{DIAGNOSTICS_STYLES}</style>
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
      <div className="stacks-perch-summary">
        <span>
          {snapshot.moduleState} · {snapshot.activeWorld ?? "no world"} ·{" "}
          {snapshot.broadphase ?? "no broadphase"} · gravity {snapshot.gravity}
        </span>
      </div>
      <div className="stacks-perch-summary">
        <span>
          Surface {snapshot.authoredSurface ?? snapshot.plane ?? "–"} · revision{" "}
          {snapshot.geometryRevision?.slice(0, 18) ?? "–"}
        </span>
        <span>
          {snapshot.bodyCount} bodies · {snapshot.staticCount} statics · phase{" "}
          {snapshot.phase ?? "–"} · sleep {snapshot.sleepState ?? "–"}
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
          Physics timing {snapshot.timing.frameMs.toFixed(2)} ms frame ·{" "}
          {snapshot.timing.stepMs.toFixed(2)} ms step ·{" "}
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
  );
}
