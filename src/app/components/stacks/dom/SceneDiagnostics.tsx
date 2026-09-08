"use client";

import { FIELD_NOTES, type FieldNoteId } from "../fieldNotes/catalog";
import { resetFieldNotePlacements } from "../fieldNotes/placement";
import {
  previewFieldNoteAward,
  recordFieldNoteEvent,
  resetFieldNotes,
  setAllFieldNotesFound,
  useFieldNotesProgress,
} from "../fieldNotes/progress";
import { isEditableShortcutTarget } from "../input/editableShortcutTarget";
import { browserStorage } from "../mobile/liveness";
import {
  downloadPerformanceDiagnosticBundle,
  localPerformanceDiagnostic,
} from "../performanceDiagnostic";
import { performanceDiagnosticRequested } from "../performanceDiagnosticRequest";
import { performanceDiagnosticProgress } from "../performanceDiagnosticRuntime";
import { cloudDiagnosticsController } from "../scene/cloudDiagnostics";
import { requestDevHooks } from "../scene/devHooks";
import { freeRoamDiagnosticsController } from "../scene/freeRoamDiagnostics";
import {
  insectDiagnosticsController,
  summarizeInsectPerchDiagnostics,
} from "../scene/insectPerchDiagnostic";
import { meadowDiagnosticsController } from "../scene/meadowDiagnostics";
import {
  PERFORMANCE_PROFILE_PRESENTATION,
  describePerformanceProfile,
} from "../scene/performanceProfilePresentation";
import {
  PERFORMANCE_PROFILES,
  type PerformanceProfileId,
  performanceProfileController,
  performanceProfileUrl,
} from "../scene/performanceProfiles";
import {
  downloadPerformanceTrace,
  scenePerformanceTrace,
} from "../scene/performanceTrace";
import {
  DEFAULT_PHOTOGRAPH_TREATMENT,
  photographTreatmentController,
  usePhotographTreatment,
} from "../scene/photographTreatment";
import { physicsDiagnosticsController } from "../scene/physicsDiagnostics";
import {
  DEPTH_OF_FIELD_STRENGTH_DEFAULT,
  QUALITY_SAMPLE_INTERVAL_MS,
} from "../scene/quality";
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
  SCENE_GRADE_PROFILES,
  activeGradeTheme,
  gradeValuesJson,
  sceneGradeProfileValues,
  sceneGradeUrl,
  useSceneGradeProfile,
} from "../scene/sceneGradeProfiles";
import { sceneLayoutEditorController } from "../scene/sceneLayoutEditor";
import {
  DEFAULT_DEPTH_OF_FIELD_MODEL,
  OPTICAL_DEPTH_OF_FIELD_DEFAULTS,
  sceneQualityController,
  useSceneQualityControls,
  useSceneQualityRuntime,
} from "../scene/sceneQualityController";
import {
  screenshotModeController,
  screenshotModeUrl,
  useScreenshotMode,
} from "../scene/screenshotMode";
import { CAMERA } from "../scene/worldLayout";
import { useStacks } from "../store";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { skyEventDiagnosticsController } from "~/lib/skyEventDiagnostics";

import { KeycapSequence } from "~/components/ui/keycap";

import "./SceneDiagnostics.module.css";
import { type DevHudInput, createDevHudRows } from "./devHudPresentation";
import {
  type PerformanceCaptureStatus,
  isFinalPerformanceDiagnosticDelivery,
  performanceCaptureStatus,
} from "./performanceCaptureStatus";
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

const subscribeToLocalDiagnostic = (listener: () => void) =>
  localPerformanceDiagnostic.subscribe(listener);
const readLocalDiagnostic = () => localPerformanceDiagnostic.getSnapshot();

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
  survival: null,
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
    (axis !== "resolution" &&
      axis !== "effects" &&
      axis !== "content" &&
      axis !== "survival") ||
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
    survival: typeof axes?.survival === "boolean" ? axes.survival : null,
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
  captureStatus,
  activeProfile,
  launcher,
  onDismiss,
  onToggle,
}: {
  expanded: boolean;
  captureStatus: PerformanceCaptureStatus | null;
  activeProfile: PerformanceProfileId | null;
  launcher: React.RefObject<HTMLButtonElement | null>;
  onDismiss: () => void;
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
  const tracing = captureStatus?.state === "recording";
  const profileStatus = activeProfile
    ? `TEST · ${activeProfile.toUpperCase()}`
    : null;
  const launcherDescription = [
    profileStatus,
    captureStatus?.label,
    "Press ` to open FPS, policy, effects, and rendering decisions.",
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <div className="stacks-dev-hud-shell">
      <button
        ref={launcher}
        type="button"
        className="stacks-dev-hud"
        aria-label="Open scene debug console"
        aria-keyshortcuts="`"
        aria-expanded={expanded}
        aria-controls="stacks-scene-diagnostics"
        aria-describedby="stacks-dev-hud-description"
        aria-haspopup="dialog"
        data-tracing={tracing || undefined}
        data-capture-state={captureStatus?.state}
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
        {profileStatus || captureStatus ? (
          <span className="stacks-dev-hud-statuses">
            {profileStatus ? (
              <span className="stacks-dev-hud-profile-status">
                <i aria-hidden="true" />
                {profileStatus}
              </span>
            ) : null}
            {captureStatus ? (
              <span
                className="stacks-dev-hud-capture-status"
                data-state={captureStatus.state}
                role="status"
              >
                <i aria-hidden="true" />
                {captureStatus.label}
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
      <span id="stacks-dev-hud-description" className="sr-only">
        {launcherDescription}
      </span>
      <button
        type="button"
        className="stacks-dev-hud-dismiss"
        aria-label="Hide performance HUD until reload"
        onClick={onDismiss}
      >
        <XIcon aria-hidden="true" size={9} weight="bold" />
      </button>
    </div>
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

function LayoutEditorControls() {
  const snapshot = useSyncExternalStore(
    sceneLayoutEditorController.subscribe,
    sceneLayoutEditorController.getSnapshot,
    sceneLayoutEditorController.getSnapshot,
  );
  const selected = snapshot.records.find(
    (record) => record.id === snapshot.selectedId,
  );
  const changed = snapshot.records.filter((record) => record.changed).length;
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  const copySnapshot = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(sceneLayoutEditorController.export(), null, 2),
      );
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  return (
    <CollapsibleSection
      label="Layout editor"
      active={snapshot.enabled}
      summary={snapshot.enabled ? `on · ${changed} edited` : "off"}
    >
      <label className="stacks-diagnostics-control">
        <input
          type="checkbox"
          checked={snapshot.enabled}
          onChange={(event) =>
            sceneLayoutEditorController.setEnabled(event.currentTarget.checked)
          }
        />{" "}
        Enable layout editing
      </label>
      <label className="stacks-diagnostics-control">
        Prop
        <select
          value={snapshot.selectedId ?? ""}
          disabled={!snapshot.enabled}
          onChange={(event) =>
            sceneLayoutEditorController.select(
              event.currentTarget.value || null,
            )
          }
        >
          <option value="">Select a prop</option>
          {snapshot.records.map((record) => (
            <option
              key={record.id}
              value={record.id}
              disabled={!record.available}
            >
              {record.label}
              {record.changed ? " · edited" : ""}
              {!record.available ? " · unavailable" : ""}
            </option>
          ))}
        </select>
      </label>
      {selected ? (
        <>
          <small>Position</small>
          <div className="stacks-layout-editor-coordinates">
            {(["X", "Y", "Z"] as const).map((axis, index) => (
              <label key={axis}>
                <span>{axis}</span>
                <input
                  type="number"
                  min={-10}
                  max={10}
                  step={0.01}
                  value={selected.preview[index]!.toFixed(3)}
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    if (!Number.isFinite(value)) return;
                    const next = [...selected.preview] as [
                      number,
                      number,
                      number,
                    ];
                    next[index] = value;
                    sceneLayoutEditorController.update(selected.id, next);
                  }}
                />
              </label>
            ))}
          </div>
          <small>Uniform scale</small>
          <div className="stacks-layout-editor-coordinates">
            <label>
              <span>All</span>
              <input
                type="number"
                min={0.05}
                max={10}
                step={0.01}
                value={selected.previewScale.toFixed(3)}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (!Number.isFinite(value)) return;
                  sceneLayoutEditorController.updateScale(selected.id, value);
                }}
              />
            </label>
          </div>
        </>
      ) : null}
      <div className="stacks-diagnostics-actions">
        <button
          type="button"
          disabled={!selected?.changed}
          onClick={() =>
            selected && sceneLayoutEditorController.reset(selected.id)
          }
        >
          Reset selected
        </button>
        <button
          type="button"
          disabled={changed === 0}
          onClick={() => sceneLayoutEditorController.resetAll()}
        >
          Reset all
        </button>
        <button type="button" disabled={changed === 0} onClick={copySnapshot}>
          Copy layout snapshot
        </button>
      </div>
      <p className="stacks-diagnostics-note" aria-live="polite">
        {copyStatus === "copied"
          ? "Copied layout JSON."
          : copyStatus === "error"
            ? "Clipboard unavailable. Read window.__stacks.layout() instead."
            : `${changed} edited · Move, rotate, and scale with one gizmo · ⌘Z undo · ⌘⇧Z redo`}
      </p>
    </CollapsibleSection>
  );
}

function FieldNotesDiagnosticsControls() {
  const progress = useFieldNotesProgress();
  const [selectedId, setSelectedId] = useState<FieldNoteId>(FIELD_NOTES[0].id);
  const foundCount = FIELD_NOTES.filter(
    (note) => progress.earned[note.id] !== undefined,
  ).length;
  const allFound = foundCount === FIELD_NOTES.length;

  return (
    <CollapsibleSection
      label="Field Notes"
      active={false}
      summary={`${foundCount} / ${FIELD_NOTES.length} found`}
    >
      <div className="stacks-diagnostics-current">
        <span>Progress</span>
        <strong>
          {foundCount} / {FIELD_NOTES.length} found
        </strong>
        <small>
          Preview notifications without saving, or override local progress.
        </small>
      </div>
      <label className="stacks-diagnostics-control">
        Notification
        <select
          value={selectedId}
          onChange={(event) =>
            setSelectedId(event.currentTarget.value as FieldNoteId)
          }
        >
          {FIELD_NOTES.map((note) => (
            <option key={note.id} value={note.id}>
              {note.title} · {note.rarity}
            </option>
          ))}
        </select>
      </label>
      <div className="stacks-diagnostics-actions">
        <button type="button" onClick={() => previewFieldNoteAward(selectedId)}>
          Preview notification
        </button>
        <button
          type="button"
          disabled={allFound}
          onClick={() => setAllFieldNotesFound(true)}
        >
          Mark all found
        </button>
        <button
          type="button"
          disabled={foundCount === 0}
          onClick={resetFieldNotes}
        >
          Reset progress
        </button>
        <button type="button" onClick={resetFieldNotePlacements}>
          Reset stamp layout
        </button>
      </div>
      <p className="stacks-diagnostics-note">
        Progress and stamp layout persist in this browser. Resetting the layout
        does not clear discoveries. Notification previews do not persist.
      </p>
    </CollapsibleSection>
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
      <label
        className="stacks-diagnostics-control"
        aria-description={descriptor.help}
      >
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
        aria-description={descriptor.help}
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
    <label
      className="stacks-diagnostics-control"
      aria-description={descriptor.help}
    >
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

/** A block that stays folded until something in it is off its default, or
 * until the owner opens it. Folding is per mount like the rest of the
 * console; a block that becomes active while the console is open unfolds
 * itself, and one the owner folded by hand stays folded until it changes
 * again. */
function CollapsibleSection({
  label,
  active,
  summary,
  className,
  children,
}: {
  label: string;
  active: boolean;
  summary: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);
  return (
    <details
      className={`stacks-diagnostics-section stacks-diagnostics-collapsible${
        className ? ` ${className}` : ""
      }`}
      open={open}
      data-active={active || undefined}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>{label}</span>
        <small>{summary}</small>
      </summary>
      {children}
    </details>
  );
}

function DiagnosticRegistrySection({
  groupId,
  snapshot,
  fallbackValues = {},
  beforeControls,
  children,
  collapsible = false,
  active,
  summary,
}: {
  groupId: string;
  snapshot: DiagnosticRegistrySnapshot;
  fallbackValues?: Readonly<Record<string, number>>;
  beforeControls?: React.ReactNode;
  children?: React.ReactNode;
  /** Fold the section unless it is active: by `active` when the caller
   * knows better (a profile other than the shipped one, a mode switched
   * on), otherwise whenever a movable control is off its default. */
  collapsible?: boolean;
  active?: boolean;
  /** Folded-state text; defaults to how many controls have moved. */
  summary?: string;
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
  const body = (
    <>
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
              data-span={
                subgroup === "overlay.perches" ||
                subgroup === "grade.mixer" ||
                subgroup === "lens.optical"
                  ? "full"
                  : undefined
              }
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
    </>
  );
  if (!collapsible)
    return (
      <fieldset className="stacks-diagnostics-section">
        <legend>{section.label}</legend>
        {body}
      </fieldset>
    );
  // Readouts (the live gust, say) drift from their first value on their
  // own; only a control the owner can move counts as a change.
  const changed = section.controls.filter(
    (control) =>
      control.behavior.update !== "read-only" &&
      !Object.is(snapshot[control.id]?.value, control.defaultValue),
  ).length;
  return (
    <CollapsibleSection
      label={section.label}
      active={active ?? changed > 0}
      summary={summary ?? (changed > 0 ? `${changed} changed` : "defaults")}
    >
      {body}
    </CollapsibleSection>
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
  const diagnosticBundle = useSyncExternalStore(
    subscribeToLocalDiagnostic,
    readLocalDiagnostic,
    readLocalDiagnostic,
  );
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
        Start closes this console. Pause, pan across a few shelves, then press `
        to stop and review; attach the JSON for analysis.
      </p>
      <p>
        The compact diagnostic includes browser and device facts, the user
        agent, and query keys. It omits query values and resource paths.
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
          Download full trace
        </button>
        <button
          type="button"
          disabled={diagnosticBundle.events.length === 0}
          onClick={() => downloadPerformanceDiagnosticBundle(diagnosticBundle)}
        >
          Download diagnostic
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
      {diagnosticBundle.events.length > 0 ? (
        <small>
          Diagnostic bundle: {diagnosticBundle.events.length} compact boot and
          runtime {diagnosticBundle.events.length === 1 ? "report" : "reports"}.
        </small>
      ) : null}
    </details>
  );
}

/** The header sizes the two networks want, against the window as it is.
 * The owner sizes the window by hand (or through the device toolbar), so the
 * live ratio is the one number worth reading off while doing it. */
const HEADER_TARGETS = [
  { network: "LinkedIn", width: 1584, height: 396 },
  { network: "X", width: 1500, height: 500 },
] as const;

function ScreenshotSetupNote() {
  const screenshot = useScreenshotMode();
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const measure = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, []);
  const ratio =
    viewport.height > 0 ? (viewport.width / viewport.height).toFixed(2) : "?";
  const copySetup = () => {
    const url = screenshotModeUrl(window.location.href, screenshot);
    void navigator.clipboard?.writeText(url).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  return (
    <>
      <p className="stacks-diagnostics-note">
        Size the window to the header ratio, then press H to hide this console
        with the rest of the interface and take the shot. Escape brings it back.
        [ and ] dolly while the interface is hidden.
      </p>
      <p className="text-[11px] text-white/50">
        {`Window ${viewport.width}×${viewport.height} · ${ratio}:1. `}
        {HEADER_TARGETS.map(
          (target) =>
            `${target.network} ${target.width}×${target.height} (${(
              target.width / target.height
            ).toFixed(2)}:1)`,
        ).join(" · ")}
      </p>
      <div className="stacks-diagnostics-actions">
        <button
          type="button"
          disabled={!screenshot.enabled}
          onClick={copySetup}
        >
          {copied ? "Setup URL copied" : "Copy setup URL"}
        </button>
        <button
          type="button"
          disabled={screenshot.fov === null}
          onClick={() => screenshotModeController.setFov(null)}
        >
          Composition lens
        </button>
      </div>
    </>
  );
}

/** The grade section's readout and the two ways a tuned look leaves the
 * session: as JSON for a note or a commit, or as a URL for a second browser
 * and headless captures. */
function GradeProfileNote() {
  const snapshot = useSceneGradeProfile();
  const [copied, setCopied] = useState<"values" | "url" | null>(null);
  const theme = activeGradeTheme();
  const label =
    snapshot.profile === "custom"
      ? "Custom"
      : SCENE_GRADE_PROFILES[snapshot.profile].label;
  const copy = (kind: "values" | "url", text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => setCopied(kind),
      () => setCopied(null),
    );
  };
  return (
    <>
      <div className="stacks-diagnostics-current">
        <span>Now</span>
        <strong>{label}</strong>
        <small>
          {`Sliders show the ${theme} theme · moving one forks into Custom`}
        </small>
      </div>
      <div className="stacks-diagnostics-actions">
        <button
          type="button"
          onClick={() =>
            copy("values", gradeValuesJson(sceneGradeProfileValues(snapshot)))
          }
        >
          {copied === "values" ? "Values copied" : "Copy values"}
        </button>
        <button
          type="button"
          onClick={() =>
            copy("url", sceneGradeUrl(window.location.href, snapshot))
          }
        >
          {copied === "url" ? "Grade URL copied" : "Copy grade URL"}
        </button>
      </div>
      <small>
        Session-only, like the rest of this console. The URL names the profile
        (and carries every slider for Custom), so a screenshot setup can be
        reproduced with it; the values are what to paste when a look should
        become the shipped print.
      </small>
    </>
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

export default function SceneDiagnostics({
  initiallyOpen = false,
}: {
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [hudVisible, setHudVisible] = useState(true);
  // The console ships to everyone behind the backtick, and finding it is
  // worth a stamp (Under the Hood).
  useEffect(() => {
    if (open) recordFieldNoteEvent({ type: "console-opened" });
  }, [open]);
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
  const runtimeProgress = useSyncExternalStore(
    performanceDiagnosticProgress.subscribe,
    performanceDiagnosticProgress.getSnapshot,
    performanceDiagnosticProgress.getSnapshot,
  );
  const [automaticReport] = useState(() =>
    performanceDiagnosticRequested(window.location.search),
  );
  const activeProfile = useSyncExternalStore(
    performanceProfileController.subscribe,
    performanceProfileController.getSnapshot,
    performanceProfileController.getSnapshot,
  );
  const gradeProfile = useSceneGradeProfile();
  const photographTreatment = usePhotographTreatment();
  const screenshotMode = useScreenshotMode();
  const [automaticReportQueued, setAutomaticReportQueued] = useState(false);
  const [automaticReportUploaded, setAutomaticReportUploaded] = useState(false);
  const [automaticReportFallback, setAutomaticReportFallback] = useState(false);
  const captureStatus = performanceCaptureStatus({
    automaticReport,
    automaticReportQueued,
    automaticReportUploaded,
    automaticReportFallback,
    runtimeProgress,
    trace: traceStatus,
  });
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
    qualityControls.depthOfFieldBokehMultiplier ??
    DEPTH_OF_FIELD_STRENGTH_DEFAULT;
  const depthOfFieldResolutionScale =
    qualityControls.depthOfFieldResolutionScale ??
    qualityControls.runtime?.plan.effects.depthOfFieldResolutionScale ??
    0.6;
  const depthOfFieldTuningChanged =
    qualityControls.depthOfFieldModel !== DEFAULT_DEPTH_OF_FIELD_MODEL ||
    qualityControls.depthOfFieldBokehMultiplier != null ||
    qualityControls.depthOfFieldResolutionScale != null ||
    Object.entries(OPTICAL_DEPTH_OF_FIELD_DEFAULTS).some(
      ([key, value]) =>
        qualityControls.opticalDepthOfField[
          key as keyof typeof OPTICAL_DEPTH_OF_FIELD_DEFAULTS
        ] !== value,
    );
  const photographTreatmentChanged =
    photographTreatment.chromaProtection !==
      DEFAULT_PHOTOGRAPH_TREATMENT.chromaProtection ||
    photographTreatment.warmthMultiplier !==
      DEFAULT_PHOTOGRAPH_TREATMENT.warmthMultiplier ||
    photographTreatment.contrast !== DEFAULT_PHOTOGRAPH_TREATMENT.contrast;

  useEffect(() => {
    if (!automaticReport) return;
    const onAnalyticsCaptured = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          event?: unknown;
          properties?: { report_kind?: unknown };
        }>
      ).detail;
      if (
        detail?.event === "homepage_performance_diagnostic" &&
        detail.properties?.report_kind === "runtime"
      )
        setAutomaticReportQueued(true);
    };
    window.addEventListener("chappy:analytics-captured", onAnalyticsCaptured);
    const onDiagnosticDelivery = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          status?: "uploaded" | "sdk_fallback";
          reportKind?: unknown;
        }>
      ).detail;
      if (!isFinalPerformanceDiagnosticDelivery(detail?.reportKind)) return;
      if (detail?.status === "uploaded") setAutomaticReportUploaded(true);
      if (detail?.status === "sdk_fallback") setAutomaticReportFallback(true);
    };
    window.addEventListener(
      "chappy:performance-diagnostic-delivery",
      onDiagnosticDelivery,
    );
    return () => {
      window.removeEventListener(
        "chappy:analytics-captured",
        onAnalyticsCaptured,
      );
      window.removeEventListener(
        "chappy:performance-diagnostic-delivery",
        onDiagnosticDelivery,
      );
    };
  }, [automaticReport]);

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
        event.key !== "`" ||
        isEditableShortcutTarget(event.target)
      )
        return;
      event.preventDefault();
      if (!open) requestDevHooks();
      if (!open && traceStatus.active && !automaticReport)
        window.__stacks?.trace("stop");
      setOpen((current) => {
        if (current) requestAnimationFrame(() => launcher.current?.focus());
        return !current;
      });
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [automaticReport, open, traceStatus.active]);

  const startPerformanceTrace = () => {
    setOpen(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => window.__stacks?.trace("start")),
    );
  };

  const toggleConsole = () => {
    if (!open) requestDevHooks();
    if (!open && traceStatus.active && !automaticReport)
      window.__stacks?.trace("stop");
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
          <fieldset className="stacks-diagnostics-section">
            <legend>Weather</legend>
            <div className="stacks-diagnostics-actions">
              <button
                type="button"
                onClick={() => cloudDiagnosticsController.refresh()}
              >
                Refresh clouds
              </button>
            </div>
            <small>
              Jumps the cloud field to a new formation without resetting birds,
              lights, or the rest of the scene. Reload restores the original
              weather.
            </small>
          </fieldset>
          <fieldset className="stacks-diagnostics-section">
            <legend>Sky events</legend>
            <div className="stacks-diagnostics-actions">
              <button
                type="button"
                onClick={() => skyEventDiagnosticsController.triggerBat()}
              >
                Trigger bat
              </button>
              <button
                type="button"
                onClick={() => skyEventDiagnosticsController.triggerBirds()}
              >
                Trigger birds
              </button>
              <button
                type="button"
                onClick={() =>
                  skyEventDiagnosticsController.triggerShootingStar()
                }
              >
                Trigger shooting star
              </button>
            </div>
            <small>
              Bat and birds restart their WebGL crossing. The shooting star
              restarts in an open Manual or Routine sky. Theme rules still
              apply.
            </small>
          </fieldset>
          <DiagnosticRegistrySection
            groupId="simulate.camera"
            snapshot={diagnosticSnapshot}
            collapsible
            active={freeRoamSnapshot.enabled}
            summary={freeRoamSnapshot.enabled ? "free roam" : "authored"}
          >
            <p className="stacks-diagnostics-note">
              Free roam never captures the mouse. Hold the right button and drag
              to look. WASD follows the camera on a level plane, Q/E moves
              down/up, and hold Shift for one-third speed. R resumes or exits
              free roam, Shift+R starts from the current view, and ` opens
              debug. Left click selects an editable prop. The same gizmo moves,
              rotates, and scales it; ⌘Z undoes. Arrows move on X/Z; use Page
              Up/Down for height.
            </p>
          </DiagnosticRegistrySection>

          <DiagnosticRegistrySection
            groupId="simulate.golf"
            snapshot={diagnosticSnapshot}
            collapsible
          />

          <DiagnosticRegistrySection
            groupId="simulate.physics"
            snapshot={diagnosticSnapshot}
            collapsible
          />

          <DiagnosticRegistrySection
            groupId="simulate.meadow"
            snapshot={diagnosticSnapshot}
            collapsible
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
            collapsible
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

          {/* The headset's own toys, apart from the room's render switches:
              a ride preview is a scene to step into, not a pass to bisect. */}
          <DiagnosticRegistrySection
            groupId="simulate.vision"
            snapshot={diagnosticSnapshot}
            collapsible
          />

          <FieldNotesDiagnosticsControls />
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
          {/* Stable production policy comes first. Session-only render
              switches are grouped by what they own: lens, finishing passes,
              authored scene effects, optimizations, and scheduling. */}
          <DiagnosticRegistrySection
            groupId="render.quality"
            snapshot={diagnosticSnapshot}
            beforeControls={
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
                    ? `Effective ${qualityControls.runtime.plan.profile} · fx ${qualityControls.runtime.axes.effects} · geo ${qualityControls.runtime.axes.content}${qualityControls.runtime.axes.survival ? " · survival" : ""}`
                    : "Waiting for the scene to publish its render plan"}
                </small>
              </div>
            }
          >
            <div className="stacks-diagnostics-actions">
              <button
                type="button"
                onClick={() => sceneQualityController.resetLearnedProfile()}
              >
                Reset learned profile
              </button>
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
            groupId="render.grade"
            snapshot={diagnosticSnapshot}
            collapsible
            active={gradeProfile.profile !== "shipped"}
            summary={
              gradeProfile.profile === "custom"
                ? "Custom"
                : SCENE_GRADE_PROFILES[gradeProfile.profile].label
            }
          >
            <GradeProfileNote />
          </DiagnosticRegistrySection>

          <DiagnosticRegistrySection
            groupId="render.photographs"
            snapshot={diagnosticSnapshot}
            collapsible
          >
            <div className="stacks-diagnostics-actions">
              <button
                type="button"
                disabled={!photographTreatmentChanged}
                onClick={() => photographTreatmentController.reset()}
              >
                Reset photograph treatment
              </button>
            </div>
          </DiagnosticRegistrySection>

          <DiagnosticRegistrySection
            groupId="render.screenshot"
            snapshot={diagnosticSnapshot}
            fallbackValues={{ "screenshot.fov": CAMERA.fov }}
            collapsible
            active={screenshotMode.enabled}
            summary={screenshotMode.enabled ? "on" : "off"}
          >
            <ScreenshotSetupNote />
          </DiagnosticRegistrySection>

          <DiagnosticRegistrySection
            groupId="render.lens"
            snapshot={diagnosticSnapshot}
            fallbackValues={{
              "render.dof-strength": depthOfFieldBokehMultiplier,
              "render.dof-buffer-quality": depthOfFieldResolutionScale,
            }}
            collapsible
          >
            <div className="stacks-diagnostics-actions">
              <button
                type="button"
                disabled={!depthOfFieldTuningChanged}
                onClick={() => sceneQualityController.resetDepthOfField()}
              >
                Reset DoF tuning
              </button>
            </div>
          </DiagnosticRegistrySection>

          <DiagnosticRegistrySection
            groupId="render.passes"
            snapshot={diagnosticSnapshot}
            collapsible
          />

          <DiagnosticRegistrySection
            groupId="render.scene-effects"
            snapshot={diagnosticSnapshot}
            collapsible
          />

          <DiagnosticRegistrySection
            groupId="render.optimizations"
            snapshot={diagnosticSnapshot}
            collapsible
          >
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
          </DiagnosticRegistrySection>

          <DiagnosticRegistrySection
            groupId="render.scheduling"
            snapshot={diagnosticSnapshot}
            collapsible
          />

          <CollapsibleSection
            className="stacks-diagnostics-experiments"
            label="Reproduce a performance report"
            active={activeProfile !== null}
            summary={
              activeProfile
                ? PERFORMANCE_PROFILE_PRESENTATION[activeProfile].label
                : "no test profile"
            }
          >
            <DiagnosticRegistrySection
              groupId="render.profile"
              snapshot={diagnosticSnapshot}
            >
              {activeProfile ? (
                <div className="stacks-diagnostics-current">
                  <span>Now</span>
                  <strong>
                    {PERFORMANCE_PROFILE_PRESENTATION[activeProfile].label}
                  </strong>
                  <small>
                    {PERFORMANCE_PROFILE_PRESENTATION[activeProfile].question}
                  </small>
                  <small>
                    {describePerformanceProfile(
                      PERFORMANCE_PROFILES[activeProfile],
                    )}
                  </small>
                </div>
              ) : null}
              <div className="stacks-diagnostics-actions">
                <button
                  type="button"
                  onClick={() =>
                    window.location.assign(
                      performanceProfileUrl(
                        window.location.href,
                        activeProfile,
                      ),
                    )
                  }
                >
                  {activeProfile
                    ? "Reload under this profile"
                    : "Reload without a profile"}
                </button>
              </div>
              <small>
                Boot residency, photo residency, and the learned-quality
                suspension only take effect on reload. The reload keeps every
                other query switch, so a perf-report visit stays a report.
              </small>
            </DiagnosticRegistrySection>
          </CollapsibleSection>

          <fieldset className="stacks-diagnostics-section">
            <legend>Session</legend>
            <div className="stacks-diagnostics-actions">
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

          {process.env.NODE_ENV === "development" ? (
            <LayoutEditorControls />
          ) : null}

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
      {freeRoamSnapshot.enabled && typeof document !== "undefined"
        ? createPortal(
            // At the document root like the drawer: chrome transitions can
            // give an ancestor a transform or filter, which quietly turns
            // position: fixed into position-inside-the-wordmark.
            <div className="stacks-free-roam-hint" role="status">
              <span>Free roam</span>
              <span aria-hidden="true">·</span>
              <span>select prop to move, rotate, or scale</span>
              <span aria-hidden="true">·</span>
              <span>right-drag to look</span>
              <span aria-hidden="true">·</span>
              <KeycapSequence keys={["←", "→", "↑", "↓"]} label="Arrow keys" />
              <span>move X/Z</span>
              <span aria-hidden="true">·</span>
              <KeycapSequence keys={["⇞", "⇟"]} label="Page Up or Page Down" />
              <span>move Y</span>
              <span aria-hidden="true">·</span>
              <KeycapSequence keys={["W", "A", "S", "D"]} label="W A S D" />
              <span>camera</span>
              <span aria-hidden="true">·</span>
              <KeycapSequence keys={["Q", "E"]} label="Q or E" />
              <span>camera Y</span>
              <span aria-hidden="true">·</span>
              <KeycapSequence keys={["R"]} label="R" />
              <span>exit</span>
            </div>,
            document.body,
          )
        : null}
      <div className="stacks-debug-launchers pointer-events-auto">
        {hudVisible ? (
          <DevPerformanceHud
            expanded={open}
            captureStatus={captureStatus}
            activeProfile={activeProfile}
            launcher={launcher}
            onDismiss={() => setHudVisible(false)}
            onToggle={toggleConsole}
          />
        ) : null}
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
