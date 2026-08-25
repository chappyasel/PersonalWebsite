/**
 * Touch-gesture arbitration for the mobile Field Notes album. A swipe stays
 * unclaimed inside a small slop radius so taps keep reaching page controls
 * and stamp hints. Once movement leaves the slop with one axis clearly
 * dominant, the gesture locks to that axis: horizontal resolves to page
 * turns in reading order, vertical-down resolves to dismissal, and
 * vertical-up resolves to nothing. The caller takes pointer capture at the
 * moment a gesture is claimed so buttons and native handling underneath
 * stop competing for the same pointer.
 */

/** Movement below this radius is a tap, never a swipe. */
export const ALBUM_SWIPE_SLOP_PX = 12;

/** One axis must beat the other by this factor before the gesture locks. */
export const ALBUM_SWIPE_DOMINANCE = 1.2;

/** Horizontal travel that commits a page turn on release. */
export const ALBUM_PAGE_SWIPE_PX = 48;

/** Downward travel that commits a dismissal on release. */
export const ALBUM_DISMISS_SWIPE_PX = 72;

export type AlbumSwipeAxis = "horizontal" | "vertical";

export type AlbumSwipeState = Readonly<{
  startX: number;
  startY: number;
  axis: AlbumSwipeAxis | null;
}>;

export type AlbumSwipeAction = "none" | "next" | "previous" | "dismiss";

export function beginAlbumSwipe(x: number, y: number): AlbumSwipeState {
  return { startX: x, startY: y, axis: null };
}

/** Advances the gesture; `claimed` is true exactly once, on the move that
 * locks an axis, which is the caller's cue to take pointer capture. */
export function moveAlbumSwipe(
  state: AlbumSwipeState,
  x: number,
  y: number,
): { state: AlbumSwipeState; claimed: boolean } {
  if (state.axis) return { state, claimed: false };
  const dx = x - state.startX;
  const dy = y - state.startY;
  if (Math.hypot(dx, dy) < ALBUM_SWIPE_SLOP_PX)
    return { state, claimed: false };
  if (Math.abs(dx) >= Math.abs(dy) * ALBUM_SWIPE_DOMINANCE)
    return { state: { ...state, axis: "horizontal" }, claimed: true };
  if (Math.abs(dy) >= Math.abs(dx) * ALBUM_SWIPE_DOMINANCE)
    return { state: { ...state, axis: "vertical" }, claimed: true };
  // Diagonal without a dominant axis: stay undecided and keep watching.
  return { state, claimed: false };
}

export function releaseAlbumSwipe(
  state: AlbumSwipeState,
  x: number,
  y: number,
): AlbumSwipeAction {
  const dx = x - state.startX;
  const dy = y - state.startY;
  if (state.axis === "horizontal") {
    if (dx <= -ALBUM_PAGE_SWIPE_PX) return "next";
    if (dx >= ALBUM_PAGE_SWIPE_PX) return "previous";
    return "none";
  }
  if (state.axis === "vertical") {
    return dy >= ALBUM_DISMISS_SWIPE_PX ? "dismiss" : "none";
  }
  return "none";
}
