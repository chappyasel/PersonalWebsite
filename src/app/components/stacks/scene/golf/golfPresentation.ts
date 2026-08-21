import type { GolfBallState, GolfVec3 } from "./golfTypes";

export type GolfRgb = readonly [number, number, number];

/** Pure presentation policy shared by GLSL, Three materials and tests. Values
 * are linear shader inputs, before the meadow's custom distance-fog mix. */
export const GOLF_GREEN_COLORS = {
  lightLow: [0.11, 0.3, 0.08],
  lightHigh: [0.22, 0.49, 0.14],
  darkLow: [0.008, 0.018, 0.012],
  darkHigh: [0.012, 0.035, 0.018],
  lightFringe: [0.08, 0.22, 0.06],
  darkFringe: [0.006, 0.014, 0.011],
} satisfies Record<string, GolfRgb>;

/** Final linear-space ceiling after meadow lighting and fog. The shader's
 * colorspace conversion makes seemingly small linear greens read much
 * brighter on screen, so input-palette assertions alone are insufficient. */
export const GOLF_DARK_GREEN_FINAL_CEILING: GolfRgb = [0.018, 0.042, 0.025];

/** Fixed material colors avoid the late-added InstancedMesh color attribute
 * path that rendered black on some WebGL programs. */
export const GOLF_CONFETTI_COLORS = [
  "#ff9fbb",
  "#ffc3a0",
  "#ffe58a",
  "#b8f2c1",
  "#a7e8de",
  "#a9d6ff",
  "#c7b8ff",
  "#efb5ff",
] as const;

export const GOLF_CLUB_FINISH = {
  light: "#b8c2c9",
  dark: "#87949e",
  groovesLight: "#e3e8eb",
  groovesDark: "#c8d0d5",
  metalness: 0.78,
  roughness: 0.28,
} as const;

export const GOLF_BALL_FINISH = {
  dark: "#d8dfe2",
  darkMark: "#34434b",
  darkRoughness: 0.64,
  lightRoughness: 0.56,
  fog: false,
} as const;

export const GOLF_GREEN_FOG_SCALE = { light: 0.48, dark: 0.32 } as const;

export const GOLF_FOG_POLICY = {
  flag: (_dark: boolean) => false,
  confetti: false,
} as const;

export const GOLF_SOUND_POLICY = {
  turfImpact: true,
  cheer: false,
} as const;

export const GOLF_VISUAL_SPIN_MAX = 42;
export const GOLF_GREEN_BALL_SCALE = 2 / 3;
export const GOLF_BALL_LOW_RES_DPR = 1;
export const GOLF_BALL_LOW_RES_MAX_SCALE = 1.15;

/** Soften the ball's authored travel shrink when adaptive resolution reaches
 * its floor. Shots and collisions still use the regulation-sized ball. */
export function golfBallResolutionScale(pixelRatio: number) {
  if (!Number.isFinite(pixelRatio) || pixelRatio >= GOLF_BALL_LOW_RES_DPR)
    return 1;
  const floor = 0.6;
  const progress = Math.min(
    1,
    Math.max(
      0,
      (GOLF_BALL_LOW_RES_DPR - pixelRatio) /
        (GOLF_BALL_LOW_RES_DPR - floor),
    ),
  );
  return 1 + (GOLF_BALL_LOW_RES_MAX_SCALE - 1) * progress;
}

export function golfBallRenderedScale(
  authoredScale: number,
  pixelRatio: number,
) {
  if (authoredScale >= 1) return authoredScale;
  return Math.min(
    1,
    authoredScale * golfBallResolutionScale(pixelRatio),
  );
}

/** The authored foreground ball is deliberately readable at interaction
 * distance. Ease it down as it travels so its settled size agrees with the
 * much more distant flag and green, without changing its physical collider. */
export function golfBallVisualScale(
  ball: Pick<GolfBallState, "phase" | "position" | "start" | "impacts">,
  cup: GolfVec3,
) {
  if (
    ball.phase === "ready" ||
    ball.phase === "queued" ||
    ball.phase === "addressed" ||
    ball.phase === "resetting" ||
    ball.phase === "fading-in"
  )
    return 1;
  if (ball.impacts > 0 || ball.phase === "cup") return GOLF_GREEN_BALL_SCALE;

  const fullDistance = Math.max(
    0.001,
    Math.hypot(cup.x - ball.start.x, cup.z - ball.start.z),
  );
  const travelled = Math.hypot(
    ball.position.x - ball.start.x,
    ball.position.z - ball.start.z,
  );
  const progress = Math.min(1, travelled / (fullDistance * 0.75));
  const eased = progress * progress * (3 - 2 * progress);
  return 1 + (GOLF_GREEN_BALL_SCALE - 1) * eased;
}

/** Physical wedge backspin is too fast to sample legibly at 60 Hz. Preserve
 * its axis and direction while capping only the rendered angular step; the
 * solver continues to use the full angular velocity for contact transfer. */
export function golfVisualSpinStep(angularVelocity: GolfVec3, delta: number) {
  const magnitude = Math.hypot(
    angularVelocity.x,
    angularVelocity.y,
    angularVelocity.z,
  );
  const scale =
    magnitude > GOLF_VISUAL_SPIN_MAX ? GOLF_VISUAL_SPIN_MAX / magnitude : 1;
  return {
    x: angularVelocity.x * delta * scale,
    y: angularVelocity.y * delta * scale,
    z: angularVelocity.z * delta * scale,
  };
}

export function golfRgbGlsl(color: GolfRgb) {
  return `vec3(${color.map((value) => value.toFixed(3)).join(", ")})`;
}

export function golfColorLuminance(color: GolfRgb) {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
}

export function golfColorChroma(color: GolfRgb) {
  return Math.max(...color) - Math.min(...color);
}

export function golfLinearToSrgb(value: number) {
  return value <= 0.0031308
    ? value * 12.92
    : 1.055 * value ** (1 / 2.4) - 0.055;
}
