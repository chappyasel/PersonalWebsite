// Sizes and shelf arrangement for the Systems pill props, kept out of the
// components so the packing is testable without React or three — the same
// split `mioBottleGeometry` and `musingsShelfGeometry` already use.
//
// There are fifteen bottles and two cases in one bay here, and nothing about
// that fits by eye. `systemsPillLayout.test.ts` checks every pair against the
// sum of the two radii involved, so a retune that overlaps two bottles fails
// the unit suite instead of shipping as a prop growing out of another one.

export type PillOrganizerVariant = "smoke" | "white";
/** No black bottle. The pill CASES carry this corner's black-and-white split
 * (owner, 2026-08-23); a black bottle standing next to them competed with it,
 * and a cabinet of supplements is mostly white plastic and amber glass
 * anyway. `sand` is the third tone — a darker cream that separates two white
 * bottles standing side by side without introducing a colour. */
export type PillBottleTone = "white" | "amber" | "sand";
export type PillBottleCap = "white" | "slate";
export type PillBottleSize =
  | "tiny"
  | "small"
  | "medium"
  | "large"
  | "tall"
  | "tub";

/**
 * The real case, to the millimetre: 8.86 x 1.34 x 1.26 inches (owner,
 * 2026-08-23), which at the shelf family's 2.00 world units per metre is
 * 0.450 long x 0.068 deep x 0.064 tall. Everything else here is derived from
 * those three numbers, so the proportions cannot drift again.
 *
 * It is a LONG object — seven times its own height — and that is the whole
 * reason the arrangement below looks the way it does. Two of these will not
 * stand side by side anywhere on this plank: the notebook's right edge is at
 * x 0.311 and the desk lamp's left edge at 0.948 (both measured off the
 * scene, not guessed), so the bay is 0.636 wide and two cases need 0.92.
 */
const CASE_INCH = 0.0254 * 2;
export const PILL_CASE_TRAY_H = 1.26 * CASE_INCH * 0.8;
/** The bed of pills, visible THROUGH the lids. Without something under
 * translucent plastic the lid reads as a painted stripe on a solid block. */
export const PILL_CASE_FILL_H = 1.26 * CASE_INCH * 0.08;
/** A snap-on wafer, an eighth of the case's height. */
export const PILL_CASE_LID_H = 1.26 * CASE_INCH * 0.12;

/** World box, bottom at origin, with the height DERIVED — the unit stacks
 * these and a restated literal here floats the one on top. */
export const PILL_ORGANIZER = {
  length: 8.86 * CASE_INCH,
  depth: 1.34 * CASE_INCH,
  height: PILL_CASE_TRAY_H + PILL_CASE_FILL_H + PILL_CASE_LID_H,
} as const;

/**
 * Six bottles, at 2.00 world units per metre — a 30-count through a
 * protein-aisle tub.
 *
 * Three sizes was not enough variety (owner, 2026-08-23): they were one
 * cylinder at three scales, all about 1.5 diameters tall, so the cluster
 * read as a set rather than as a shelf that filled up one purchase at a
 * time. The range is in PROPORTION as well as size now — `tall` is a slim
 * 2.1 diameters, `tub` a squat 1.1 — which is what makes two neighbours
 * distinguishable at a glance.
 *
 * The ceiling on all of them is that a stack must not read as a tower: at
 * about 1.9 diameters and up, a lone bottle starts reading as a thermos, so
 * only `tall` goes there and only one pile uses it.
 */
export const PILL_BOTTLE_SIZES: Record<
  PillBottleSize,
  { radius: number; bodyHeight: number; capHeight: number }
> = {
  tiny: { radius: 0.028, bodyHeight: 0.058, capHeight: 0.018 },
  small: { radius: 0.033, bodyHeight: 0.079, capHeight: 0.022 },
  medium: { radius: 0.04, bodyHeight: 0.1, capHeight: 0.026 },
  large: { radius: 0.048, bodyHeight: 0.118, capHeight: 0.03 },
  tall: { radius: 0.038, bodyHeight: 0.135, capHeight: 0.026 },
  tub: { radius: 0.056, bodyHeight: 0.096, capHeight: 0.03 },
};

/** Total height, which is also the mount height for a bottle stacked on this
 * one's cap. Derived, so a stack cannot float when a size is retuned. */
export function pillBottleHeight(size: PillBottleSize) {
  const { bodyHeight, capHeight } = PILL_BOTTLE_SIZES[size];
  return bodyHeight + capHeight;
}

/**
 * Four cases — two of each — as two pairs, one behind the other and each
 * offset along its own length.
 *
 * At the real 0.450 length they cannot be four abreast, or even two abreast:
 * the bay between the notebook (right edge x 0.311) and the desk lamp (left
 * edge 0.948) measures 0.636, and two cases end to end need 0.92. So the
 * pairs are separated in DEPTH and slid along x, which leaves about 0.18 of
 * each pair's length sticking out past the other. That exposed end is the
 * whole reason the arrangement works — where the pairs overlap in x, the
 * front one hides the back one completely, because at two degrees above the
 * shelf line depth buys almost no vertical separation.
 *
 * Each top case is offset off the one it stands on for the same reason:
 * squarely stacked, the upper case covers every lid on the lower one and
 * takes its day letters with it.
 *
 * The front pair is built dark-on-the-bottom and the back pair light. The
 * desk lamp aims down this row and its spill is additive, so whatever sits
 * on top at the lamp end washes out — a black case there came out khaki. The
 * pairs therefore show opposite faces: one dark top with light letters, one
 * light top with dark ones.
 */
export const PILL_ORGANIZER_ROW: Array<{
  /** Unique per case, and the whole reason it exists: the hover key and the
   * React key are both built from it. Keyed by `variant` — the obvious
   * choice with one case of each colour — the two white cases registered as
   * ONE interaction and so did the two dark ones, so hovering either half of
   * a pair lit both. "A shared hoverKey makes N props one prop" is a
   * standing gotcha in this scene, and this is the fourth prop family to
   * meet it. `systemsPillLayout.test.ts` now holds these unique. */
  id: string;
  variant: PillOrganizerVariant;
  x: number;
  y: number;
  z: number;
  yaw: number;
  shade: number;
}> = [
  {
    id: "back-lower",
    variant: "white",
    x: 0.53,
    y: 0,
    z: -0.19,
    yaw: 0.42,
    shade: 0.34,
  },
  {
    id: "back-upper",
    variant: "smoke",
    x: 0.62,
    y: PILL_ORGANIZER.height,
    z: -0.202,
    yaw: 0.3,
    shade: 0.16,
  },
  {
    id: "front-lower",
    variant: "smoke",
    x: 0.63,
    y: 0,
    z: 0.09,
    yaw: 0.3,
    shade: 0.34,
  },
  {
    id: "front-upper",
    variant: "white",
    x: 0.72,
    y: PILL_ORGANIZER.height,
    z: 0.078,
    yaw: 0.2,
    shade: 0.16,
  },
];

/**
 * The supplement stack: fifteen bottles, standing where the cases are not.
 *
 * The cases take the whole right of the bay at their real length, so the
 * bottles moved left onto the notebook's end of the plank — which is also
 * where they belong, next to the creatine pouch. Three loose rows rather than
 * a grid, packed against the sum of the two radii involved (0.112 worst case,
 * tub to tub), which is why the spacings look uneven.
 *
 * Nothing here reaches past x 0.311: that is the near edge of the case pairs,
 * measured rather than guessed, and `systemsPillLayout.test.ts` holds every
 * bottle to it.
 */
export const PILL_BOTTLE_STACKS: Array<{
  x: number;
  z: number;
  /** Bottom to top; each one is seated on the cap of the one below it. */
  bottles: Array<{
    size: PillBottleSize;
    tone: PillBottleTone;
    cap: PillBottleCap;
    yaw: number;
  }>;
}> = [
  {
    x: -0.125,
    z: -0.1,
    bottles: [{ size: "medium", tone: "white", cap: "slate", yaw: 0.5 }],
  },
  {
    x: -0.015,
    z: -0.105,
    bottles: [
      { size: "tub", tone: "white", cap: "white", yaw: -0.3 },
      { size: "small", tone: "amber", cap: "white", yaw: 1.2 },
    ],
  },
  {
    x: 0.1,
    z: -0.1,
    bottles: [{ size: "large", tone: "amber", cap: "white", yaw: 0.9 }],
  },
  {
    x: 0.195,
    z: -0.105,
    bottles: [{ size: "medium", tone: "sand", cap: "white", yaw: -0.5 }],
  },
  {
    x: 0.275,
    z: -0.095,
    bottles: [{ size: "small", tone: "white", cap: "white", yaw: 0.2 }],
  },
  {
    x: -0.09,
    z: 0.025,
    bottles: [
      { size: "large", tone: "white", cap: "slate", yaw: 0.8 },
      { size: "tiny", tone: "amber", cap: "white", yaw: -0.9 },
    ],
  },
  {
    x: 0.02,
    z: 0.03,
    bottles: [{ size: "medium", tone: "amber", cap: "white", yaw: 0.3 }],
  },
  {
    x: 0.13,
    z: 0.025,
    bottles: [{ size: "tall", tone: "white", cap: "slate", yaw: -0.2 }],
  },
  {
    x: 0.24,
    z: 0.03,
    bottles: [{ size: "small", tone: "sand", cap: "white", yaw: 0.6 }],
  },
  {
    x: -0.11,
    z: 0.15,
    bottles: [{ size: "small", tone: "amber", cap: "white", yaw: -0.7 }],
  },
  {
    x: 0,
    z: 0.155,
    bottles: [{ size: "tiny", tone: "white", cap: "white", yaw: 1.1 }],
  },
  {
    x: 0.12,
    z: 0.15,
    bottles: [{ size: "medium", tone: "white", cap: "white", yaw: -1.1 }],
  },
  {
    x: 0.245,
    z: 0.155,
    bottles: [{ size: "tiny", tone: "amber", cap: "white", yaw: -0.3 }],
  },
];

/** Flattened once at module load, with each bottle's mount height summed from
 * the real heights of the bottles under it — a literal per level is how a
 * stack ends up floating the first time a size is retuned. */
export const PILL_BOTTLES = PILL_BOTTLE_STACKS.flatMap(
  (column, columnIndex) => {
    let y = 0;
    return column.bottles.map((bottle, level) => {
      const base = y;
      y += pillBottleHeight(bottle.size);
      return {
        ...bottle,
        key: `${columnIndex}-${level}`,
        x: column.x,
        z: column.z,
        y: base,
        level,
        /** The ground bottle owns the pile's contact shade. The ones above get
         * a sprite narrower than the bottle holding them up, so it hides
         * inside that bottle instead of smudging its label. */
        shade:
          level === 0 ? PILL_BOTTLE_SIZES[bottle.size].radius * 2.3 : 0.055,
      };
    });
  },
);

/** A loaded week of pills is ~250 g; full bottles run ~50 g to ~380 g. */
export const PILL_ORGANIZER_MASS_KG = 0.25;
export const PILL_BOTTLE_MASS_KG: Record<PillBottleSize, number> = {
  tiny: 0.05,
  small: 0.09,
  medium: 0.14,
  large: 0.22,
  tall: 0.17,
  tub: 0.38,
};
