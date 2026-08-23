import { SHELF_SURFACE } from "./shelfGeometry";

/** Evenly packed lower-shelf centers. Their measured front-view footprints,
 * including the lighthouse tray rather than only its tower, leave 0.022
 * units between every pair of neighbors.
 *
 * 2026-08-23: the succulent bowl left this row for the top plank (in front
 * of the lamp) and the Systems shelf's lighthouse print arrived between the
 * Vineyard cutout and the lighthouse it shows. Everything from the mug to
 * the cutout slid 0.292 left, the bowl's footprint plus one gap, which is
 * exactly the room a 0.22-wide print with its frame needs at the same
 * spacing. The lighthouse itself cannot move: its tray already stops 2 cm
 * short of the plank's end. */
export const MUSINGS_LOWER_LAYOUT = {
  mugX: -1.175,
  paperX: -0.743,
  trustX: -0.205,
  signX: 0.143,
  cutoutX: 0.505,
  photoX: 0.892,
  /** The lighthouse stands in a 0.125 sand tray (`units/SandTray.tsx`).
   * Farther right, the rim would overhang the plank's end. At 1.174 the rim
   * stops 2 cm short of it and leaves the same 0.022 gap as the rest of the
   * row against the print's frame. */
  lighthouseX: 1.174,
} as const;

/** The Gay Head print (`/images/stacks/v8/systems-lighthouse.webp`, 819 ×
 * 1024), narrower than it stood on Systems (0.27) so the row keeps its
 * 0.022 gaps. Set back level with the tray, turned a little toward the
 * camera like the lighthouse beside it. */
export const MUSINGS_LIGHTHOUSE_PRINT = {
  id: "systems-lighthouse-v8",
  src: "/images/stacks/v8/systems-lighthouse.webp",
  aspect: 819 / 1024,
  width: 0.22,
  base: [MUSINGS_LOWER_LAYOUT.photoX, 0, -0.08],
  yaw: -0.18,
} as const;

/** The succulent bowl on the top plank, left end, in front of the lamp's
 * foot: the lamp root is at x −1.12, z −0.07 and its head reaches right, so
 * the front-left corner of the plank is the one clear patch up there. */
export const MUSINGS_TOP_PLANT = {
  base: [-1.13, 0, 0.24],
} as const;

/** Shared physical dimensions for the Musings shelf's authored paper stack. */
export const MUSINGS_PAPER_STACK = {
  base: [MUSINGS_LOWER_LAYOUT.paperX, 0, 0],
  width: 0.559,
  depth: 0.432,
  sheetThickness: 0.0022,
  sheetStep: 0.0028,
  sheetCount: 5,
  /** The visible sheets are intentionally below the physics extractor's
   * minimum thickness. This low box spans the complete shuffled stack. */
  colliderWidth: 0.6,
  colliderDepth: 0.465,
  colliderHeight: 0.0134,
  colliderCenterY: 0.0067,
  /** Keeps a camera-facing sheet's lower edge clear of the plank. */
  heldClearance: 0.24,
} as const;

/** The printed essay "Trust in the Age of Acceleration" (The AI Collective,
 * 2025-04-03): a thread-sewn booklet standing on a small wooden reading
 * stand where three anonymous flat books used to lie. Shared by the prop
 * (`units/TrustEssay.tsx`), the Perch catalogue and the landing tests, so
 * the anchor below is derived from the same numbers the geometry is. */
export const MUSINGS_TRUST_ESSAY = {
  base: [MUSINGS_LOWER_LAYOUT.trustX, 0, -0.02],
  /** Full US Letter, matching the loose GPT-3 pages beside it. The booklet
   * stands portrait, so their flat width becomes its height. */
  width: MUSINGS_PAPER_STACK.depth,
  height: MUSINGS_PAPER_STACK.width,
  thickness: 0.008,
  /** Recline back from vertical, radians. Steep enough that the camera,
   * ~11° above the lower shelf, sees almost the whole cover. */
  lean: 0.35,
  stand: {
    width: 0.288,
    height: 0.018,
    depth: 0.12,
    lipHeight: 0.024,
    lipDepth: 0.01,
  },
  /** Where the booklet's bottom edge meets the stand, stand-local z. */
  footZ: 0.03,
} as const;

/** Height along the cover, from its bottom edge, of the Perch contact. */
const TRUST_COVER_PERCH_HEIGHT = MUSINGS_TRUST_ESSAY.height * 0.67;

/** Analytic contact on the reclined cover, upper third and a little right of
 * centre, in Unit-local coordinates. The lamp shade is the precedent for a
 * Perch on a tilted face. Authored from the constants above rather than read
 * back from the running scene; the resolver still snaps to the real cover
 * triangle under it. */
export const MUSINGS_TRUST_COVER_PERCH = {
  position: [
    MUSINGS_TRUST_ESSAY.base[0] + 0.05,
    SHELF_SURFACE.lower +
      MUSINGS_TRUST_ESSAY.stand.height +
      TRUST_COVER_PERCH_HEIGHT * Math.cos(MUSINGS_TRUST_ESSAY.lean),
    MUSINGS_TRUST_ESSAY.base[2] +
      MUSINGS_TRUST_ESSAY.footZ -
      TRUST_COVER_PERCH_HEIGHT * Math.sin(MUSINGS_TRUST_ESSAY.lean),
  ],
  normal: [
    0,
    Math.sin(MUSINGS_TRUST_ESSAY.lean),
    Math.cos(MUSINGS_TRUST_ESSAY.lean),
  ],
} as const;
