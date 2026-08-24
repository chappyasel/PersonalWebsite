export type PropReactionInteractionState = {
  hovered: string | null;
  focusedInteraction: string | null;
  pressedInteraction: string | null;
  dragging: string | null;
};

let reactionsSuppressed = false;

export function setPropReactionsSuppressed(suppressed: boolean) {
  reactionsSuppressed = suppressed;
}

export function propReactionsSuppressed() {
  return reactionsSuppressed;
}

/** A prop gives the same held reaction to fine-pointer hover and Touch Focus.
 * A new press belongs to the Pickup Cue, and carrying owns the prop's motion. */
export function propReactionIsEngaged(
  state: PropReactionInteractionState,
  interactionId: string,
) {
  if (reactionsSuppressed) return false;
  return (
    state.dragging !== interactionId &&
    (state.hovered === interactionId ||
      state.focusedInteraction === interactionId)
  );
}
