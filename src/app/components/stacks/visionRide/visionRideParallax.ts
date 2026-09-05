/**
 * Pure target math for the ride camera's pointer swing and ambient drift.
 *
 * The swing is a parabola around the car. The eye leaves the road's centre
 * line sideways and, the further out it goes, the more it pulls forward
 * along z = D - k x^2, so full travel lands on a rear three-quarter view:
 * 45 degrees off the car's axis at the anchor, with the eye still over the
 * road. The end of the path sits at the wall on every depth the breath,
 * the wheel and the pedal can produce, so the angle at full swing is the
 * same whether the car is near or far; the pull-in is what changes. The
 * aim follows only `aimShare` of the lateral offset, so the vanishing
 * point slides one way while the car drifts a little the other and the
 * flanks separate. The earlier truck (2.1 m, a 0.28 m convex pull) topped
 * out at 17 degrees and read as the background sliding behind a fixed
 * car.
 *
 * The path is walked by angle, not by lateral metres: a swing fraction is
 * a fraction of the end angle, and the eye is wherever the parabola
 * crosses that bearing from the anchor. Walked by x instead, the last
 * fifth of the pointer's travel did half the rotation and most of the
 * pull, which read as a whip at either end of a sweep.
 *
 * The rest pose is untouched: a centred pointer and no keys is exactly
 * zero, so the car, sun and vanishing point stay stacked. Kept pure so the
 * wall, the end angle, the parabola, portrait scaling and the
 * reduced-motion zero are all assertable without a renderer. The component
 * follows the swing fraction and the lift with rate-limited critically
 * damped springs (`visionRideSmoothing.ts`), then caps the swing by
 * projecting the car's corners into the live frame.
 */
export const VISION_RIDE_PARALLAX = {
  /** Farthest the eye may sit from the road's centre line, in metres. The
   * road is 4 m to each side, but the valley's ridge feet cross the
   * shoulder by up to 1.3 m and rise fast. Measured over the whole period,
   * the surface under |x| = 3 never tops 0.5 m and under 3.2 m it reaches
   * 0.85 m; the eye's lowest pass (lift, sway and bob all down) is 0.95 m. */
  wallX: 3,
  /** Angle off the car's axis, at the anchor, that full swing reaches: a
   * rear three-quarter view. */
  swingDegrees: 45,
  maxY: 0.6,
  /** Fraction of the lateral offset the look-at point shares with the
   * camera near the centre. 0 is an orbit about the car, 1 a pure truck
   * with the vanishing point pinned. The share is given up quadratically
   * toward the end of the swing: at the wall the rear bumper is only
   * 0.6 m ahead of the eye, and with the aim still sharing the offset its
   * far corner left a 16:9 frame at 46 degrees, which capped the swing at
   * 39. Aimed at the car, the corner sits at 36 and the full 45 fits. */
  aimShare: 0.3,
  /** Portrait input is no longer pre-scaled: the frame-fit cap limits the
   * swing to what a narrow frame can hold, and pre-scaling on top of it
   * left a phone short of even that. Idle sway still gets more travel. */
  portraitInputScale: 1,
  portraitSwayScale: 1.3,
  portraitSwayTimeScale: 1.65,
  /** Spring for the swing fraction: a nudge answers within a second, a
   * side-to-side sweep is capped to a three-second pan (0.7 of the
   * [-1, 1] range per second is about 32 degrees per second at the end
   * angle). */
  swing: { omega: 3.2, maxSpeed: 0.7 },
  /** Spring for the lift, metres. */
  lift: { omega: 3.2, maxSpeed: 0.5 },
  /** Ambient sway: lateral as a fraction of the swing, vertical in metres,
   * and the rates in Hz. */
  swayX: 0.05,
  swayY: 0.06,
  swayXHz: 0.05,
  swayX2Hz: 0.023,
  swayYHz: 0.041,
} as const;

/** Look-at x for a camera offset laterally by `x` at swing fraction
 * `swing`: the truck's share near the centre, an aim on the car at the
 * end. */
export function chaseAimX(x: number, swing: number) {
  const s = Math.min(1, Math.abs(swing));
  const aim = x * VISION_RIDE_PARALLAX.aimShare * (1 - s * s);
  return aim === 0 ? 0 : aim;
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

/** Swing fraction in [-1, 1] and lift in metres for a [-1, 1] pointer;
 * {0, 0} exactly at a centred input. */
export function pointerParallax(pointerX: number, pointerY: number) {
  const swing = clamp(pointerX);
  const y = clamp(pointerY) * VISION_RIDE_PARALLAX.maxY;
  return { swing: swing === 0 ? 0 : swing, y: y === 0 ? 0 : y };
}

/**
 * Eye position on the swing path for a swing fraction, relative to the
 * car's anchor: `x` metres across the road and `zRel` metres behind the
 * anchor. `anchorDistance` is the live on-axis distance from the eye to
 * the anchor (the breath, wheel and pedal already applied). The path is
 * the parabola z = D - k x^2 from the settled chase to its end: the wall,
 * or the point on the anchor's circle at the end angle when that is
 * nearer the centre line. The fraction is a fraction of the end angle,
 * and the eye is where the parabola crosses that bearing, so the view
 * turns evenly across the whole travel.
 */
export function swingPath(anchorDistance: number, swing: number) {
  const { wallX, swingDegrees } = VISION_RIDE_PARALLAX;
  const endAngle = (swingDegrees * Math.PI) / 180;
  const distance = Math.max(0, anchorDistance);
  const s = clamp(swing);
  const xEnd = Math.min(wallX, distance * Math.sin(endAngle));
  const zEnd = xEnd / Math.tan(endAngle);
  const pull = Math.max(0, distance - zEnd);
  if (s === 0 || xEnd === 0) return { x: 0, zRel: distance };
  const k = pull / (xEnd * xEnd);
  const tangent = Math.tan(Math.abs(s) * endAngle);
  // tan(angle) = x / (D - k x^2): the positive root of k t x^2 + x - D t.
  const kt = k * tangent;
  const magnitude =
    kt < 1e-9
      ? distance * tangent
      : (-1 + Math.sqrt(1 + 4 * kt * distance * tangent)) / (2 * kt);
  const x = Math.min(xEnd, magnitude) * Math.sign(s);
  return { x, zRel: distance - k * x * x };
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

export type ParallaxTarget = Readonly<{ swing: number; y: number }>;

export function parallaxTarget(input: {
  pointerX: number;
  pointerY: number;
  time: number;
  portrait: boolean;
  reducedMotion: boolean;
}): ParallaxTarget {
  if (input.reducedMotion) return { swing: 0, y: 0 };
  const inputScale = input.portrait
    ? VISION_RIDE_PARALLAX.portraitInputScale
    : 1;
  const swayScale = input.portrait ? VISION_RIDE_PARALLAX.portraitSwayScale : 1;
  const swayTime =
    input.time *
    (input.portrait ? VISION_RIDE_PARALLAX.portraitSwayTimeScale : 1);
  const pointer = pointerParallax(input.pointerX, input.pointerY);
  const sway = ambientSway(swayTime);
  // The sway rides on top of the pointer but the total is clamped: the
  // wall is the wall.
  const swing = clamp(pointer.swing * inputScale + sway.x * swayScale);
  return {
    swing: swing === 0 ? 0 : swing,
    y: pointer.y * inputScale + sway.y * swayScale,
  };
}
