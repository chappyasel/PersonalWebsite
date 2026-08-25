// Full Stack detection: the six Liar's Dice restacked as one vertical tower.
//
// The check reads the solver's view of the dice, so it only ever passes on
// the simulated path — the authored fallback springs props home and cannot
// hold a stack. Every die must have been picked up at least once: an
// untouched die is an authored-support static, not a dynamic body, and a
// five-die column balanced on an unmoved base does not count as restacking
// all six.

/** Grabbable hoverKey prefix shared by the six dice in DicePyramid. */
export const DICE_PROP_KEY_PREFIX = "link:projects:dice:";

export const DICE_TOWER_COUNT = 6;

export type DiceTowerCandidate = Readonly<{
  key: string;
  x: number;
  y: number;
  z: number;
  /** World-space edge length of this die's collider. */
  size: number;
  /** A free simulated body the solver has put to sleep. Held, settling, and
   * parked-at-authored-pose dice are all excluded. */
  resting: boolean;
}>;

/** Each die must rest roughly one die-height above the previous one and stay
 * close enough to the shared column that it is plausibly supported by the die
 * below. The tolerances absorb slightly rotated dice; the authored pyramid
 * fails because its levels hold more than one die. */
const RISE_MIN = 0.55;
const RISE_MAX = 1.45;
const COLUMN_DRIFT_MAX = 0.75;

export function isDiceTower(
  candidates: readonly DiceTowerCandidate[],
): boolean {
  const byKey = new Map<string, DiceTowerCandidate>();
  for (const candidate of candidates)
    if (candidate.key.startsWith(DICE_PROP_KEY_PREFIX))
      byKey.set(candidate.key, candidate);
  if (byKey.size !== DICE_TOWER_COUNT) return false;

  const dice = [...byKey.values()];
  if (!dice.every((die) => die.resting && die.size > 0)) return false;

  const size =
    dice.reduce((sum, die) => sum + die.size, 0) / DICE_TOWER_COUNT;
  const sorted = [...dice].sort((a, b) => a.y - b.y);
  for (let level = 1; level < sorted.length; level += 1) {
    const below = sorted[level - 1]!;
    const above = sorted[level]!;
    const rise = above.y - below.y;
    if (rise < size * RISE_MIN || rise > size * RISE_MAX) return false;
    const drift = Math.hypot(above.x - below.x, above.z - below.z);
    if (drift > size * COLUMN_DRIFT_MAX) return false;
  }
  return true;
}
