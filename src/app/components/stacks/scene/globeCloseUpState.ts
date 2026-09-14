// The About globe up close: its approach controller, the hand that turns it,
// the tilt a drag gives it, and which map mark the pointer is over.
//
// All of it is imperative, per-frame state shared between the carrier in
// UnitAbout (which owns the tap and the drag threshold), GlobeCloseUp (which
// flies the globe and raycasts the marks) and the DOM label in the chrome
// layer. None of it goes through React state except the hover, which the
// label subscribes to.
import { recordFieldNoteEvent } from "../fieldNotes/progress";
import { roomWindowEvents } from "../room/roomEvents";
import { touchWorldRef } from "../store";

import {
  LIVED_PLACES,
  type LivedPlace,
  VISITED_PLACES,
  type VisitedPlace,
} from "./aboutTravel";
import { AIC_CHAPTERS, type AicChapter } from "./aicChapters";
import { mergeGlobeMarkers } from "./globeBall";
import { globeChapterHover } from "./globeChapterHover";
import type { PortalAnalyticsContext, PropTarget } from "./links";
import { createPropApproach } from "./propApproachState";
import { createSpinHandle } from "./spinHandle";

// Keyed by the carrier's hover key: while the globe is up, only it may hover.
export const globeApproach = createPropApproach("egg:globe");
export const globeSpin = createSpinHandle((turn) => {
  if (tallyGlobeHandLap(turn))
    recordFieldNoteEvent({ type: "globe-turned-by-hand" });
});
/** Opening pitch plus drag adjustments, radians, read by PropApproach. */
export const globeTilt = { current: 0 };

/** The near globe turns by dragging; only chapter marks open a link. */
export function globeCursor(hovered: string | null) {
  if (!globeApproach.near) return undefined;
  if (globeSpin.state.held) return "grabbing";
  if (hovered !== globeApproach.id) return undefined;
  return globeChapterHover.current?.kind === "chapter" ? "pointer" : "grab";
}
/**
 * Cast at the published touch point right now and set the hover from it.
 * GlobeCloseUp installs it while the globe is near; it is the same sampler
 * the press-time latch runs. Product code does not call it: the dev hook
 * (`window.__stacks.globe`) does, so a headless run can ask "what would a
 * finger here reach" without moving the camera. Null when the globe is not
 * up close.
 */
export const globeMarkProbe = { current: null as (() => void) | null };

/** World extents of the globe at its About scale, for framing the approach.
 * The prop is 0.35 x 0.49 at scale 1 and stands at 2.5179. */
export const GLOBE_APPROACH_WIDTH = 0.5;
export const GLOBE_APPROACH_HEIGHT = 0.71;
/** A little more of the frame than the Mac takes: a sphere has no screen to
 * read, it is looked around, and the marks are small. */
export const GLOBE_APPROACH_FILL = 0.68;

/** Drag sensitivity before momentum and friction are applied. */
export const GLOBE_DRAG_PX_PER_LAP = 900;
export const GLOBE_DRAG_RADIANS_PER_PX = (Math.PI * 2) / GLOBE_DRAG_PX_PER_LAP;
/** Gentle vertical input. Positive pitch reveals the northern hemisphere;
 * looking up underneath the globe only needs a small amount of travel. */
export const GLOBE_TILT_RADIANS_PER_PX = 0.002;
/** Open looking down toward the northern hemisphere, where most marks sit. */
export const GLOBE_TILT_DEFAULT = (28 * Math.PI) / 180;
export const GLOBE_TILT_DOWN_LIMIT = 0.6;
export const GLOBE_TILT_UP_LIMIT = 0.12;
export const GLOBE_TILT_LAMBDA = 6;
/** A full lap turned by hand while up close earns Global Perspective. */
export const GLOBE_HAND_LAP = Math.PI * 2;
/** Where a chapter mark leads. The site's chapter pages are keyed by the
 * same slug the platform's public list uses. */
export const AIC_SITE = "https://aicollective.com";
export const GLOBE_CHAPTER_PORTAL_ID = "globe:chapter";

export type GlobeChapterCluster = Readonly<{
  lat: number;
  lon: number;
  chapters: readonly AicChapter[];
}>;

let clusters: GlobeChapterCluster[] | null = null;
let visitedClusters: VisitedPlace[] | null = null;
let livedClusters: LivedPlace[] | null = null;

/** The marks on the ball, in the order dressGlobeBall instances them, with
 * the chapters each one stands for. Same merge, same input, same order. */
export function globeChapterClusters(): readonly GlobeChapterCluster[] {
  clusters ??= mergeGlobeMarkers(AIC_CHAPTERS).map((cluster) => ({
    lat: cluster.lat,
    lon: cluster.lon,
    chapters: cluster.members.map((index) => AIC_CHAPTERS[index]!),
  }));
  return clusters;
}

export function globeVisitedPlaceClusters(): readonly VisitedPlace[] {
  visitedClusters ??= mergeGlobeMarkers(VISITED_PLACES).map(
    (cluster) => VISITED_PLACES[cluster.members[0]!]!,
  );
  return visitedClusters;
}

/** The red layer uses the same clustering pass as the renderer. These five
 * places are far enough apart that every cluster contains one place. */
export function globeLivedPlaceClusters(): readonly LivedPlace[] {
  livedClusters ??= mergeGlobeMarkers(LIVED_PLACES).map(
    (cluster) => LIVED_PLACES[cluster.members[0]!]!,
  );
  return livedClusters;
}

export {
  type GlobeChapterHover,
  globeChapterHover,
  globeChapterLabel,
  useGlobeChapterHover,
} from "./globeChapterHover";

/** Where a tap on a mark goes: the chapter's page for a single chapter, the
 * chapters map for a merged mark. */
export function globeChapterTarget(
  chapters: readonly AicChapter[],
): PropTarget {
  const only = chapters.length === 1 ? chapters[0] : undefined;
  return only
    ? {
        href: `${AIC_SITE}/chapters/${encodeURIComponent(only.id)}`,
        label: `${only.name} chapter`,
        external: true,
      }
    : {
        href: `${AIC_SITE}/chapters`,
        label: "The AI Collective chapters",
        external: true,
      };
}

export function openGlobeChapter(
  chapters: readonly AicChapter[],
  open: (target: PropTarget, context: PortalAnalyticsContext) => void,
  unitIndex: number,
) {
  open(globeChapterTarget(chapters), {
    portalId: GLOBE_CHAPTER_PORTAL_ID,
    unitIndex,
  });
}

/** A stationary release on the globe carrier. */
export function tapGlobe(
  open: (target: PropTarget, context: PortalAnalyticsContext) => void,
  unitIndex: number,
) {
  if (!globeApproach.near) {
    globeApproach.approach();
    return;
  }
  if (
    touchWorldRef.interactionPointerType === "touch" &&
    !globeChapterHover.selectForTouch()
  )
    return;
  const hovered = globeChapterHover.current;
  if (hovered?.kind === "chapter")
    openGlobeChapter(hovered.chapters, open, unitIndex);
}

/**
 * Convert pointer displacement into spin input and a bounded pitch target.
 * The spin handle applies the input as force on its next frame.
 */
export function globeDragStep({
  dx,
  dy,
  tilt,
}: {
  dx: number;
  dy: number;
  tilt: number;
}): { turn: number; tilt: number } {
  return {
    turn: dx * GLOBE_DRAG_RADIANS_PER_PX,
    tilt: Math.max(
      -GLOBE_TILT_UP_LIMIT,
      Math.min(GLOBE_TILT_DOWN_LIMIT, tilt + dy * GLOBE_TILT_RADIANS_PER_PX),
    ),
  };
}

let lapTurned = 0;
let lapAwarded = false;

/** Reset the hand-lap tally: each approach is a fresh chance. */
export function resetGlobeHandLap() {
  lapTurned = 0;
  lapAwarded = false;
}

/** Feed a hand turn into the lap tally; the stamp fires once per approach
 * when the ball has gone a full lap either way. Returns true on the frame
 * the lap completes. */
export function tallyGlobeHandLap(radians: number): boolean {
  if (lapAwarded) return false;
  lapTurned += Math.abs(radians);
  if (lapTurned < GLOBE_HAND_LAP) return false;
  lapAwarded = true;
  return true;
}

type DragSample = { x: number; y: number };
let cancelActiveDrag: (() => void) | null = null;

export function cancelGlobeDrag() {
  cancelActiveDrag?.();
}

/**
 * Begin turning the near globe by hand. Called by the carrier when a press on
 * the globe crosses the drag threshold while it is up close; the Grabbable
 * itself is tap-only then, so nothing is carried. Listens on window until
 * the pointer lifts, which is also when the Grabbable ends its own gesture.
 */
export function beginGlobeDrag(
  pointerId?: number,
  start?: Pick<PointerEvent, "clientX" | "clientY">,
) {
  if (typeof window === "undefined") return;
  cancelGlobeDrag();
  globeSpin.setHeld(true);
  globeChapterHover.set(null);
  let activePointer = pointerId;
  let last: DragSample | null = start
    ? { x: start.clientX, y: start.clientY }
    : null;
  const onMove = (event: PointerEvent) => {
    activePointer ??= event.pointerId;
    if (event.pointerId !== activePointer) return;
    if (last) {
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      const step = globeDragStep({ dx, dy, tilt: globeTilt.current });
      globeSpin.turn(step.turn);
      globeTilt.current = step.tilt;
    }
    last = { x: event.clientX, y: event.clientY };
  };
  const cleanup = () => {
    roomWindowEvents.removeEventListener("pointermove", onMove);
    roomWindowEvents.removeEventListener("pointerup", end);
    roomWindowEvents.removeEventListener("pointercancel", cancelPointer);
    roomWindowEvents.removeEventListener("blur", cancel);
    globeSpin.setHeld(false);
    if (cancelActiveDrag === cancel) cancelActiveDrag = null;
  };
  const cancel = () => {
    cleanup();
    globeSpin.state.pending = 0;
    globeSpin.state.velocity = 0;
  };
  const cancelPointer = (event: PointerEvent) => {
    if (activePointer !== undefined && event.pointerId !== activePointer)
      return;
    cancel();
  };
  const end = (event: PointerEvent) => {
    if (activePointer !== undefined && event.pointerId !== activePointer)
      return;
    // Release keeps the frame integrator's current speed. A stationary hold
    // already slows it down, so no last-event velocity estimate is needed.
    cleanup();
  };
  cancelActiveDrag = cancel;
  roomWindowEvents.addEventListener("pointermove", onMove);
  roomWindowEvents.addEventListener("pointerup", end);
  roomWindowEvents.addEventListener("pointercancel", cancelPointer);
  roomWindowEvents.addEventListener("blur", cancel);
}
