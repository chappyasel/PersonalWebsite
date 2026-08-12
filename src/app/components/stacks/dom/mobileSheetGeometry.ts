export type MobileSheetPanelState =
  | "closed"
  | "opening"
  | "open"
  | "closing";

export const MOBILE_SHEET_GRABBER_PX = 24;
export const MOBILE_SHEET_TITLE_ROW_PX = 40;

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
