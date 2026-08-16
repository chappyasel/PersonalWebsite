export const FOCUS_SESSION_KEY = "stacks:details-hidden";

export function ignoresFocusShortcut(target: EventTarget | null) {
  const element = target as
    | (EventTarget & { closest?: (query: string) => unknown })
    | null;
  if (typeof element?.closest !== "function") return false;
  return Boolean(
    element.closest(
      "input, textarea, select, button, [contenteditable]:not([contenteditable='false'])",
    ),
  );
}

export function readFocusMode(storage: Pick<Storage, "getItem">) {
  return storage.getItem(FOCUS_SESSION_KEY) === "1";
}

export function writeFocusMode(
  storage: Pick<Storage, "setItem">,
  hidden: boolean,
) {
  storage.setItem(FOCUS_SESSION_KEY, hidden ? "1" : "0");
}
