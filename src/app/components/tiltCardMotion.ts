import type { SpringOptions } from "framer-motion";

// Scale overshoots once before settling. Tilt follows the pointer
// with more damping so moving across a card does not keep it wobbling.
export const cardInteractionSpring: SpringOptions = {
  damping: 15,
  stiffness: 300,
  mass: 0.8,
  // Scale moves in hundredths. Keep the small rebound above the rest cutoff.
  restDelta: 0.0001,
  restSpeed: 0.01,
};

export const cardTiltSpring: SpringOptions = {
  damping: 18,
  stiffness: 180,
  mass: 0.9,
};

export const cardPressedScale = 0.975;

export function tiltCardHoverEnabled(
  reduceMotion: boolean,
  fineHover: boolean,
) {
  return !reduceMotion && fineHover;
}
