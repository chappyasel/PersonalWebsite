export const UNIVERSAL_SEARCH_OPEN_ATTRIBUTE = "data-universal-search-open";
export const UNIVERSAL_SEARCH_MATERIAL_ATTRIBUTE =
  "data-universal-search-material";

export function isUniversalSearchOpen(
  root: Pick<HTMLElement, "hasAttribute"> = document.documentElement,
) {
  return root.hasAttribute(UNIVERSAL_SEARCH_OPEN_ATTRIBUTE);
}

/** The only elements inside the palette that may legitimately hold keyboard
 * focus. Everything else is chrome. */
const PALETTE_KEYBOARD_CONTROL_SELECTOR = [
  "input",
  "textarea",
  "select",
  "a[href]",
  "button",
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex^="-"])',
].join(", ");

export type UniversalSearchFocusIntent = "outside" | "keep" | "reclaim";

/**
 * Where a newly focused element leaves the palette's keyboard focus.
 *
 * cmdk's root and its list are both `tabindex="-1"`, and so is Radix's dialog
 * panel. In Chrome a mousedown on a `tabindex="-1"` element focuses it, so a
 * click on the magnifier, a group heading, the ESC chip, the footer hint, or
 * any gap between rows silently moves focus off the search input while the
 * palette still looks focused. Keystrokes then land on a div: `keydown` fires
 * and `beforeinput` never does, so typing vanishes with no visible cause.
 *
 * `reclaim` therefore covers focus landing on palette chrome as well as focus
 * escaping to the page behind the modal. Only a real control — the input
 * itself, or anything a visitor could deliberately Tab to — is left alone.
 */
export function universalSearchFocusIntent(
  target: EventTarget | null,
): UniversalSearchFocusIntent {
  if (!(target instanceof Element)) return "outside";
  if (target.closest(`[${UNIVERSAL_SEARCH_MATERIAL_ATTRIBUTE}]`) === null)
    return "outside";
  return target.closest(PALETTE_KEYBOARD_CONTROL_SELECTOR) === null
    ? "reclaim"
    : "keep";
}

/** Key events whose target sits in the palette belong to the palette, whether
 * or not that target is the element that should own focus. */
export function isInsideUniversalSearchMaterial(target: EventTarget | null) {
  return universalSearchFocusIntent(target) !== "outside";
}
