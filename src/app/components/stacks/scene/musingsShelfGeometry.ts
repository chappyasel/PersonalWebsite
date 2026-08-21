/** Shared physical dimensions for the Musings shelf's authored paper stack. */
export const MUSINGS_PAPER_STACK = {
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

/** A typical 20 × 14 × 1.7 cm paperback at the scene's 2 u/m scale. */
export const MUSINGS_LOWER_BOOK = {
  x: 0.38,
  width: 0.4,
  height: 0.034,
  depth: 0.28,
  count: 3,
  staggerX: 0.012,
} as const;
