/**
 * Pure target math for the ride camera's shift: pointer parallax, WASD and
 * arrow keys, and an ambient drift, all summed into one target.
 *
 * The shift is a truck, not an orbit. The camera moves sideways across the
 * road (and up and down), and the aim follows the car only by `aimShare`
 * of that offset, so the vanishing point slides one way while the car
 * drifts a little the other. At the landscape chase distance the full
 * lateral shift is about 17 degrees, with the vanishing point ending near
 * 12 degrees off centre and the car about 5 degrees the other way: the
 * road angles, the flanks separate, the car is no longer the pivot. The
 * earlier 1.15 m orbit with the aim pinned on the car read as the
 * background sliding behind a fixed car. A quadratic radius term still
 * pulls the eye toward the car so the motion reads as a sphere segment.
 * The rest pose is untouched: a centred pointer and no keys is exactly
 * zero, so the car, sun and vanishing point stay stacked.
 *
 * Kept pure so neutrality, bounds, convexity, portrait scaling, key
 * handling and the reduced-motion zero are all assertable without a
 * renderer. The component applies frame-rate-independent exponential
 * damping on top.
 */
export const VISION_RIDE_PARALLAX = {
  /** Metres of camera offset at the shift's extremes (landscape). The road
   * is 4 m to each side of centre, so the eye stays over the road. */
  maxX: 2.1,
  maxY: 0.6,
  /** Quadratic pull toward the car at full radius: the convex depth. */
  convexZ: 0.56,
  /** Fraction of the lateral offset the look-at point shares with the
   * camera. 0 is an orbit about the car, 1 a pure truck with the vanishing
   * point pinned. */
  aimShare: 0.3,
  /** Portrait keeps the effect but shallower. */
  portraitScale: 0.55,
  /** Exponential damping rate for the component (per second). */
  dampingPerSecond: 3,
  /** Rate a held key ramps its axis toward full (per second), and back. */
  keyRampPerSecond: 2.5,
  /** Ambient sway amplitudes (metres) and rates (Hz). */
  swayX: 0.16,
  swayY: 0.06,
  swayXHz: 0.05,
  swayX2Hz: 0.023,
  swayYHz: 0.041,
} as const;

/** Keys that shift the ride camera, by `KeyboardEvent.code` so the
 * layout does not matter: WASD or the arrows. */
export const VISION_RIDE_SHIFT_KEYS = {
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
} as const;

export function isVisionRideShiftKey(code: string) {
  return Object.values(VISION_RIDE_SHIFT_KEYS).some((codes) =>
    (codes as readonly string[]).includes(code),
  );
}

/** The [-1, 1] axis targets a set of held key codes asks for. Opposing keys
 * cancel; unrelated keys are ignored. */
export function keyAxes(pressed: ReadonlySet<string>) {
  const held = (codes: readonly string[]) =>
    codes.some((code) => pressed.has(code)) ? 1 : 0;
  const keys = VISION_RIDE_SHIFT_KEYS;
  return {
    x: held(keys.right) - held(keys.left),
    y: held(keys.up) - held(keys.down),
  };
}

/** Move a key axis toward its target at the ramp rate, never overshooting. */
export function rampKeyAxis(current: number, target: number, delta: number) {
  const step = VISION_RIDE_PARALLAX.keyRampPerSecond * Math.max(0, delta);
  if (current < target) return Math.min(target, current + step);
  if (current > target) return Math.max(target, current - step);
  return current;
}

/** Look-at x for a camera offset laterally by `parallaxX`. */
export function chaseAimX(parallaxX: number) {
  return parallaxX * VISION_RIDE_PARALLAX.aimShare;
}

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

/**
 * Window-space pointer to the [-1, 1] range react-three-fiber uses, y up.
 * The ride's fullscreen "Remove Vision Pro" button sits over the canvas,
 * so the fiber pointer never updates during the ride; the world listens on
 * the window and normalises with this instead.
 */
export function normalizedPointer(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
) {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp((clientX / width) * 2 - 1),
    y: clamp(1 - (clientY / height) * 2),
  };
}

/** Offset for a [-1, 1] shift input (pointer plus keys, clamped);
 * {0,0,0} exactly at a centred, key-free input. */
export function pointerParallax(pointerX: number, pointerY: number) {
  const { maxX, maxY, convexZ } = VISION_RIDE_PARALLAX;
  const x = clamp(pointerX) * maxX;
  const y = clamp(pointerY) * maxY;
  const radius = (x / maxX) ** 2 + (maxY > 0 ? (y / maxY) ** 2 : 0);
  const pull = convexZ * Math.min(1, radius * 0.5);
  return { x, y, z: pull === 0 ? 0 : -pull };
}

/** Slow autonomous drift; two incommensurate rates so the path never
 * visibly loops. */
export function ambientSway(time: number) {
  const { swayX, swayY, swayXHz, swayX2Hz, swayYHz } = VISION_RIDE_PARALLAX;
  const tau = Math.PI * 2;
  return {
    x:
      Math.sin(time * tau * swayXHz) * swayX * 0.65 +
      Math.sin(time * tau * swayX2Hz + 1.7) * swayX * 0.35,
    y: Math.sin(time * tau * swayYHz + 0.8) * swayY,
  };
}

export type ParallaxTarget = Readonly<{ x: number; y: number; z: number }>;

export function parallaxTarget(input: {
  pointerX: number;
  pointerY: number;
  time: number;
  portrait: boolean;
  reducedMotion: boolean;
}): ParallaxTarget {
  if (input.reducedMotion) return { x: 0, y: 0, z: 0 };
  const scale = input.portrait ? VISION_RIDE_PARALLAX.portraitScale : 1;
  const pointer = pointerParallax(input.pointerX, input.pointerY);
  const sway = ambientSway(input.time);
  return {
    x: (pointer.x + sway.x) * scale,
    y: (pointer.y + sway.y) * scale,
    z: pointer.z * scale,
  };
}
