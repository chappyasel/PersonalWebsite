import { isEditableShortcutTarget } from "../input/editableShortcutTarget";

export type FieldNotesShortcutEvent = Readonly<{
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  repeat: boolean;
  defaultPrevented: boolean;
  /** True when the keystroke belongs to a text field rather than the scene. */
  editableTarget: boolean;
}>;

/**
 * Whether F should toggle the Field Notes collection, following the same
 * guard discipline as the free-roam key (now R): a repeating key must not
 * strobe the dialog, a modifier combination belongs to the browser, and a
 * keystroke inside a text field is someone typing the letter f.
 */
export function fieldNotesShortcutIntent(
  event: FieldNotesShortcutEvent,
): "toggle" | null {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.key.toLowerCase() !== "f" ||
    event.editableTarget
  )
    return null;
  return "toggle";
}

/**
 * Both Field Notes surfaces (the production experience and the development
 * prototype) own their dialog's open state locally, so each installs this
 * listener beside that state rather than routing through the chrome layer.
 */
export function connectFieldNotesShortcut(toggle: () => void) {
  const onKey = (event: KeyboardEvent) => {
    const intent = fieldNotesShortcutIntent({
      key: event.key,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      repeat: event.repeat,
      defaultPrevented: event.defaultPrevented,
      editableTarget: isEditableShortcutTarget(event.target),
    });
    if (!intent) return;
    event.preventDefault();
    toggle();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
