/**
 * Colours the world shaders are templated from, kept in one place so the
 * reference-matching decisions are readable and testable without a GPU.
 * Values are linear; the composer's ACES pass darkens and desaturates the
 * upper mids, which is why the horizon and the sun's foot are authored
 * hotter than they will display.
 */
export type Rgb = readonly [number, number, number];

export type VisionRidePalette = Readonly<{
  skyTop: Rgb;
  skyUpper: Rgb;
  skyViolet: Rgb;
  skyMagenta: Rgb;
  skyPink: Rgb;
  skyHorizon: Rgb;
  skyHorizonCrest: Rgb;
  sunTop: Rgb;
  sunMiddle: Rgb;
  sunFoot: Rgb;
  surfaceBase: Rgb;
  surfaceBottom: Rgb;
  roadLine: Rgb;
  surfaceFogNear: number;
  surfaceFogFar: number;
  surfaceFogMax: number;
  surfaceGradientBottom: number;
  surfaceGradientTop: number;
}>;

/** Display-space samples from the approved reference image. These are the
 * calibration targets after tone mapping, not shader inputs. */
export const VISION_RIDE_REFERENCE_SRGB = {
  skyTop: [4, 7, 28],
  skyUpper: [97, 0, 105],
  skyViolet: [140, 0, 125],
  skyMagenta: [179, 1, 136],
  skyPink: [216, 1, 137],
  skyCoral: [246, 13, 126],
  horizonOrange: [255, 150, 83],
  sunTop: [247, 254, 52],
  sunMiddle: [244, 168, 153],
  sunFoot: [226, 17, 236],
  mountainFill: [20, 12, 66],
  roadNear: [61, 2, 84],
} as const;

export const VISION_RIDE_PALETTE = {
  /** Linear shader inputs calibrated against the display samples above. */
  skyTop: [0.002, 0.004, 0.026] as Rgb,
  skyUpper: [0.025, 0.008, 0.105] as Rgb,
  skyViolet: [0.18, 0.004, 0.25] as Rgb,
  skyMagenta: [0.72, 0.004, 0.38] as Rgb,
  skyPink: [0.96, 0.025, 0.31] as Rgb,
  /** Sky at the horizon: a saturated orange-red coral, not the pale peach
   * the earlier (1.0, 0.48, 0.20) became after tone mapping. */
  skyHorizon: [1.0, 0.18, 0.05] as Rgb,
  /** Horizon at the crest of the breathing cycle: a touch warmer. */
  skyHorizonCrest: [1.0, 0.24, 0.06] as Rgb,
  /** The striped synthwave sun: electric yellow at the crown, warm peach
   * through the middle, and hot pink where it meets the horizon. */
  sunTop: [0.93, 1.0, 0.035] as Rgb,
  sunMiddle: [0.92, 0.34, 0.29] as Rgb,
  sunFoot: [0.78, 0.004, 0.84] as Rgb,
  /** Shared road and mountain fill above the foreground gradient. */
  surfaceBase: [0.02, 0.012, 0.07] as Rgb,
  /** Shared road and mountain fill at the bottom of the viewport. The
   * reference's foreground reads about #390351 on screen. Calibrated from
   * the render, where the far base
   * (0.02, 0.012, 0.07) displayed as (15, 6, 55): the composer's darks
   * slope is about 0.7, so the target's display-linear (0.041, 0.001,
   * 0.082) wants roughly this in scene-linear. Red up, green out, blue up. */
  surfaceBottom: [0.085, 0.004, 0.105] as Rgb,
  /** The wire: cyan-blue, unchanged. */
  roadLine: [0.14, 0.34, 1.0] as Rgb,
  /** View-space fog range. The near two-thirds of the chase remain crisp;
   * the final stretch converges into one horizon instead of exposing the
   * recycled landscape layers. */
  surfaceFogNear: 70,
  surfaceFogFar: 215,
  /** Full convergence is required before the last recycled sheet. Its fog
   * colour is evaluated from the sky shader, making the far edge invisible. */
  surfaceFogMax: 1,
  /** Viewport y is measured from the bottom in [0, 1]. Hold the foreground
   * tint briefly, then finish the blend above the frame midpoint. */
  surfaceGradientBottom: 0.06,
  surfaceGradientTop: 0.68,
} as const satisfies VisionRidePalette;

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Foreground-tint weight for viewport y measured from the bottom. */
export function surfaceGradientWeight(viewportY: number) {
  const { surfaceGradientBottom, surfaceGradientTop } = VISION_RIDE_PALETTE;
  return 1 - smoothstep(surfaceGradientBottom, surfaceGradientTop, viewportY);
}

/** Shared road and mountain fill at viewport y measured from the bottom. */
export function surfaceColorAtViewportY(viewportY: number): Rgb {
  const weight = surfaceGradientWeight(viewportY);
  const { surfaceBase, surfaceBottom } = VISION_RIDE_PALETTE;
  return [
    surfaceBase[0] + (surfaceBottom[0] - surfaceBase[0]) * weight,
    surfaceBase[1] + (surfaceBottom[1] - surfaceBase[1]) * weight,
    surfaceBase[2] + (surfaceBottom[2] - surfaceBase[2]) * weight,
  ];
}

/** Shared road/mountain fog weight for positive view-space depth. */
export function surfaceFogWeight(viewDepth: number) {
  const { surfaceFogNear, surfaceFogFar, surfaceFogMax } = VISION_RIDE_PALETTE;
  return smoothstep(surfaceFogNear, surfaceFogFar, viewDepth) * surfaceFogMax;
}

/** GLSL literal for a colour. */
export function glslVec3([r, g, b]: Rgb) {
  return `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
}
