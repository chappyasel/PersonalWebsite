import type { WorldBootView } from "../boot/worldBootMachine";

/** CameraRig publishes its ordinary pose while the handoff renders a temporary one. */
export const handoffCamera = {
  aimError: Infinity,
  targetX: Infinity,
  frame: 0,
};

export function illustrationOwnsCamera(view: WorldBootView): boolean {
  return (
    view.motionEnabled &&
    (view.presentation === "illustrated" ||
      view.presentation === "dissolve" ||
      view.presentation === "travel")
  );
}
