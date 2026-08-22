import type { FreeRoamDiagnosticsState } from "./freeRoamDiagnostics";

export type FreeRoamShortcutEvent = Readonly<{
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

export type FreeRoamShortcutIntent = Readonly<{
  action: "toggle" | "start-from-current-pose";
  /** Entering free roam captures the mouse; leaving it never does. */
  requestPointerLock: boolean;
}>;

/**
 * What F should do right now, or null for "not ours".
 *
 * The guards matter more than the two actions. A held key repeats at the OS
 * rate, and a repeating toggle turns free roam into a strobe; a modifier
 * combination belongs to the browser; a keystroke inside a diagnostics text
 * field is someone typing the letter f.
 *
 * Shift+F is not a second toggle. It only means "enter from where the camera
 * is standing", so on an already-enabled camera it falls back to leaving,
 * which is what the muscle memory of pressing F expects.
 */
export function freeRoamShortcutIntent(
  event: FreeRoamShortcutEvent,
  state: Pick<FreeRoamDiagnosticsState, "enabled">,
): FreeRoamShortcutIntent | null {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.key.toLowerCase() !== "f" ||
    event.editableTarget
  )
    return null;

  return {
    action:
      event.shiftKey && !state.enabled ? "start-from-current-pose" : "toggle",
    requestPointerLock: !state.enabled,
  };
}
