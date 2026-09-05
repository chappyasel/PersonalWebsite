/**
 * Whether a press landed in the exposed room, so an expanded mobile placard
 * sheet should collapse for it.
 *
 * The sheet's collapse-on-outside-press listener sits on `window`, so it
 * also hears presses on everything mounted OVER the world: an intercepted
 * document sheet (routine, manual), the book modal, the photo viewer, the
 * search palette. None of those is the room. Collapsing for them was worse
 * than a stray collapse, because closing the panel is a `history.back()`
 * and the entry on top of the stack belongs to the overlay — every tap in a
 * manual opened from the expanded sheet popped the manual.
 *
 * So the press has to be inside the world shell, and not on the panel or
 * the mobile rail. The rail is excluded because its own click handler
 * collapses AND completes the requested navigation; pre-closing here would
 * make that handler see a transitional state and lose the destination.
 */
export const WORLD_SHELL_SELECTOR = ".stacks-world-shell";

export function pressLandsInRoom(target: EventTarget | null): boolean {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  if (!element) return false;
  if (!element.closest(WORLD_SHELL_SELECTOR)) return false;
  if (element.closest("[data-stacks-mobile-panel]")) return false;
  if (element.closest(".stacks-unit-rail-mobile")) return false;
  return true;
}
