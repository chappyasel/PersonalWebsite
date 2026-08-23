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
 *
 * Hide-all is a single attribute on `<html>` (`data-chrome-hidden`) and a
 * rule in StacksHome that blanks the `.stacks-og-ui` wrapper and its
 * descendants: the same wrapper the OG capture hides, so "no UI" means the
 * same thing to a visitor and to the capture script. Visibility, not
 * display, so the desktop chrome keeps its geometry (the side lens is
 * measured from it) and the input bridges, which are window-level
 * listeners, keep travelling between shelves.
 *
 * Owner-only keys (development builds): F free roam, backtick debug console,
 * G/R in the layout editor. Those live with their features; the sheet lists
 * them when it is running in development.
 */

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

export type ShortcutRow = Readonly<{ keys: readonly string[]; does: string }>;
export type ShortcutGroup = Readonly<{
  title: string;
  rows: readonly ShortcutRow[];
}>;

/** What the sheet shows. Owner keys only in development, where they work. */
export function shortcutGroups(development: boolean): readonly ShortcutGroup[] {
  const visitor: ShortcutGroup = {
    title: "Keyboard",
    rows: [
      { keys: ["←", "→"], does: "Previous or next shelf" },
      { keys: ["A", "D"], does: "Pan the room" },
      { keys: ["Home", "End"], does: "First or last shelf" },
      { keys: ["\\"], does: "Hide or show details" },
      { keys: ["H"], does: "Hide or show the interface" },
      { keys: ["?"], does: "This sheet" },
      { keys: ["Esc"], does: "Close" },
    ],
  };
  if (!development) return [visitor];
  return [
    visitor,
    {
      title: "Owner",
      rows: [
        { keys: ["F"], does: "Free roam (WASD, Q/E, right-drag)" },
        { keys: ["Shift", "F"], does: "Free roam from the current view" },
        { keys: ["`"], does: "Debug console" },
        { keys: ["G", "R"], does: "Move or rotate the selected prop" },
        { keys: ["⌘", "Z"], does: "Undo a layout edit" },
      ],
    },
  ];
}
