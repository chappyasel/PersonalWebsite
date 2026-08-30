import { useStacks } from "../store";
import type { Object3D } from "three";

import {
  SCENE_LAYOUT_DRAFT_ENDPOINT,
  type SceneLayoutDraftRecord,
  createSceneLayoutDraft,
} from "./sceneLayoutDraft";

export { SCENE_LAYOUT_EDITOR_SENTINEL } from "./sceneLayoutDraft";

export type SceneLayoutPosition = readonly [number, number, number];

type SceneLayoutTarget = Readonly<{
  id: string;
  label: string;
  unitIndex: number;
  authored: SceneLayoutPosition;
  authoredRotation: SceneLayoutPosition;
  authoredScale: SceneLayoutPosition;
  root: Object3D;
  cancelInteraction: () => void;
}>;

type SceneLayoutRecord = Readonly<{
  id: string;
  label: string;
  unitIndex: number;
  authored: SceneLayoutPosition;
  preview: SceneLayoutPosition;
  authoredRotation: SceneLayoutPosition;
  previewRotation: SceneLayoutPosition;
  authoredScale: SceneLayoutPosition;
  previewScale: number;
  available: boolean;
  changed: boolean;
}>;

/**
 * A prop's editor-set resting pose, readable whether or not the editor is
 * currently enabled. `positionFor`/`rotationFor`/`scaleFor` answer the
 * narrower question "is the editor driving this prop right now"; this one
 * answers "where does this prop live for the rest of the page session".
 */
export type SceneLayoutOverride = Readonly<{
  position: SceneLayoutPosition;
  rotation: SceneLayoutPosition;
  scale: number;
}>;

export type SceneLayoutSnapshot = Readonly<{
  enabled: boolean;
  selectedId: string | null;
  gestureActive: boolean;
  canUndo: boolean;
  canRedo: boolean;
  records: readonly SceneLayoutRecord[];
}>;

export type SceneLayoutExportRecord = SceneLayoutDraftRecord;

export function sceneLayoutNudgeForKeyboard({
  code,
  shiftKey,
}: Readonly<{ code: string; shiftKey: boolean }>): SceneLayoutPosition | null {
  const step = shiftKey ? 0.01 : 0.05;
  if (code === "ArrowLeft") return [-step, 0, 0];
  if (code === "ArrowRight") return [step, 0, 0];
  if (code === "ArrowUp") return [0, 0, step];
  if (code === "ArrowDown") return [0, 0, -step];
  if (code === "PageUp") return [0, step, 0];
  if (code === "PageDown") return [0, -step, 0];
  return null;
}

type MutableRecord = {
  id: string;
  label: string;
  unitIndex: number;
  authored: SceneLayoutPosition;
  preview: SceneLayoutPosition | null;
  authoredRotation: SceneLayoutPosition;
  previewRotation: SceneLayoutPosition | null;
  authoredScale: SceneLayoutPosition;
  previewScale: number | null;
  root: Object3D | null;
  cancelInteraction: (() => void) | null;
};

const records = new Map<string, MutableRecord>();
const listeners = new Set<() => void>();
let enabled = false;
let selectedId: string | null = null;
let gestureActive = false;
let draftWriteEligible = false;

type HistoryValue = Readonly<{
  preview: SceneLayoutPosition | null;
  previewRotation: SceneLayoutPosition | null;
  previewScale: number | null;
}>;
type HistoryState = Map<string, HistoryValue>;

const undoStates: HistoryState[] = [];
const redoStates: HistoryState[] = [];
let gestureBaseline: HistoryState | null = null;

const tuple = (value: SceneLayoutPosition): SceneLayoutPosition =>
  Object.freeze([value[0], value[1], value[2]] as const);

const samePosition = (a: SceneLayoutPosition, b: SceneLayoutPosition) =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

const sameOptionalPosition = (
  a: SceneLayoutPosition | null,
  b: SceneLayoutPosition | null,
) => (a === null || b === null ? a === b : samePosition(a, b));

const normalized = (value: number) => {
  const rounded = Math.round(value * 10_000) / 10_000;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const captureHistory = (): HistoryState =>
  new Map(
    [...records.values()].map((record) => [
      record.id,
      {
        preview: record.preview ? tuple(record.preview) : null,
        previewRotation: record.previewRotation
          ? tuple(record.previewRotation)
          : null,
        previewScale: record.previewScale,
      },
    ]),
  );

const historyMatchesCurrent = (state: HistoryState) =>
  [...records.values()].every((record) => {
    const value = state.get(record.id);
    return (
      value !== undefined &&
      sameOptionalPosition(value.preview, record.preview) &&
      sameOptionalPosition(value.previewRotation, record.previewRotation) &&
      value.previewScale === record.previewScale
    );
  });

const applyRootTransform = (record: MutableRecord) => {
  if (!record.root) return;
  record.root.position.fromArray(record.preview ?? record.authored);
  const rotation = record.previewRotation ?? record.authoredRotation;
  record.root.rotation.set(rotation[0], rotation[1], rotation[2]);
  const scale = record.previewScale ?? 1;
  record.root.scale.set(
    record.authoredScale[0] * scale,
    record.authoredScale[1] * scale,
    record.authoredScale[2] * scale,
  );
  record.root.updateMatrix();
};

const applyHistory = (state: HistoryState) => {
  for (const record of records.values()) {
    const value = state.get(record.id);
    if (!value) continue;
    record.preview = value.preview;
    record.previewRotation = value.previewRotation;
    record.previewScale = value.previewScale;
    applyRootTransform(record);
  }
};

const commitHistory = (before: HistoryState) => {
  if (historyMatchesCurrent(before)) return;
  undoStates.push(before);
  redoStates.length = 0;
};

const publicRecord = (record: MutableRecord): SceneLayoutRecord => {
  const preview = record.preview ?? record.authored;
  const previewRotation = record.previewRotation ?? record.authoredRotation;
  const previewScale = record.previewScale ?? 1;
  return Object.freeze({
    id: record.id,
    label: record.label,
    unitIndex: record.unitIndex,
    authored: record.authored,
    preview,
    authoredRotation: record.authoredRotation,
    previewRotation,
    authoredScale: record.authoredScale,
    previewScale,
    available: record.root !== null,
    changed:
      !samePosition(record.authored, preview) ||
      !samePosition(record.authoredRotation, previewRotation) ||
      previewScale !== 1,
  });
};

/**
 * Kept as one frozen object per prop, replaced only when a component actually
 * changes, because `Grabbable` reads this through `useSyncExternalStore`. A
 * fresh object per publish would re-render every edited prop on every frame of
 * a gizmo drag.
 */
const overrides = new Map<string, SceneLayoutOverride | null>();

const overrideValue = (record: MutableRecord): SceneLayoutOverride | null =>
  record.preview === null &&
  record.previewRotation === null &&
  record.previewScale === null
    ? null
    : Object.freeze({
        position: record.preview ?? record.authored,
        rotation: record.previewRotation ?? record.authoredRotation,
        scale: record.previewScale ?? 1,
      });

const sameOverride = (
  a: SceneLayoutOverride | null,
  b: SceneLayoutOverride | null,
) =>
  a === null || b === null
    ? a === b
    : samePosition(a.position, b.position) &&
      samePosition(a.rotation, b.rotation) &&
      a.scale === b.scale;

const refreshOverrides = () => {
  for (const record of records.values()) {
    const next = overrideValue(record);
    if (!sameOverride(overrides.get(record.id) ?? null, next))
      overrides.set(record.id, next);
  }
};

const snapshot = (): SceneLayoutSnapshot =>
  Object.freeze({
    enabled,
    selectedId,
    gestureActive,
    canUndo: undoStates.length > 0,
    canRedo: redoStates.length > 0,
    records: Object.freeze(
      [...records.values()]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(publicRecord),
    ),
  });

let currentSnapshot = snapshot();

const publish = () => {
  refreshOverrides();
  currentSnapshot = snapshot();
  for (const listener of listeners) listener();
};

const clearInteractionState = (id: string) => {
  const state = useStacks.getState();
  if (state.hovered === id) state.setHovered(null);
  if (state.dragging === id) state.setDragging(null);
  if (state.focusedInteraction === id) state.setFocusedInteraction(null);
  if (state.pressedInteraction === id) state.setPressedInteraction(null);
};

const restoreScrollInput = () => {
  const state = useStacks.getState();
  if (state.dragging) return;
  const el = state.scrollEl;
  if (!el) return;
  el.style.touchAction = "pan-x";
  el.style.overflowX = "auto";
};

export const sceneLayoutEditorController = {
  subscribe(this: void, listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot: () => currentSnapshot,

  register(target: SceneLayoutTarget) {
    const existing = records.get(target.id);
    if (existing?.root && existing.root !== target.root)
      throw new Error(`[stacks] duplicate layout target: ${target.id}`);

    records.set(target.id, {
      id: target.id,
      label: target.label,
      unitIndex: target.unitIndex,
      authored: tuple(target.authored),
      preview: existing?.preview ?? null,
      authoredRotation: tuple(target.authoredRotation),
      previewRotation: existing?.previewRotation ?? null,
      authoredScale: tuple(target.authoredScale),
      previewScale: existing?.previewScale ?? null,
      root: target.root,
      cancelInteraction: target.cancelInteraction,
    });
    publish();

    return () => {
      const current = records.get(target.id);
      if (current?.root !== target.root) return;
      current.root = null;
      current.cancelInteraction = null;
      if (selectedId === target.id) selectedId = null;
      publish();
    };
  },

  /**
   * Leaving the editor releases the SELECTION and the gizmo, not the layout.
   *
   * It used to snap every edited prop back to its authored spot, which made
   * the one thing the tool is for impossible: move things in free roam, drop
   * back to the docked view, and look at the new arrangement the way a
   * visitor would. The poses now stay until a reload or an explicit reset, so
   * `Grabbable` treats an override as that prop's resting pose and hands it
   * back to ordinary hover, carry, and physics from there.
   *
   * The undo stack stays with them. Edits that survive the toggle and a
   * history that does not is a trap: ⌘Z after re-entering would silently mean
   * something else.
   */
  setEnabled(next: boolean) {
    if (enabled === next) return;
    if (!next) {
      selectedId = null;
      gestureActive = false;
      gestureBaseline = null;
      restoreScrollInput();
    }
    enabled = next;
    for (const record of records.values()) applyRootTransform(record);
    publish();
  },

  select(id: string | null) {
    const record = id ? records.get(id) : null;
    selectedId = enabled && record?.root ? id : null;
    if (selectedId && record) {
      record.cancelInteraction?.();
      clearInteractionState(selectedId);
    }
    if (gestureActive) this.setGestureActive(false);
    publish();
  },

  setGestureActive(next: boolean) {
    if (gestureActive === next) return;
    const wasActive = gestureActive;
    if (!wasActive && next && enabled && selectedId !== null)
      gestureBaseline = captureHistory();
    gestureActive = enabled && selectedId !== null && next;
    const el = useStacks.getState().scrollEl;
    if (gestureActive && el) {
      el.style.touchAction = "none";
      el.style.overflowX = "hidden";
    } else restoreScrollInput();
    if (wasActive && !gestureActive && gestureBaseline) {
      commitHistory(gestureBaseline);
      gestureBaseline = null;
    }
    publish();
  },

  update(id: string, value: SceneLayoutPosition) {
    const record = records.get(id);
    if (!enabled || !record) return false;
    if (!value.every((component) => Number.isFinite(component))) return false;
    const before = gestureActive ? null : captureHistory();
    const clamp = (component: number) =>
      normalized(Math.max(-10, Math.min(10, component)));
    const next = tuple([clamp(value[0]), clamp(value[1]), clamp(value[2])]);
    record.preview = samePosition(record.authored, next) ? null : next;
    draftWriteEligible = true;
    applyRootTransform(record);
    if (before) commitHistory(before);
    publish();
    return true;
  },

  updateRotation(id: string, value: SceneLayoutPosition) {
    const record = records.get(id);
    if (!enabled || !record) return false;
    if (!value.every((component) => Number.isFinite(component))) return false;
    const before = gestureActive ? null : captureHistory();
    const next = tuple([
      normalized(value[0]),
      normalized(value[1]),
      normalized(value[2]),
    ]);
    record.previewRotation = samePosition(record.authoredRotation, next)
      ? null
      : next;
    draftWriteEligible = true;
    applyRootTransform(record);
    if (before) commitHistory(before);
    publish();
    return true;
  },

  updateScale(id: string, value: number) {
    const record = records.get(id);
    if (!enabled || !record) return false;
    if (!Number.isFinite(value)) return false;
    const before = gestureActive ? null : captureHistory();
    const next = normalized(Math.max(0.05, Math.min(10, value)));
    record.previewScale = next === 1 ? null : next;
    draftWriteEligible = true;
    applyRootTransform(record);
    if (before) commitHistory(before);
    publish();
    return true;
  },

  updateTransform(
    id: string,
    value: Readonly<{
      position: SceneLayoutPosition;
      rotation: SceneLayoutPosition;
    }>,
  ) {
    const record = records.get(id);
    if (!enabled || !record) return false;
    const components = [...value.position, ...value.rotation];
    if (!components.every((component) => Number.isFinite(component)))
      return false;
    const before = gestureActive ? null : captureHistory();
    const clampPosition = (component: number) =>
      normalized(Math.max(-10, Math.min(10, component)));
    const position = tuple([
      clampPosition(value.position[0]),
      clampPosition(value.position[1]),
      clampPosition(value.position[2]),
    ]);
    const rotation = tuple([
      normalized(value.rotation[0]),
      normalized(value.rotation[1]),
      normalized(value.rotation[2]),
    ]);
    record.preview = samePosition(record.authored, position) ? null : position;
    record.previewRotation = samePosition(record.authoredRotation, rotation)
      ? null
      : rotation;
    draftWriteEligible = true;
    applyRootTransform(record);
    if (before) commitHistory(before);
    publish();
    return true;
  },

  nudgeSelected(delta: SceneLayoutPosition) {
    if (!selectedId) return false;
    const record = records.get(selectedId);
    if (!enabled || !record?.root) return false;
    const current = record.preview ?? record.authored;
    return this.update(selectedId, [
      current[0] + delta[0],
      current[1] + delta[1],
      current[2] + delta[2],
    ]);
  },

  reset(id: string) {
    const record = records.get(id);
    if (!record) return;
    const before = captureHistory();
    record.preview = null;
    record.previewRotation = null;
    record.previewScale = null;
    draftWriteEligible = true;
    applyRootTransform(record);
    commitHistory(before);
    publish();
  },

  resetAll() {
    if (gestureActive) this.setGestureActive(false);
    const before = captureHistory();
    for (const record of records.values()) {
      record.preview = null;
      record.previewRotation = null;
      record.previewScale = null;
      applyRootTransform(record);
    }
    draftWriteEligible = true;
    selectedId = null;
    commitHistory(before);
    publish();
  },

  undo() {
    if (!enabled || undoStates.length === 0) return false;
    if (gestureActive) this.setGestureActive(false);
    const previous = undoStates.pop();
    if (!previous) return false;
    redoStates.push(captureHistory());
    applyHistory(previous);
    draftWriteEligible = true;
    publish();
    return true;
  },

  redo() {
    if (!enabled || redoStates.length === 0) return false;
    const next = redoStates.pop();
    if (!next) return false;
    undoStates.push(captureHistory());
    applyHistory(next);
    draftWriteEligible = true;
    publish();
    return true;
  },

  owns(id: string) {
    if (!enabled) return false;
    const record = records.get(id);
    return (
      selectedId === id ||
      record?.preview !== null ||
      record?.previewRotation !== null ||
      record?.previewScale !== null
    );
  },

  canSelect(id: string) {
    return enabled && records.get(id)?.root != null;
  },

  positionFor(id: string): SceneLayoutPosition | null {
    const record = records.get(id);
    if (!record || !this.owns(id)) return null;
    return record.preview ?? record.authored;
  },

  rotationFor(id: string): SceneLayoutPosition | null {
    const record = records.get(id);
    if (!record || !this.owns(id)) return null;
    return record.previewRotation ?? record.authoredRotation;
  },

  scaleFor(id: string): number | null {
    const record = records.get(id);
    if (!record || !this.owns(id)) return null;
    return record.previewScale ?? 1;
  },

  /** The persisted pose, editor enabled or not. Null once reset. */
  overrideFor(id: string): SceneLayoutOverride | null {
    return overrides.get(id) ?? null;
  },

  selectedRoot() {
    return selectedId ? (records.get(selectedId)?.root ?? null) : null;
  },

  export(): SceneLayoutExportRecord[] {
    return [...records.values()]
      .filter(
        (record) =>
          record.preview !== null ||
          record.previewRotation !== null ||
          record.previewScale !== null,
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((record) => {
        const preview = record.preview ?? record.authored;
        const previewRotation =
          record.previewRotation ?? record.authoredRotation;
        const previewScale = record.previewScale ?? 1;
        return {
          id: record.id,
          unitIndex: record.unitIndex,
          label: record.label,
          authored: tuple(record.authored),
          preview: tuple(preview),
          delta: tuple([
            normalized(preview[0] - record.authored[0]),
            normalized(preview[1] - record.authored[1]),
            normalized(preview[2] - record.authored[2]),
          ]),
          authoredRotation: tuple(record.authoredRotation),
          previewRotation: tuple(previewRotation),
          rotationDelta: tuple([
            normalized(previewRotation[0] - record.authoredRotation[0]),
            normalized(previewRotation[1] - record.authoredRotation[1]),
            normalized(previewRotation[2] - record.authoredRotation[2]),
          ]),
          authoredScale: tuple(record.authoredScale),
          previewScale,
          scaleRatio: previewScale,
        };
      });
  },

  resetForTests() {
    records.clear();
    overrides.clear();
    enabled = false;
    selectedId = null;
    gestureActive = false;
    gestureBaseline = null;
    draftWriteEligible = false;
    undoStates.length = 0;
    redoStates.length = 0;
    currentSnapshot = snapshot();
  },
};

declare global {
  interface Window {
    __stacksLayoutDraftAutosaveCleanup?: () => void;
  }
}

const installDraftAutosave = () => {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined")
    return;

  window.__stacksLayoutDraftAutosaveCleanup?.();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRecords = "";

  const payload = () =>
    createSceneLayoutDraft(sceneLayoutEditorController.export());
  const save = () => {
    timer = null;
    if (!draftWriteEligible) return;
    const records = JSON.stringify(sceneLayoutEditorController.export());
    if (records === lastRecords) return;
    lastRecords = records;
    void fetch(SCENE_LAYOUT_DRAFT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload()),
      keepalive: true,
    }).catch(() => undefined);
  };
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(save, 150);
  };
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!draftWriteEligible) return;
    const records = JSON.stringify(sceneLayoutEditorController.export());
    lastRecords = records;
    navigator.sendBeacon(
      SCENE_LAYOUT_DRAFT_ENDPOINT,
      new Blob([JSON.stringify(payload())], { type: "application/json" }),
    );
  };

  const unsubscribe = sceneLayoutEditorController.subscribe(schedule);
  window.addEventListener("pagehide", flush);
  window.__stacksLayoutDraftAutosaveCleanup = () => {
    flush();
    unsubscribe();
    window.removeEventListener("pagehide", flush);
  };
  schedule();
};

installDraftAutosave();
