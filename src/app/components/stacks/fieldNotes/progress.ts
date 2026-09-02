"use client";

import { useSyncExternalStore } from "react";

import { FIELD_NOTES, FIELD_NOTE_BY_ID, type FieldNoteId } from "./catalog";
import { resetFieldNotePlacements } from "./placement";
import {
  type VisionRideSessionProfile,
  visionRideFullStack,
} from "../visionRide/visionRideProfiles";

export const FIELD_NOTES_STORAGE_KEY = "stacks:field-notes:v1";
export const FIELD_NOTES_VERSION = 1;

type SceneArtifactCollection =
  | "training-analysis"
  | "training-history"
  | "projects-homework"
  | "about-photos"
  | "training-photos"
  | "projects-photos"
  | "talks-photos"
  | "systems-photos";

export type FieldNoteEvent =
  | Readonly<{ type: "unit-arrived"; unitIndex: number }>
  | Readonly<{
      type: "portal-activated";
      portalId: string;
      unitIndex: number;
      /** Where the portal goes: an external href or an internal route name.
       * Several props can share one destination (all six dice open Liar's
       * Dice), so Open House counts destinations rather than props. */
      destination: string;
    }>
  | Readonly<{ type: "photo-mode-entered" }>
  | Readonly<{
      type: "prop-carried";
      propId: string;
      unitIndex: number;
      massKg: number;
    }>
  | Readonly<{
      type: "interaction-activated";
      interactionId: string;
      unitIndex: number | null;
    }>
  | Readonly<{ type: "seat-entered" }>
  | Readonly<{ type: "coordination-shockwave" }>
  | Readonly<{
      type: "pixel-look-entered";
      look: "levels" | "palette";
    }>
  | Readonly<{ type: "book-preview-opened" }>
  | Readonly<{
      type: "artifact-opened";
      artifactId: string;
      collection: SceneArtifactCollection;
    }>
  | Readonly<{ type: "butterfly-landed-on-held-prop" }>
  | Readonly<{ type: "golf-ball-holed"; firstShot: boolean }>
  | Readonly<{ type: "golf-prop-struck"; propId?: string }>
  | Readonly<{ type: "session-started"; day: string }>
  | Readonly<{ type: "prop-carried-far"; propId: string }>
  | Readonly<{ type: "dice-stacked" }>
  | Readonly<{
      type: "vision-ride-entered";
      profile: VisionRideSessionProfile;
    }>
  | Readonly<{ type: "stamp-placed"; noteId: string }>;

/** Distinct portal destinations behind Open House. The room holds roughly
 * eighteen; eight keeps the stamp about breadth without demanding a census. */
export const OPEN_HOUSE_DESTINATIONS = 8;

/** World units one prop must travel in a single uninterrupted hold before
 * Grabbable reports it carried far. 26.2 for the marathon, at a scale where a
 * full sweep across one shelf is about three units. */
export const LONG_HAUL_CARRY_UNITS = 26.2;

/** Distinct earned stamps a visitor must drag to a new spot in the album
 * before Philatelist is granted. Five asks for a deliberate arranging habit
 * without demanding the whole collection move. */
export const PHILATELIST_STAMPS = 5;

/** Local calendar day for The Regular. Local rather than UTC because "come
 * back tomorrow" means the visitor's tomorrow. */
export function fieldNotesLocalDay(date = new Date()) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export type FieldNotesProgress = Readonly<{
  version: typeof FIELD_NOTES_VERSION;
  earned: Partial<Record<FieldNoteId, number>>;
  visitedUnits: readonly number[];
  activatedPortals: readonly string[];
  portalDestinations: readonly string[];
  carriedProps: Readonly<Record<string, number>>;
  activatedInteractions: readonly string[];
  pixelLooks: readonly ("levels" | "palette")[];
  artifactCollections: readonly SceneArtifactCollection[];
  placedStamps: readonly string[];
  firstVisitDay: string | null;
}>;

export type FieldNotesReduction = Readonly<{
  progress: FieldNotesProgress;
  awarded: readonly FieldNoteId[];
}>;

export const EMPTY_FIELD_NOTES_PROGRESS: FieldNotesProgress = Object.freeze({
  version: FIELD_NOTES_VERSION,
  earned: Object.freeze({}),
  visitedUnits: Object.freeze([]),
  activatedPortals: Object.freeze([]),
  portalDestinations: Object.freeze([]),
  carriedProps: Object.freeze({}),
  activatedInteractions: Object.freeze([]),
  pixelLooks: Object.freeze([]),
  artifactCollections: Object.freeze([]),
  placedStamps: Object.freeze([]),
  firstVisitDay: null,
});

const REQUIRED_PHOTO_COLLECTIONS: readonly SceneArtifactCollection[] = [
  "about-photos",
  "training-photos",
  "systems-photos",
  "projects-photos",
  "talks-photos",
];

function unique<T>(values: readonly T[], value: T) {
  return values.includes(value) ? values : [...values, value];
}

function normalizedUnit(unitIndex: number) {
  return Number.isInteger(unitIndex) && unitIndex >= 0 && unitIndex < 7
    ? unitIndex
    : null;
}

function award(
  earned: Partial<Record<FieldNoteId, number>>,
  awarded: FieldNoteId[],
  id: FieldNoteId,
  now: number,
) {
  if (earned[id] !== undefined) return;
  earned[id] = now;
  awarded.push(id);
}

/** Pure semantic reducer. It stores only the smallest sets needed to resolve
 * multi-step discoveries, never a clickstream or browsing history. */
export function reduceFieldNotesProgress(
  current: FieldNotesProgress,
  event: FieldNoteEvent,
  now = Date.now(),
): FieldNotesReduction {
  let visitedUnits = current.visitedUnits;
  let activatedPortals = current.activatedPortals;
  let portalDestinations = current.portalDestinations;
  let carriedProps = current.carriedProps;
  let activatedInteractions = current.activatedInteractions;
  let pixelLooks = current.pixelLooks;
  let artifactCollections = current.artifactCollections;
  let placedStamps = current.placedStamps;
  let firstVisitDay = current.firstVisitDay;
  const earned = { ...current.earned };
  const awarded: FieldNoteId[] = [];

  switch (event.type) {
    case "unit-arrived": {
      const unit = normalizedUnit(event.unitIndex);
      if (unit !== null) visitedUnits = unique(visitedUnits, unit);
      if (visitedUnits.length === 7) award(earned, awarded, "grand-tour", now);
      break;
    }
    case "portal-activated":
      activatedPortals = unique(activatedPortals, event.portalId);
      portalDestinations = unique(portalDestinations, event.destination);
      award(earned, awarded, "first-portal", now);
      if (portalDestinations.length >= OPEN_HOUSE_DESTINATIONS)
        award(earned, awarded, "open-house", now);
      break;
    case "photo-mode-entered":
      award(earned, awarded, "photo-finish", now);
      break;
    case "prop-carried": {
      const unit = normalizedUnit(event.unitIndex);
      const carriedUnit = unit ?? event.unitIndex;
      if (carriedProps[event.propId] !== carriedUnit)
        carriedProps = {
          ...carriedProps,
          [event.propId]: carriedUnit,
        };
      award(earned, awarded, "curious-hands", now);
      const movedUnits = new Set(
        Object.values(carriedProps).filter(
          (value) => normalizedUnit(value) !== null,
        ),
      );
      if (movedUnits.size === 7) award(earned, awarded, "around-the-room", now);
      if (Object.keys(carriedProps).length >= 10)
        award(earned, awarded, "rearranged", now);
      if (event.propId === "grab:barbell" && event.massKg >= 60)
        award(earned, awarded, "heavy-lifting", now);
      break;
    }
    case "interaction-activated": {
      const id = event.interactionId;
      activatedInteractions = unique(activatedInteractions, id);
      if (id === "egg:globe") award(earned, awarded, "global-perspective", now);
      if (id === "egg:chair") award(earned, awarded, "a-capital-view", now);
      if (/^egg:lamp:\d+$/.test(id)) award(earned, awarded, "task-light", now);
      if (id.startsWith("egg:lamp:floor:"))
        award(earned, awarded, "beacon", now);
      if (id === "egg:clock:alarm") award(earned, awarded, "early-alarm", now);
      if (id === "egg:clock:floor" || id === "egg:clock:case")
        award(earned, awarded, "old-time", now);
      if (id === "egg:tea") award(earned, awarded, "tea-time", now);
      if (
        [
          "grab:shaker:training",
          "grab:shaker:training-navy",
          "grab:shaker:training-amber",
        ].every((shaker) => activatedInteractions.includes(shaker))
      )
        award(earned, awarded, "shake-well", now);
      if (id === "sky:goldengate")
        award(earned, awarded, "fireworks-over-the-bay", now);
      if (id === "sky:salesforce") award(earned, awarded, "crowned", now);
      if (id === "sky:jasper") award(earned, awarded, "floor-33", now);
      break;
    }
    case "seat-entered":
      award(earned, awarded, "a-capital-view", now);
      break;
    case "coordination-shockwave":
      award(earned, awarded, "ripple-effect", now);
      break;
    case "pixel-look-entered":
      pixelLooks = unique(pixelLooks, event.look);
      if (pixelLooks.length === 2)
        award(earned, awarded, "another-resolution", now);
      break;
    case "book-preview-opened":
      award(earned, awarded, "spine-cracked", now);
      break;
    case "artifact-opened":
      artifactCollections = unique(artifactCollections, event.collection);
      if (
        REQUIRED_PHOTO_COLLECTIONS.every((collection) =>
          artifactCollections.includes(collection),
        )
      )
        award(earned, awarded, "family-album", now);
      if (
        event.collection === "training-analysis" ||
        event.collection === "training-history"
      )
        award(earned, awarded, "behind-the-numbers", now);
      break;
    case "butterfly-landed-on-held-prop":
      award(earned, awarded, "butterfly-effect", now);
      break;
    case "golf-ball-holed":
      if (event.firstShot) award(earned, awarded, "hole-in-one", now);
      break;
    case "golf-prop-struck":
      award(earned, awarded, "wrong-sport", now);
      break;
    case "session-started":
      if (firstVisitDay === null) firstVisitDay = event.day;
      else if (firstVisitDay !== event.day)
        award(earned, awarded, "the-regular", now);
      break;
    case "prop-carried-far":
      award(earned, awarded, "long-haul", now);
      break;
    case "dice-stacked":
      award(earned, awarded, "full-stack", now);
      break;
    case "vision-ride-entered":
      award(earned, awarded, "future-perfect", now);
      if (event.profile.pixelLook !== "off")
        award(earned, awarded, "reality-distortion-field", now);
      if (event.profile.night) award(earned, awarded, "night-shift", now);
      if (event.profile.redline) award(earned, awarded, "redline", now);
      if (event.profile.golf) award(earned, awarded, "fore-sight", now);
      if (visionRideFullStack(event.profile))
        award(earned, awarded, "reality-stack", now);
      break;
    case "stamp-placed":
      if (FIELD_NOTE_BY_ID.has(event.noteId as FieldNoteId))
        placedStamps = unique(placedStamps, event.noteId);
      if (placedStamps.length >= PHILATELIST_STAMPS)
        award(earned, awarded, "philatelist", now);
      break;
  }

  // The capstone only needs re-checking when this event awarded something:
  // the set of earned notes cannot otherwise have grown.
  if (
    awarded.length > 0 &&
    FIELD_NOTES.every(
      (note) => note.id === "full-journal" || earned[note.id] !== undefined,
    )
  )
    award(earned, awarded, "full-journal", now);

  if (
    awarded.length === 0 &&
    visitedUnits === current.visitedUnits &&
    activatedPortals === current.activatedPortals &&
    portalDestinations === current.portalDestinations &&
    carriedProps === current.carriedProps &&
    activatedInteractions === current.activatedInteractions &&
    pixelLooks === current.pixelLooks &&
    artifactCollections === current.artifactCollections &&
    placedStamps === current.placedStamps &&
    firstVisitDay === current.firstVisitDay
  ) {
    return { progress: current, awarded };
  }

  return {
    progress: {
      version: FIELD_NOTES_VERSION,
      earned,
      visitedUnits,
      activatedPortals,
      portalDestinations,
      carriedProps,
      activatedInteractions,
      pixelLooks,
      artifactCollections,
      placedStamps,
      firstVisitDay,
    },
    awarded,
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is number =>
          typeof entry === "number" && Number.isFinite(entry),
      )
    : [];
}

export function parseFieldNotesProgress(raw: string | null) {
  if (!raw) return EMPTY_FIELD_NOTES_PROGRESS;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.version !== FIELD_NOTES_VERSION)
      return EMPTY_FIELD_NOTES_PROGRESS;
    const earnedInput =
      value.earned && typeof value.earned === "object"
        ? (value.earned as Record<string, unknown>)
        : {};
    const earned: Partial<Record<FieldNoteId, number>> = {};
    for (const [id, at] of Object.entries(earnedInput)) {
      if (
        FIELD_NOTE_BY_ID.has(id as FieldNoteId) &&
        typeof at === "number" &&
        Number.isFinite(at)
      )
        earned[id as FieldNoteId] = at;
    }
    if (
      !FIELD_NOTES.every(
        (note) =>
          note.id === "full-journal" || earned[note.id] !== undefined,
      )
    )
      delete earned["full-journal"];
    const carriedInput =
      value.carriedProps && typeof value.carriedProps === "object"
        ? (value.carriedProps as Record<string, unknown>)
        : {};
    const carriedProps: Record<string, number> = {};
    for (const [id, unit] of Object.entries(carriedInput))
      if (typeof unit === "number" && Number.isFinite(unit))
        carriedProps[id] = unit;
    const pixelLooks = stringArray(value.pixelLooks).filter(
      (look): look is "levels" | "palette" =>
        look === "levels" || look === "palette",
    );
    const artifactCollections = stringArray(
      value.artifactCollections,
    ) as SceneArtifactCollection[];
    return {
      version: FIELD_NOTES_VERSION,
      earned,
      visitedUnits: numberArray(value.visitedUnits),
      activatedPortals: stringArray(value.activatedPortals),
      portalDestinations: stringArray(value.portalDestinations),
      carriedProps,
      activatedInteractions: stringArray(value.activatedInteractions),
      pixelLooks,
      artifactCollections,
      placedStamps: stringArray(value.placedStamps).filter((id) =>
        FIELD_NOTE_BY_ID.has(id as FieldNoteId),
      ),
      firstVisitDay:
        typeof value.firstVisitDay === "string" ? value.firstVisitDay : null,
    } satisfies FieldNotesProgress;
  } catch {
    return EMPTY_FIELD_NOTES_PROGRESS;
  }
}

type ProgressListener = () => void;
type AwardListener = (ids: readonly FieldNoteId[]) => void;

const progressListeners = new Set<ProgressListener>();
const awardListeners = new Set<AwardListener>();
let progress = EMPTY_FIELD_NOTES_PROGRESS;
let hydrated = false;
let storageListening = false;

function publishProgress() {
  for (const listener of progressListeners) listener();
}

function persistProgress() {
  try {
    window.localStorage.setItem(
      FIELD_NOTES_STORAGE_KEY,
      JSON.stringify(progress),
    );
  } catch {
    // Private browsing and storage policies may deny access. Progress remains
    // usable for this document without turning persistence into a prerequisite.
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return false;
  hydrated = true;
  try {
    progress = parseFieldNotesProgress(
      window.localStorage.getItem(FIELD_NOTES_STORAGE_KEY),
    );
  } catch {
    progress = EMPTY_FIELD_NOTES_PROGRESS;
  }
  return true;
}

export function startFieldNotes() {
  if (ensureHydrated()) publishProgress();
  if (storageListening || typeof window === "undefined") return () => undefined;
  storageListening = true;
  const onStorage = (event: StorageEvent) => {
    if (event.key !== FIELD_NOTES_STORAGE_KEY) return;
    progress = parseFieldNotesProgress(event.newValue);
    publishProgress();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
    storageListening = false;
  };
}

export function recordFieldNoteEvent(event: FieldNoteEvent) {
  if (typeof window === "undefined") return [] as readonly FieldNoteId[];
  ensureHydrated();
  const reduction = reduceFieldNotesProgress(progress, event);
  if (reduction.progress === progress) return reduction.awarded;
  progress = reduction.progress;
  persistProgress();
  publishProgress();
  if (reduction.awarded.length)
    for (const listener of awardListeners) listener(reduction.awarded);
  return reduction.awarded;
}

export function resetFieldNotes() {
  progress = EMPTY_FIELD_NOTES_PROGRESS;
  hydrated = true;
  resetFieldNotePlacements();
  try {
    window.localStorage.removeItem(FIELD_NOTES_STORAGE_KEY);
  } catch {
    // See persistProgress. Reset still applies to the current document.
  }
  publishProgress();
}

/** Debug-only state control. It updates the visible collection without
 * pretending that each discovery's real semantic event occurred. */
export function setAllFieldNotesFound(found: boolean, now = Date.now()) {
  if (typeof window === "undefined") return;
  if (!found) {
    resetFieldNotes();
    return;
  }

  ensureHydrated();
  if (FIELD_NOTES.every((note) => progress.earned[note.id] !== undefined))
    return;

  progress = {
    ...progress,
    earned: Object.fromEntries(
      FIELD_NOTES.map((note) => [note.id, progress.earned[note.id] ?? now]),
    ),
  };
  persistProgress();
  publishProgress();
}

/** Replays the real notification channel without earning or persisting a
 * discovery. This keeps notification testing independent from progress. */
export function previewFieldNoteAward(id: FieldNoteId) {
  if (!FIELD_NOTE_BY_ID.has(id)) return false;
  for (const listener of awardListeners) listener([id]);
  return true;
}

export function subscribeFieldNoteAwards(listener: AwardListener) {
  awardListeners.add(listener);
  return () => {
    awardListeners.delete(listener);
  };
}

function subscribe(listener: ProgressListener) {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

function getSnapshot() {
  return progress;
}

export function useFieldNotesProgress() {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_FIELD_NOTES_PROGRESS,
  );
}
