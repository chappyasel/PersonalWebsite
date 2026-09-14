"use client";

import { useStacks } from "../store";

import {
  getSceneInteraction,
  runSceneInteractionActivation,
} from "./interactionRegistry";

/** Leave the preview visible through a rapid double-click or double-tap.
 * This is an activation guard, not an expiry: selection lasts until dismissed. */
export const SELECTION_SETTLE_MS = 400;

export function sceneSelectionCanActivate(id: string, now = performance.now()) {
  const state = useStacks.getState();
  return (
    state.focusedInteraction === id &&
    now - state.focusedInteractionAt >= SELECTION_SETTLE_MS
  );
}

/** Fine-pointer stationary clicks. Hover never supplies selection. Existing
 * inspectors and small local actions keep their immediate activation. */
export function selectOrActivateSceneInteraction(id: string) {
  const spec = getSceneInteraction(id);
  if (!spec) return false;
  const state = useStacks.getState();
  const preview =
    spec.activation?.kind === "portal" || spec.previewBeforeActivation;
  if (preview) {
    if (state.focusedInteraction !== id) {
      state.setFocusedInteraction(id);
      return true;
    }
    if (!sceneSelectionCanActivate(id)) return true;
  } else {
    state.setFocusedInteraction(spec.activation ? null : id);
  }
  return runSceneInteractionActivation(id);
}

/** Touch arbitration already decided whether this tap selects or activates.
 * Only the second tap needs the rapid-gesture guard; authored first-tap
 * actions and bare hittable balls retain their existing paths. */
export function activateTouchSceneInteraction(id: string) {
  const spec = getSceneInteraction(id);
  if (
    spec?.activation &&
    !spec.activateOnFirstTouch &&
    !sceneSelectionCanActivate(id)
  )
    return true;
  return runSceneInteractionActivation(id);
}
