import { SHELF_GEOMETRY } from "./shelfGeometry";
import { CAMERA } from "./worldLayout";

export type AboutBootHorizontalBounds = Readonly<{
  x: number;
  width: number;
}>;

/** Project the horizontal silhouette of a head-on box onto the shelf's
 * z=0 boot plane. Checking all four x/z corners preserves both the inward
 * depth shift and the slightly different apparent widths of the upright,
 * foot, and cleat. */
export function aboutBootBoxHorizontalBounds(
  centerX: number,
  width: number,
  centerZ: number,
  depth: number,
  cameraZ = CAMERA.z,
): AboutBootHorizontalBounds {
  const projected = [-width / 2, width / 2].flatMap((dx) =>
    [-depth / 2, depth / 2].map((dz) => {
      const z = centerZ + dz;
      return (centerX + dx) * (cameraZ / (cameraZ - z));
    }),
  );
  const x = Math.min(...projected);
  return { x, width: Math.max(...projected) - x };
}

export function aboutBootShelfSupportProjection(side: -1 | 1) {
  const support = SHELF_GEOMETRY.support;
  const centerX =
    side * (SHELF_GEOMETRY.width / 2 - SHELF_GEOMETRY.strapInsetX);
  return {
    upright: aboutBootBoxHorizontalBounds(
      centerX,
      support.width,
      SHELF_GEOMETRY.strapZ,
      support.width,
    ),
    foot: aboutBootBoxHorizontalBounds(
      centerX,
      support.footWidth,
      SHELF_GEOMETRY.strapZ,
      support.footDepth,
    ),
    cleat: aboutBootBoxHorizontalBounds(
      centerX,
      support.cleatWidth,
      SHELF_GEOMETRY.strapZ,
      support.cleatDepth,
    ),
  } as const;
}
