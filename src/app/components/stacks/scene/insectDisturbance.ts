import { nearPropApproach } from "./propApproachState";

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

/** A prop up at the camera (PropApproach) is already in hand: the pointer
 * resting on it is not a reach for it. Hover and focus on the near prop are
 * therefore not disturbances. Otherwise nothing could land on it, and a
 * butterfly already there left the moment the cursor crossed the prop, which
 * up close is nearly always (owner: "the butterfly disappears when it's near
 * the thing"). Presses and drags still count. */
export function insectInteractionForOwner(
  ownerId: string | null,
  interaction: InsectInteractionState,
): InsectInteractionState {
  if (!ownerId || nearPropApproach()?.id !== ownerId) return interaction;
  return {
    ...interaction,
    hovered: interaction.hovered === ownerId ? null : interaction.hovered,
    focusedInteraction:
      interaction.focusedInteraction === ownerId
        ? null
        : interaction.focusedInteraction,
  };
}

/** While a visitor carries a prop, that prop is the only useful landing
 * candidate. The shelf-wide drag response rejects every other Perch. */
export function butterflyPerchCanReceiveLanding(
  ownerId: string | null,
  interaction: InsectInteractionState,
) {
  if (interaction.dragging)
    return ownerId !== null && ownerId === interaction.dragging;
  return !insectOwnerIsDisturbed(
    ownerId,
    insectInteractionForOwner(ownerId, interaction),
  );
}
