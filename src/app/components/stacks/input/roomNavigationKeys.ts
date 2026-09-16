import { UNIT_COUNT } from "../data";

import { roomOverlayBlocksInput } from "~/lib/overlays/coordinator";

export function isStacksScrollableTarget(target: EventTarget | null) {
  const closest = (target as { closest?: (selector: string) => Element | null })
    ?.closest;
  return (
    typeof closest === "function" &&
    !!closest.call(
      target,
      "[data-stacks-scrollable], [data-stacks-mobile-panel]",
    )
  );
}

export function worldNavigationStep(key: string): -1 | 1 | null {
  if (key === "ArrowRight" || key === "ArrowDown" || key === "PageDown")
    return 1;
  if (key === "ArrowLeft" || key === "ArrowUp" || key === "PageUp") return -1;
  return null;
}

export function worldNavigationUnit(key: string): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const unit = Number(key) - 1;
  return unit < UNIT_COUNT ? unit : null;
}

export function isInteractiveWorldNavigationTarget(target: EventTarget | null) {
  const closest = (target as { closest?: (selector: string) => Element | null })
    ?.closest;
  return (
    typeof closest === "function" &&
    !!closest.call(
      target,
      "a[href], button, input, textarea, select, [role='button'], [role='link'], [contenteditable]:not([contenteditable='false'])",
    )
  );
}

export function shouldHandleWorldNavigationKey(
  event: Pick<KeyboardEvent, "defaultPrevented" | "target">,
  universalSearchOpen = false,
) {
  return (
    !roomOverlayBlocksInput() &&
    !universalSearchOpen &&
    !event.defaultPrevented &&
    !isInteractiveWorldNavigationTarget(event.target)
  );
}
