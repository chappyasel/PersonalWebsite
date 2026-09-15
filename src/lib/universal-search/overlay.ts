export const UNIVERSAL_SEARCH_OPEN_ATTRIBUTE = "data-universal-search-open";

/**
 * The root marker the controller stamps while the palette is up. The Stacks
 * scene's wheel and navigation-key bridges, the Books dialogs, and the
 * Weightlifting modal all yield their global listeners while it is present.
 * The scene also pauses rendering and pointer tracking until it clears.
 * Focus containment itself belongs to the palette's Radix Dialog, not to
 * anything reading this marker.
 */
export function isUniversalSearchOpen(
  root: Pick<HTMLElement, "hasAttribute"> = document.documentElement,
) {
  return root.hasAttribute(UNIVERSAL_SEARCH_OPEN_ATTRIBUTE);
}

/**
 * A selection is announced BEFORE the palette closes and before it navigates.
 *
 * The room defers a coarse travel gesture while the palette is up and restores
 * its authored stop when the palette is dismissed. Dismissal and selection
 * both end with the marker gone, so absence cannot tell them apart — and a
 * selection whose destination never reaches the room's own navigation (an
 * external href, a command action) raises no other signal at all. Without this,
 * choosing a result would be followed by the room sliding back to where the
 * abandoned gesture had been heading.
 *
 * Announced before `close()` rather than after, so the room learns the
 * dismissal was a choice while the palette still owns the turn, and no
 * observer ordering has to be relied on. It carries no destination: the only
 * question the room asks is whether the visitor picked something.
 */
type SelectionListener = () => void;
const selectionListeners = new Set<SelectionListener>();

export function notifyUniversalSearchSelection() {
  for (const listener of selectionListeners) listener();
}

export function onUniversalSearchSelection(listener: SelectionListener) {
  selectionListeners.add(listener);
  return () => selectionListeners.delete(listener);
}
