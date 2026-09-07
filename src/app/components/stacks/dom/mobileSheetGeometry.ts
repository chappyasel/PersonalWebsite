export type MobileSheetPanelState = "closed" | "opening" | "open" | "closing";

export const MOBILE_SHEET_GRABBER_PX = 16;
/** The title row's share of the sheet's height budget at the phone title
 * size; `mobileSheetTitleRowPx` grows it with the title. */
export const MOBILE_SHEET_TITLE_ROW_PX = 48;

/** The sheet title: 20px on phones, growing with the viewport to 29px where
 * the sheet reaches its 700px cap (~740px viewports). At tablet widths the
 * cards inside carry desktop-sized figures, and a 20px title over a 104px
 * headline read as the wrong section's label; 34 and then 31 were "a tad too much", so
 * the growth is 36% less than the first cut. The CSS clamp and the px function are
 * one curve; the header's font-size takes the clamp and its children size
 * in em, so the row's height follows the same number the height budget
 * below uses. The mobile rail scales its icons on this curve too. */
export const MOBILE_SHEET_TITLE_MIN_PX = 20;
export const MOBILE_SHEET_TITLE_MAX_PX = 29;
const MOBILE_SHEET_TITLE_FROM_VW = 400;
const MOBILE_SHEET_TITLE_TO_VW = 740;
const MOBILE_SHEET_TITLE_SLOPE =
  (MOBILE_SHEET_TITLE_MAX_PX - MOBILE_SHEET_TITLE_MIN_PX) /
  (MOBILE_SHEET_TITLE_TO_VW - MOBILE_SHEET_TITLE_FROM_VW);
const MOBILE_SHEET_TITLE_INTERCEPT =
  MOBILE_SHEET_TITLE_MIN_PX -
  MOBILE_SHEET_TITLE_SLOPE * MOBILE_SHEET_TITLE_FROM_VW;
/** In rem so a root type-size preference still scales the chrome; the px
 * functions assume the 16px default, as the sheet's height budget does. */
const ROOT_PX = 16;
export const MOBILE_SHEET_TITLE_CLAMP = `clamp(${MOBILE_SHEET_TITLE_MIN_PX / ROOT_PX}rem, ${(MOBILE_SHEET_TITLE_INTERCEPT / ROOT_PX).toFixed(3)}rem + ${(MOBILE_SHEET_TITLE_SLOPE * 100).toFixed(3)}vw, ${MOBILE_SHEET_TITLE_MAX_PX / ROOT_PX}rem)`;
/** The title's line box is 1.5 of its size (the inherited body leading; the
 * truncating h2 needs the room for descenders). The header's padding above
 * and below that box stays constant, so the row grows by 1.5px per title px. */
export const MOBILE_SHEET_TITLE_LEADING = 1.5;

/** The mobile icon rail rides the same curve, more gently: its em-sized
 * row goes from 1x at the phone title to 1.2x where the title tops out, so
 * seven 22px glyphs become 26px on a tablet without turning into a toolbar. */
export const MOBILE_RAIL_SCALE_MAX = 1.2;
const MOBILE_RAIL_SLOPE =
  (ROOT_PX * (MOBILE_RAIL_SCALE_MAX - 1)) /
  (MOBILE_SHEET_TITLE_TO_VW - MOBILE_SHEET_TITLE_FROM_VW);
const MOBILE_RAIL_INTERCEPT =
  ROOT_PX - MOBILE_RAIL_SLOPE * MOBILE_SHEET_TITLE_FROM_VW;
/** The rail row's font-size; every rail dimension is in em of it. */
export const MOBILE_RAIL_FONT_CLAMP = `clamp(1rem, ${(MOBILE_RAIL_INTERCEPT / ROOT_PX).toFixed(3)}rem + ${(MOBILE_RAIL_SLOPE * 100).toFixed(3)}vw, ${MOBILE_RAIL_SCALE_MAX}rem)`;

export function mobileRailScale(viewportWidth: number) {
  return (
    1 +
    (MOBILE_RAIL_SCALE_MAX - 1) *
      ((mobileSheetTitlePx(viewportWidth) - MOBILE_SHEET_TITLE_MIN_PX) /
        (MOBILE_SHEET_TITLE_MAX_PX - MOBILE_SHEET_TITLE_MIN_PX))
  );
}

export function mobileSheetTitlePx(viewportWidth: number) {
  return Math.min(
    MOBILE_SHEET_TITLE_MAX_PX,
    Math.max(
      MOBILE_SHEET_TITLE_MIN_PX,
      MOBILE_SHEET_TITLE_INTERCEPT + MOBILE_SHEET_TITLE_SLOPE * viewportWidth,
    ),
  );
}

export function mobileSheetTitleRowPx(viewportWidth: number) {
  return (
    MOBILE_SHEET_TITLE_ROW_PX +
    MOBILE_SHEET_TITLE_LEADING *
      (mobileSheetTitlePx(viewportWidth) - MOBILE_SHEET_TITLE_MIN_PX)
  );
}
export const MOBILE_SHEET_OVERDRAG_RESISTANCE = 0.25;
export const MOBILE_SHEET_SEAM_TOLERANCE_PX = 2;
export const MOBILE_SHEET_WHEEL_COMMIT_PX = 36;
export const MOBILE_SHEET_WHEEL_RESET_MS = 140;
export const MOBILE_SHEET_WHEEL_COOLDOWN_MS = 280;
export const MOBILE_SHEET_SWIPE_COMMIT_PX = 36;
export const MOBILE_SHEET_SWIPE_FLING_PX_MS = 0.45;
export const MOBILE_SHEET_HORIZONTAL_DOMINANCE = 1;

export type MobileSheetScrollIntent = "expand" | "collapse" | null;

export type MobileSheetHeightMeasurement = {
  requestedHeight: number;
  renderedHeight: number;
};

/** Keep the sheet parked behind an open modal, then let it begin returning
 * while an artifact viewer is still animating its source back into place. */
export function mobileSheetHidden({
  dismissed,
  modalOpen,
  artifactReturning,
}: {
  dismissed: boolean;
  modalOpen: boolean;
  artifactReturning: boolean;
}) {
  return dismissed || (modalOpen && !artifactReturning);
}

/** Use a frame measurement only for the requested height that produced it.
 * A resident may mount its body between renders; its previous peek-height
 * measurement must not position the newly tall frame at the expanded detent. */
export function mobileSheetRenderedHeight(
  requestedHeight: number,
  measurement: MobileSheetHeightMeasurement | null,
) {
  if (
    measurement?.requestedHeight !== requestedHeight ||
    (measurement?.renderedHeight ?? 0) <= 0
  )
    return requestedHeight;
  return measurement.renderedHeight;
}

/** Resident detent: 30% of usable height, bounded for readable and scenic
 * balance. Short landscape keeps only the fixed header detent. */
export const MOBILE_SHEET_PEEK = {
  shortLandscape: 64,
  min: 168,
  max: 280,
  fraction: 0.3,
} as const;

export function mobileSheetPeekHeight(width: number, usableHeight: number) {
  if (width < 1200 && width > usableHeight && usableHeight < 600)
    return MOBILE_SHEET_PEEK.shortLandscape;
  return Math.round(
    Math.min(
      MOBILE_SHEET_PEEK.max,
      Math.max(
        MOBILE_SHEET_PEEK.min,
        usableHeight * MOBILE_SHEET_PEEK.fraction,
      ),
    ),
  );
}

/** The pill replaces a physically parked sheet. It must never be derived
 * from dismissal intent alone, because an interrupted resident transition
 * can leave that sheet onscreen after the intent has already changed. */
export function mobileSheetChipActive({
  active,
  hidden,
  modalOpen,
  sheetParked,
}: {
  active: boolean;
  hidden: boolean;
  modalOpen: boolean;
  sheetParked: boolean;
}) {
  return active && hidden && !modalOpen && sheetParked;
}

/** Horizontal sheet gesture → physical section direction. Negative travel is
 * a leftward swipe and therefore advances to the room on the right. */
export function mobileSheetHorizontalSwipeIntent({
  deltaX,
  velocityX,
}: {
  deltaX: number;
  velocityX: number;
}): -1 | 1 | null {
  const distanceCommitted = Math.abs(deltaX) > MOBILE_SHEET_SWIPE_COMMIT_PX;
  const velocityCommitted =
    Math.abs(velocityX) > MOBILE_SHEET_SWIPE_FLING_PX_MS;
  if (!distanceCommitted && !velocityCommitted) return null;

  // A decisive drag owns the direction. For a short fast flick, use the
  // release velocity so a tiny rebound at lift-off cannot reverse intent.
  const direction = distanceCommitted ? deltaX : velocityX;
  return direction < 0 ? 1 : -1;
}

export type MobileSheetWheelIntentState = {
  intent: Exclude<MobileSheetScrollIntent, null>;
  distance: number;
  lastAt: number;
};

/**
 * Turn only boundary scroll attempts into sheet movement. Positive wheel
 * delta means "show later content": from peek that expands. Negative delta
 * at the expanded scroller's top means "go above the beginning": that
 * collapses. Every wheel gesture with actual document range remains native.
 */
export function mobileSheetScrollIntent({
  expanded,
  canExpand,
  scrollTop,
  deltaY,
}: {
  expanded: boolean;
  canExpand: boolean;
  scrollTop: number;
  deltaY: number;
}): MobileSheetScrollIntent {
  if (deltaY === 0) return null;
  if (!expanded) return canExpand && deltaY > 0 ? "expand" : null;
  return scrollTop <= 1 && deltaY < 0 ? "collapse" : null;
}

/**
 * Accumulate a deliberate boundary-scroll gesture before changing detents.
 * Tiny trackpad deltas are common while a finger is coming to rest, so a
 * low-amplitude event must never expand or collapse the sheet. A deliberate
 * notched wheel may clear the threshold at once; trackpad motion accumulates.
 * A direction change or pause starts a new gesture, and a short post-snap
 * lock prevents the tail of momentum from immediately undoing the transition.
 */
export function accumulateMobileSheetWheelIntent({
  state,
  intent,
  deltaY,
  at,
  lockedUntil,
}: {
  state: MobileSheetWheelIntentState | null;
  intent: MobileSheetScrollIntent;
  deltaY: number;
  at: number;
  lockedUntil: number;
}): {
  state: MobileSheetWheelIntentState | null;
  committed: MobileSheetScrollIntent;
  consume: boolean;
} {
  if (!intent) return { state: null, committed: null, consume: false };
  if (at < lockedUntil) {
    return { state: null, committed: null, consume: true };
  }

  const continuing =
    state?.intent === intent &&
    at - state.lastAt <= MOBILE_SHEET_WHEEL_RESET_MS;
  const next: MobileSheetWheelIntentState = {
    intent,
    distance: (continuing ? state.distance : 0) + Math.abs(deltaY),
    lastAt: at,
  };
  if (next.distance < MOBILE_SHEET_WHEEL_COMMIT_PX) {
    return { state: next, committed: null, consume: true };
  }
  return { state: null, committed: intent, consume: true };
}

/**
 * Geometry shared by every mobile-sheet pose. The grabber used to shrink by
 * twelve pixels the instant closing began, then grow by twelve the instant
 * opening began. Long About and Talks sheets made that reflow visible as the
 * bottom control jumping in both directions. Pose changes now move one fixed
 * box; only its translateY changes.
 */
export function mobileSheetGeometry(
  state: MobileSheetPanelState,
  viewportWidth = 0,
) {
  return {
    expanded: state === "opening" || state === "open",
    grabberPx: MOBILE_SHEET_GRABBER_PX,
    // The grabber overlays the title row instead of consuming its own band.
    // The row grows with the title (tablet sheets), never with the pose.
    headerPx: Math.max(
      MOBILE_SHEET_GRABBER_PX,
      mobileSheetTitleRowPx(viewportWidth),
    ),
  } as const;
}

export function mobileSheetRestY(
  pose: "expanded" | "peek" | "hidden",
  renderedHeight: number,
  peekHeight: number,
) {
  if (pose === "expanded") return 0;
  if (pose === "hidden") return renderedHeight;
  return Math.max(0, renderedHeight - peekHeight);
}

/** Maximum distance the resisted sheet may travel above its expanded pose. */
export function mobileSheetMaxUpwardOverdrag(viewportHeight: number) {
  return Math.ceil(viewportHeight * MOBILE_SHEET_OVERDRAG_RESISTANCE);
}

/**
 * Extra real sheet material below the content frame. The tolerance keeps the
 * material's physical bottom just beyond the viewport at maximum overdrag.
 */
export function mobileSheetMaterialOverscan(viewportHeight: number) {
  return (
    mobileSheetMaxUpwardOverdrag(viewportHeight) +
    MOBILE_SHEET_SEAM_TOLERANCE_PX
  );
}

/** Apply upward resistance and clamp it to the material's covered range. */
export function mobileSheetRubberBandY(
  requestedY: number,
  viewportHeight: number,
) {
  if (requestedY >= 0) return requestedY;
  return Math.max(
    -mobileSheetMaxUpwardOverdrag(viewportHeight),
    requestedY * MOBILE_SHEET_OVERDRAG_RESISTANCE,
  );
}

/** Camera coverage is based only on the content frame, never its overscan. */
export function mobileSheetCameraCoverage(
  renderedHeight: number,
  translateY: number,
  peekHeight: number,
  viewportHeight: number,
) {
  if (viewportHeight <= 0) return 0;
  const covered = renderedHeight - translateY;
  return Math.min(
    1,
    Math.max(0, (covered - peekHeight * 0.5) / viewportHeight),
  );
}

/** The sheet may move behind an artifact viewer during its return, but that
 * motion must not recenter the live scene under the viewer's fixed origin. */
export function mobileSheetPublishedCoverage({
  narrow,
  viewportHeight,
  renderedHeight,
  sheetY,
  peekHeight,
  modalOpen,
}: {
  narrow: boolean;
  viewportHeight: number;
  renderedHeight: number;
  sheetY: number;
  peekHeight: number;
  modalOpen: boolean;
}) {
  if (modalOpen || !narrow || !viewportHeight) return 0;
  return mobileSheetCameraCoverage(
    renderedHeight,
    sheetY,
    peekHeight,
    viewportHeight,
  );
}
