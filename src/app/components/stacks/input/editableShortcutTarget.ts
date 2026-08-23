/**
 * True when a keystroke belongs to a text field rather than the scene.
 *
 * Every scene-wide key handler asks this before claiming a key: F and H in
 * the chrome, WASD in free roam, the layout editor's nudges. A diagnostics
 * panel has inputs, and someone typing "wasd" into one is not trying to fly.
 */
export function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.matches("input, select, textarea, [role='textbox']")
  );
}
