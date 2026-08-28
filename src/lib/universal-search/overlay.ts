export const UNIVERSAL_SEARCH_OPEN_ATTRIBUTE = "data-universal-search-open";

/**
 * The root marker the controller stamps while the palette is up. The Stacks
 * scene's wheel and navigation-key bridges, the Books dialogs, and the
 * Weightlifting modal all yield their global listeners while it is present.
 * Focus containment itself belongs to the palette's Radix Dialog, not to
 * anything reading this marker.
 */
export function isUniversalSearchOpen(
  root: Pick<HTMLElement, "hasAttribute"> = document.documentElement,
) {
  return root.hasAttribute(UNIVERSAL_SEARCH_OPEN_ATTRIBUTE);
}
