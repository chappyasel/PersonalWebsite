import { FIELD_NOTE_BY_ID, type FieldNoteId } from "./catalog";

export const FIELD_NOTE_PLACEMENT_STORAGE_KEY =
  "stacks:field-notes:placements:v2";
export const FIELD_NOTE_OVERVIEW_PLACEMENT_STORAGE_KEY =
  "stacks:field-notes:overview-placements:v1";
export const FIELD_NOTE_PLACEMENT_CHANGE_EVENT =
  "stacks:field-notes:placements-changed";
const LEGACY_FIELD_NOTE_PLACEMENT_STORAGE_KEY =
  "stacks:field-notes:placements:v1";

/** A stamp arranged on its catalog page and the same stamp arranged in the
 * overview's newest-findings tray are separate compositions. Each scope keeps
 * its own store so one drag never teleports the other copy. */
export type FieldNotePlacementScope = "page" | "overview";

export function fieldNotePlacementStorageKey(scope: FieldNotePlacementScope) {
  return scope === "overview"
    ? FIELD_NOTE_OVERVIEW_PLACEMENT_STORAGE_KEY
    : FIELD_NOTE_PLACEMENT_STORAGE_KEY;
}

export type FieldNotePlacement = Readonly<{
  placed: boolean;
  x: number;
  y: number;
  tilt: number;
}>;

export const CENTERED_FIELD_NOTE_PLACEMENT: FieldNotePlacement = Object.freeze({
  placed: false,
  x: 0,
  y: 0,
  tilt: 0,
});

const MAX_TILT = 3;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeFieldNotePlacement(
  value: Partial<FieldNotePlacement>,
): FieldNotePlacement {
  if (value.placed !== true) return CENTERED_FIELD_NOTE_PLACEMENT;
  return {
    placed: true,
    x: clamp(Number.isFinite(value.x) ? value.x! : 0.5, 0, 1),
    y: clamp(Number.isFinite(value.y) ? value.y! : 0.5, 0, 1),
    tilt: clamp(
      Number.isFinite(value.tilt) ? value.tilt! : 0,
      -MAX_TILT,
      MAX_TILT,
    ),
  };
}

export function parseFieldNotePlacements(raw: string | null) {
  const placements: Partial<Record<FieldNoteId, FieldNotePlacement>> = {};
  if (!raw) return placements;

  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    for (const [id, candidate] of Object.entries(value)) {
      if (
        !FIELD_NOTE_BY_ID.has(id as FieldNoteId) ||
        !candidate ||
        typeof candidate !== "object"
      )
        continue;
      placements[id as FieldNoteId] = normalizeFieldNotePlacement(
        candidate as Partial<FieldNotePlacement>,
      );
    }
  } catch {
    return placements;
  }

  return placements;
}

export function readFieldNotePlacement(
  id: FieldNoteId,
  scope: FieldNotePlacementScope = "page",
) {
  if (typeof window === "undefined") return CENTERED_FIELD_NOTE_PLACEMENT;
  try {
    return (
      parseFieldNotePlacements(
        window.localStorage.getItem(fieldNotePlacementStorageKey(scope)),
      )[id] ?? CENTERED_FIELD_NOTE_PLACEMENT
    );
  } catch {
    return CENTERED_FIELD_NOTE_PLACEMENT;
  }
}

export function readFieldNotePlacements(
  scope: FieldNotePlacementScope = "page",
) {
  if (typeof window === "undefined")
    return {} as Partial<Record<FieldNoteId, FieldNotePlacement>>;
  try {
    return parseFieldNotePlacements(
      window.localStorage.getItem(fieldNotePlacementStorageKey(scope)),
    );
  } catch {
    return {} as Partial<Record<FieldNoteId, FieldNotePlacement>>;
  }
}

export function saveFieldNotePlacement(
  id: FieldNoteId,
  placement: FieldNotePlacement,
  scope: FieldNotePlacementScope = "page",
) {
  if (typeof window === "undefined") return;
  try {
    const storageKey = fieldNotePlacementStorageKey(scope);
    const placements = parseFieldNotePlacements(
      window.localStorage.getItem(storageKey),
    );
    placements[id] = normalizeFieldNotePlacement(placement);
    window.localStorage.setItem(storageKey, JSON.stringify(placements));
    window.dispatchEvent?.(new Event(FIELD_NOTE_PLACEMENT_CHANGE_EVENT));
  } catch {
    // Placement is decorative. Keep dragging usable for this render when
    // browser storage is unavailable.
  }
}

export function resetFieldNotePlacements() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(FIELD_NOTE_PLACEMENT_STORAGE_KEY);
    window.localStorage.removeItem(FIELD_NOTE_OVERVIEW_PLACEMENT_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_FIELD_NOTE_PLACEMENT_STORAGE_KEY);
  } catch {
    // A reset still applies to progress when browser storage is unavailable.
  }
  window.dispatchEvent?.(new Event(FIELD_NOTE_PLACEMENT_CHANGE_EVENT));
}

export function resetFieldNotePlacementIds(ids: readonly FieldNoteId[]) {
  const removed: Partial<Record<FieldNoteId, FieldNotePlacement>> = {};
  if (typeof window === "undefined") return removed;
  try {
    const placements = readFieldNotePlacements();
    for (const id of ids) {
      if (!placements[id]?.placed) continue;
      removed[id] = placements[id];
      delete placements[id];
    }
    window.localStorage.setItem(
      FIELD_NOTE_PLACEMENT_STORAGE_KEY,
      JSON.stringify(placements),
    );
  } catch {
    // The visible stamps still sync to their mounts when storage is blocked.
  }
  window.dispatchEvent?.(new Event(FIELD_NOTE_PLACEMENT_CHANGE_EVENT));
  return removed;
}

export function restoreFieldNotePlacements(
  restored: Partial<Record<FieldNoteId, FieldNotePlacement>>,
) {
  if (typeof window === "undefined") return;
  try {
    const placements = readFieldNotePlacements();
    for (const [id, placement] of Object.entries(restored)) {
      if (!placement || !FIELD_NOTE_BY_ID.has(id as FieldNoteId)) continue;
      placements[id as FieldNoteId] = normalizeFieldNotePlacement(placement);
    }
    window.localStorage.setItem(
      FIELD_NOTE_PLACEMENT_STORAGE_KEY,
      JSON.stringify(placements),
    );
  } catch {
    // Undo is best-effort when browser storage is unavailable.
  }
  window.dispatchEvent?.(new Event(FIELD_NOTE_PLACEMENT_CHANGE_EVENT));
}
