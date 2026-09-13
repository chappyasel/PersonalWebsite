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
}>;

/** Shift + ~ enters from the current camera pose or exits free roam.
 * On a US keyboard this is Shift + Backquote. Bare backtick opens diagnostics.
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
    !event.shiftKey ||
    event.key !== "~" ||
    event.editableTarget
  )
    return null;

  return {
    action: !state.enabled ? "start-from-current-pose" : "toggle",
  };
}
