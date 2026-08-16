const INTERACTIVE_MODAL_TARGET = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[role='button']",
  "[role='link']",
  "[contenteditable]:not([contenteditable='false'])",
].join(",");

type ModalEnterEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "defaultPrevented" | "key" | "metaKey" | "target"
>;

/** Enter opens the full page only from the dialog shell/non-interactive copy. */
export function shouldUseModalEnterShortcut(event: ModalEnterEvent): boolean {
  if (
    event.key !== "Enter" ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return false;

  const closest = (
    event.target as { closest?: (selector: string) => Element | null } | null
  )?.closest;
  return !(
    typeof closest === "function" &&
    closest.call(event.target, INTERACTIVE_MODAL_TARGET)
  );
}
