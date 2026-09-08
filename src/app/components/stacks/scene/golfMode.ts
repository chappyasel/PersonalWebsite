/**
 * Golf mode, decided by what the visitor can see (golfVisibility.ts) rather
 * than by where the scroll rests. The rig measures the green's coverage
 * each frame and runs it through here; the continuous consumers, the depth
 * of field rack and the cup pivot, follow `weight`, and the ones that must
 * be on or off, the placard, the club, the hittable balls, the rail, follow
 * `engaged`, which has hysteresis and a short hold so a cursor resting on
 * the line cannot strobe them.
 */
export type GolfModeSource = "visibility" | "window";

export type GolfModeTuning = Readonly<{
  /** "visibility" is the site. "window" is the scroll window golf mode used
   * to be, kept for the console's before/after seam. */
  source: GolfModeSource;
  /** Coverage at which the focus and the pivot begin to blend in. */
  blendFrom: number;
  /** Coverage at and above which the mode is fully on: the blend is
   * complete and the switch flips. "As soon as you can see the entire
   * green" is a fraction below 1 so the fringe's last few pixels do not
   * decide it. */
  enterAbove: number;
  /** Coverage below which the switch flips off: "as soon as the shelf
   * starts to cover it". Between the two the switch keeps its state. */
  leaveBelow: number;
  /** The least time the switch stays put after flipping, seconds. */
  holdSeconds: number;
  /** Whether the neighbouring shelves count as occluders. */
  occluders: boolean;
}>;

export const GOLF_MODE_DEFAULT: GolfModeTuning = Object.freeze({
  source: "visibility",
  blendFrom: 0.7,
  enterAbove: 0.97,
  leaveBelow: 0.9,
  holdSeconds: 0.2,
  occluders: true,
});

export const GOLF_MODE_LIMITS = Object.freeze({
  blendFrom: Object.freeze({ min: 0, max: 1 }),
  enterAbove: Object.freeze({ min: 0, max: 1 }),
  leaveBelow: Object.freeze({ min: 0, max: 1 }),
  holdSeconds: Object.freeze({ min: 0, max: 2 }),
});

/** What the rig decided this frame. Written by CameraRig, read by the
 * lenses, GolfExperience's dev hook and the console; never awaited. */
export const golfMode = {
  /** Normalised coverage of the green, 0..1. */
  coverage: 0,
  /** The continuous target the rack and the pivot ease toward, 0..1. */
  weight: 0,
  /** The switch. Mirrors the store's `golfFocused`. */
  engaged: false,
  source: "visibility" as GolfModeSource,
};

export type GolfModeState = {
  engaged: boolean;
  /** Seconds since the switch last flipped. */
  heldFor: number;
};

export function createGolfModeState(engaged = false): GolfModeState {
  return { engaged, heldFor: Infinity };
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** The continuous weight for a coverage: 0 up to `blendFrom`, 1 from
 * `enterAbove`, eased between. */
export function golfModeWeight(
  coverage: number,
  tuning: Pick<GolfModeTuning, "blendFrom" | "enterAbove"> = GOLF_MODE_DEFAULT,
): number {
  return smoothstep(tuning.blendFrom, tuning.enterAbove, coverage);
}

/**
 * Advance the switch by one frame. Flips on at `enterAbove`, off below
 * `leaveBelow`, never sooner than `holdSeconds` after the last flip, and
 * keeps its state in between. Returns the switch.
 */
export function advanceGolfMode(
  state: GolfModeState,
  coverage: number,
  frameSeconds: number,
  tuning: Pick<
    GolfModeTuning,
    "enterAbove" | "leaveBelow" | "holdSeconds"
  > = GOLF_MODE_DEFAULT,
): boolean {
  state.heldFor += Math.max(0, frameSeconds);
  if (state.heldFor < tuning.holdSeconds) return state.engaged;
  const leaveBelow = Math.min(tuning.leaveBelow, tuning.enterAbove);
  const next = state.engaged
    ? coverage >= leaveBelow
    : coverage >= tuning.enterAbove;
  if (next !== state.engaged) {
    state.engaged = next;
    state.heldFor = 0;
  }
  return state.engaged;
}
