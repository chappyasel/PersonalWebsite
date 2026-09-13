/**
 * Keyboard for the interface over the room. One place for the keys so the
 * sheet (`?`) and the handlers cannot drift apart.
 *
 *  - `\`  "Hide details" / "Show details": the same switch as the arrow at the
 *         right edge of the desktop reading column (focus mode, remembered for
 *         the session). On the narrow layout it dismisses or restores the
 *         sheet, which is what that layout calls the same thing. Notion and
 *         Figma put their sidebar on Cmd+\; there is nothing to type here, so
 *         the bare key is enough.
 *  - `H`  hides EVERYTHING over the room, pill and rail and labels included,
 *         for screenshots and for looking at the scene on its own. Escape
 *         brings it back. The games' photo-mode key. Not Tab: a web page
 *         cannot take Tab without breaking keyboard focus.
 *  - `?`  the shortcut sheet, where every web app with shortcuts keeps it.
 *  - `M`  mutes or unmutes the scene through the resident sound control.
 *  - `F`  Field Notes. Handled where the collection's open state lives
 *         (fieldNotes/shortcut.ts), listed here so the sheet stays honest.
 *  - `1–7` jump straight to a shelf, in the rail's order. Handled with the
 *         other travel keys in ScrollBridges.
 *
 * Hide-all is a single attribute on `<html>` (`data-chrome-hidden`) and a
 * rule in StacksHome that blanks the `.stacks-og-ui` wrapper and its
 * descendants: the same wrapper the OG capture hides, so "no UI" means the
 * same thing to a visitor and to the capture script. Visibility preserves the
 * desktop chrome's geometry, which the side lens measures. Field Notes and
 * photo previews animate the wrapper's visible children instead. The canvas
 * remains outside it.
 *
 * Owner-only controls live with their features. Development builds add R for
 * free roam, backtick for the debug console, and the combined prop gizmo.
 * Screenshot mode (`?screenshot=1`, scene/screenshotMode.ts) adds `[` and
 * `]` to dolly the camera while it is on; they are handled in ChromeKeyboard
 * because the mode has to work in production, where the owner takes the
 * real header from the real site.
 */
import { recordFieldNoteEvent } from "../fieldNotes/progress";

export const CHROME_HIDDEN_ATTRIBUTE = "data-chrome-hidden";

export type ChromeKeyEvent = Readonly<{
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  repeat: boolean;
  defaultPrevented: boolean;
  editableTarget: boolean;
}>;

export type ChromeKeyIntent = "details" | "hide-all" | "show-all" | "sheet";

/** What a keydown asks of the chrome, or nothing. */
export function chromeKeyIntent(
  event: ChromeKeyEvent,
  allHidden: boolean,
): ChromeKeyIntent | null {
  if (event.defaultPrevented || event.repeat || event.editableTarget)
    return null;
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.key === "Escape") return allHidden ? "show-all" : null;
  // "?" arrives with shiftKey set on most layouts; the character is what
  // counts, so the modifier is not a disqualifier for this one key.
  if (event.key === "?") return "sheet";
  if (event.shiftKey) return null;
  if (event.key === "\\") return "details";
  if (event.key.toLowerCase() === "h") return "hide-all";
  return null;
}

export function chromeHidden() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.hasAttribute(CHROME_HIDDEN_ATTRIBUTE)
  );
}

export function setChromeHidden(hidden: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.toggleAttribute(CHROME_HIDDEN_ATTRIBUTE, hidden);
  if (hidden) recordFieldNoteEvent({ type: "photo-mode-entered" });
}

/**
 * Free roam starts with the scene unobstructed, but it only owns the hide it
 * introduced. An interface that was already hidden stays hidden on exit, and
 * revealing it manually while roaming prevents a stale exit from hiding it
 * again.
 */
export function createFreeRoamChromeVisibility({
  isHidden = chromeHidden,
  setHidden = setChromeHidden,
}: {
  isHidden?: () => boolean;
  setHidden?: (hidden: boolean) => void;
} = {}) {
  let active = false;
  let autoHid = false;

  return {
    enter() {
      if (active) return;
      active = true;
      autoHid = !isHidden();
      setHidden(true);
    },

    exit() {
      if (!active) return;
      active = false;
      if (autoHid && isHidden()) setHidden(false);
      autoHid = false;
    },
  };
}

/** Read a DOM keydown into the shape the intent function takes. */
export function chromeKeyEventFrom(
  event: KeyboardEvent,
  editableTarget: boolean,
): ChromeKeyEvent {
  return {
    key: event.key,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    repeat: event.repeat,
    defaultPrevented: event.defaultPrevented,
    editableTarget,
  };
}

export type ShortcutRow = Readonly<{
  keys: readonly string[];
  /** Rendered between the keycaps: "↔" reads as a range; absent, the keys
   * sit side by side as a chord or an either/or pair. */
  join?: string;
  does: string;
}>;
export type ShortcutGroup = Readonly<{
  title: string;
  rows: readonly ShortcutRow[];
}>;

/** What the sheet shows. Owner keys only in development, where they work;
 * the screenshot keys only while that mode is on, which is the only time
 * they do anything. */
export function shortcutGroups(
  development: boolean,
  screenshotMode = false,
): readonly ShortcutGroup[] {
  const visitor: ShortcutGroup = {
    title: "Keyboard",
    rows: [
      { keys: ["ArrowLeft", "ArrowRight"], does: "Previous or next shelf" },
      { keys: ["A", "D"], does: "Pan the room" },
      { keys: ["1", "7"], join: "to", does: "Jump to a shelf" },
      { keys: ["F"], does: "Open or close Field Notes" },
      { keys: ["\\"], does: "Hide or show details" },
      { keys: ["H"], does: "Hide or show the interface" },
      { keys: ["M"], does: "Mute or unmute scene sound" },
      { keys: ["?"], does: "This sheet" },
      { keys: ["Esc"], does: "Close" },
    ],
  };
  const groups: ShortcutGroup[] = [visitor];
  if (screenshotMode)
    groups.push({
      title: "Screenshot",
      rows: [
        { keys: ["[", "]"], does: "Dolly the camera out or in" },
        { keys: ["Shift", "[", "]"], does: "Dolly four steps" },
      ],
    });
  if (development)
    groups.push({
      title: "Owner",
      rows: [
        { keys: ["R"], does: "Free roam (WASD, Q/E, right-drag)" },
        { keys: ["Shift", "R"], does: "Free roam from the current view" },
        { keys: ["`"], does: "Debug console" },
        {
          keys: ["Click"],
          does: "Select a prop; gizmo moves, rotates, and scales",
        },
        { keys: ["⌘", "Z"], does: "Undo a layout edit" },
      ],
    });
  return groups;
}
