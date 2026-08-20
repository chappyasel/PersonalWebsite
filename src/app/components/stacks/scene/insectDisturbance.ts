export type InsectInteractionState = {
  hovered: string | null;
  dragging: string | null;
  focusedInteraction: string | null;
  pressedInteraction: string | null;
};

/** Whether the owner of a Perch is under direct visitor interaction.
 * Fine pointers publish hover/drag while the coarse-pointer arbiter publishes
 * press/focus, so wildlife can react consistently without knowing the input
 * device that produced the interaction. */
export function insectOwnerIsDisturbed(
  ownerId: string | null,
  interaction: InsectInteractionState,
) {
  return Boolean(
    ownerId &&
      (ownerId === interaction.hovered ||
        ownerId === interaction.dragging ||
        ownerId === interaction.pressedInteraction ||
        ownerId === interaction.focusedInteraction),
  );
}
