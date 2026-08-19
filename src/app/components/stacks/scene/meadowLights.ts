/**
 * Practical lights the meadow can see — the "why doesn't the lamp light the
 * grass" fix (owner, round-2 browse).
 *
 * The grass/terrain shaders are deliberately unlit (their lighting is baked
 * — that is what buys 11k tufts at mobile budgets), so a real SpotLight like
 * the Talks floor lamp pools warm light on every standard-material prop and
 * then stops existing exactly at the lawn. This registry is the bridge:
 * whichever unit owns a ground-pooling practical registers its live world
 * position, pool radius, and lit factor here, and Meadow folds the entries
 * into a small uniform array each frame — an analytic pool that follows the
 * real light's color, reach, and click-off egg.
 *
 * Shared-contract module in the seated.ts mold: dependency-free (no React,
 * no three) so the lazily mounted units and the meadow can both import it
 * without pulling each other into their chunks. Registration order is mount
 * order; MEADOW_LAMP_MAX is the shader array's fixed size, and overflow
 * registrations are dropped loudly in dev rather than silently reshuffled.
 */

export type MeadowLamp = {
  /** World-space position of the light's mouth (y matters: the pool term
   * uses it for a soft vertical falloff so a shelf lamp could join later). */
  x: number;
  y: number;
  z: number;
  /** Ground-pool radius in world units (≈ height · tan(cone angle)). */
  radius: number;
  /** Relative pool brightness, 1 = the floor lamp's. Desk lamps spilling
   * over a plank edge register well under 1. */
  strength: number;
  /** The practical's eased lit factor — the same ref its glow sprites read,
   * so the grass pool follows the click-off egg frame-for-frame. */
  litRef: { current: number };
  /** World-space light source. This is deliberately separate from x/y/z:
   * angled desk lamps register their meadow pool where the cone lands, while
   * the moth cone begins at the visible shade mouth that emitted it. */
  sourceX: number;
  sourceY: number;
  sourceZ: number;
  /** World-space target of the visible light cone. Moths occupy the volume
   * between source and target rather than orbiting the shade mouth. */
  coneTargetX: number;
  coneTargetY: number;
  coneTargetZ: number;
  /** Night moth density and cone volume. Larger practicals support more
   * insects, a deeper flight volume, and a broader radial spread. */
  mothCount: number;
  mothNearDistance: number;
  mothFarDistance: number;
  mothMaxRadius: number;
};

export const MEADOW_LAMP_MAX = 6;

/** Measured widest rim of the scaled Talks floor-lamp shade. The conservative
 * below-mouth clearance test shares this source of truth with the fixture. */
export const TALKS_FLOOR_SHADE_RADIUS = 0.0878 * 2.85;

export const MOTH_LIGHT_PROFILES = {
  desk: { count: 2, nearDistance: 0.18, farDistance: 0.74, maxRadius: 0.72 },
  floor: { count: 5, nearDistance: 0.32, farDistance: 1.8, maxRadius: 1.55 },
} as const;

const lamps = new Map<string, MeadowLamp>();

export function registerMeadowLamp(id: string, lamp: MeadowLamp): () => void {
  if (!lamps.has(id) && lamps.size >= MEADOW_LAMP_MAX) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[stacks] meadow lamp registry full (${MEADOW_LAMP_MAX}); dropping "${id}" — raise MEADOW_LAMP_MAX and the shader array together.`,
      );
    }
    return () => undefined;
  }
  lamps.set(id, lamp);
  return () => {
    lamps.delete(id);
  };
}

/** Meadow reads this inside useFrame — a live view, never a copy. */
export function getMeadowLamps(): ReadonlyMap<string, MeadowLamp> {
  return lamps;
}
