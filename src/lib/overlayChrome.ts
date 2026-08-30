/**
 * One attribute on `<html>` saying "a presented surface owns the screen right
 * now", so the 3D homepage's chrome can stand down for a modal the same way it
 * already does for Field Notes and the photo viewer.
 *
 * Those two write their own attributes (`data-field-notes-open`, and
 * PhotoView's `.PhotoView-Portal` node, matched with `:has()`), and
 * `StacksHome` keys the whole recede choreography off them. Modals were never
 * in that list, so the rail, the name, the theme toggle and the placard dock
 * all stayed lit behind the card. This is the third signal, folded into the
 * same rules and the same timings.
 *
 * It is a counter rather than a boolean because a book note modal can be open
 * over the world while a sheet is mounted on top of it (a book link inside the
 * routine), and the first one to close must not bring the chrome back under
 * the second.
 *
 * Deliberately a plain module rather than a store slice: the sheet chrome is
 * shared with the books and weightlifting hosts, which have no 3D world and
 * must not pull its store in to say "I am open".
 */
export const OVERLAY_OPEN_ATTRIBUTE = "data-overlay-open";

let depth = 0;

export function openOverlayChrome() {
  if (typeof document === "undefined") return;
  depth += 1;
  document.documentElement.setAttribute(OVERLAY_OPEN_ATTRIBUTE, "");
}

export function closeOverlayChrome() {
  if (typeof document === "undefined") return;
  depth = Math.max(0, depth - 1);
  if (depth === 0)
    document.documentElement.removeAttribute(OVERLAY_OPEN_ATTRIBUTE);
}

/** Test seam: unmounting every overlay must leave no residue. */
export function overlayChromeDepth() {
  return depth;
}
