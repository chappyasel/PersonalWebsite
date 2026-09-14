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
  // Slightly overdamped so the spring does not overshoot the tilt limit.
  damping: 26,
  stiffness: 180,
  mass: 0.9,
};

export const cardPressedScale = 0.975;
export const CARD_MAX_TILT_DEG = 2;
export const CARD_MAX_TILT_DEPTH_PX = 6;

/** Bound both the angle and corner depth. Large cards need smaller angles
 * to keep their perspective movement as quiet as small cards. */
export function cardHoverTilt(
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
  amplitude = CARD_MAX_TILT_DEG,
) {
  if (width <= 0 || height <= 0) return { rotateX: 0, rotateY: 0 };
  const x = Math.max(-1, Math.min(1, offsetX / (width / 2)));
  const y = Math.max(-1, Math.min(1, offsetY / (height / 2)));
  const radius = Math.hypot(width, height) / 2;
  const maxAngle = Math.min(
    Math.max(0, amplitude),
    CARD_MAX_TILT_DEG,
    (Math.atan(CARD_MAX_TILT_DEPTH_PX / radius) * 180) / Math.PI,
  );
  const strength = maxAngle / Math.max(1, Math.hypot(x, y));
  return { rotateX: -y * strength, rotateY: x * strength };
}

export function tiltCardHoverEnabled(
  reduceMotion: boolean,
  fineHover: boolean,
) {
  return !reduceMotion && fineHover;
}
