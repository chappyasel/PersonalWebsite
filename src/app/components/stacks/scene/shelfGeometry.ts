// One dependency-free contract for the shelf render, prop contact planes,
// rigid-body walls, and ground shadows. Keep geometry here rather than in a
// component so the lazy physics chunk can share it without importing React.
export const SHELF_GEOMETRY = {
  width: 2.64,
  top: {
    centerY: 0,
    thickness: 0.07,
    depth: 0.85,
    centerZ: 0,
  },
  lower: {
    centerY: -0.87,
    thickness: 0.055,
    depth: 0.6,
    centerZ: -0.08,
  },
  groundY: -1.115,
  /** Reachable exercise bay around the narrowed shelves. It has no rendered
   * box, but the solver needs an honest footprint around its loose props. */
  floor: {
    width: 4.4,
    depth: 2.6,
    centerZ: -0.25,
  },
  strapInsetX: 0.25,
  strapZ: -0.32,
} as const;

export const SHELF_SURFACE = {
  top: SHELF_GEOMETRY.top.centerY + SHELF_GEOMETRY.top.thickness / 2,
  lower: SHELF_GEOMETRY.lower.centerY + SHELF_GEOMETRY.lower.thickness / 2,
} as const;

export const SHELF_UNDERSIDE = {
  top: SHELF_GEOMETRY.top.centerY - SHELF_GEOMETRY.top.thickness / 2,
  lower: SHELF_GEOMETRY.lower.centerY - SHELF_GEOMETRY.lower.thickness / 2,
} as const;

export const LOWER_SHELF_HEADROOM = SHELF_UNDERSIDE.top - SHELF_SURFACE.lower;
