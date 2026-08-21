export type PropReactionInteractionState = {
  hovered: string | null;
  focusedInteraction: string | null;
  pressedInteraction: string | null;
  dragging: string | null;
};

/** A prop gives the same held reaction to fine-pointer hover and Touch Focus.
 * A new press belongs to the Pickup Cue, and carrying owns the prop's motion. */
export function propReactionIsEngaged(
  state: PropReactionInteractionState,
  interactionId: string,
) {
  return (
    state.dragging !== interactionId &&
    (state.hovered === interactionId ||
      state.focusedInteraction === interactionId)
  );
}
