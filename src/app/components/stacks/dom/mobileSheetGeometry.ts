export type MobileSheetPanelState = "closed" | "opening" | "open" | "closing";

export const MOBILE_SHEET_GRABBER_PX = 24;
export const MOBILE_SHEET_TITLE_ROW_PX = 40;
export const MOBILE_SHEET_OVERDRAG_RESISTANCE = 0.25;
export const MOBILE_SHEET_SEAM_TOLERANCE_PX = 2;

/**
 * Geometry shared by every mobile-sheet pose. The grabber used to shrink by
 * twelve pixels the instant closing began, then grow by twelve the instant
 * opening began. Long About and Talks sheets made that reflow visible as the
 * bottom control jumping in both directions. Pose changes now move one fixed
 * box; only its translateY changes.
 */
export function mobileSheetGeometry(state: MobileSheetPanelState) {
  return {
    expanded: state === "opening" || state === "open",
    grabberPx: MOBILE_SHEET_GRABBER_PX,
    headerPx: MOBILE_SHEET_GRABBER_PX + MOBILE_SHEET_TITLE_ROW_PX,
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
