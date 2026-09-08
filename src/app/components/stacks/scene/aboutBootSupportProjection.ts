import {
  ABOUT_BOOT_CAMERA,
  type AboutBootBoxBounds,
  type AboutBootCamera,
  aboutBootBoxBounds,
} from "./aboutBootPerspective";
import { SHELF_GEOMETRY } from "./shelfGeometry";
import { CAMERA } from "./worldLayout";

export type AboutBootHorizontalBounds = Readonly<{
  x: number;
  width: number;
}>;

/** The supports' original projection: a head-on box scaled by camera
 * distance about the unit's origin, as if the eye stood at x = 0 looking
 * level. Kept as the reference the projector's test reduces to; the boot
 * itself now draws the supports through `aboutBootShelfSupportProjection`. */
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

export type AboutBootShelfSupportProjection = Readonly<{
  upright: AboutBootBoxBounds;
  foot: AboutBootBoxBounds;
  cleat: AboutBootBoxBounds;
}>;

/** One side's upright, foot and cleat as the About rest camera sees them:
 * every corner of each box projected (aboutBootPerspective.ts), then the
 * plane-space extremes. The upright runs from the top plank's underside to
 * the ground; the foot and cleat sit on the ground. */
export function aboutBootShelfSupportProjection(
  side: -1 | 1,
  camera: AboutBootCamera = ABOUT_BOOT_CAMERA,
): AboutBootShelfSupportProjection {
  const support = SHELF_GEOMETRY.support;
  const centerX =
    side * (SHELF_GEOMETRY.width / 2 - SHELF_GEOMETRY.strapInsetX);
  const ground = SHELF_GEOMETRY.groundY;
  const plankUnderside =
    SHELF_GEOMETRY.top.centerY - SHELF_GEOMETRY.top.thickness / 2;
  return {
    upright: aboutBootBoxBounds(
      {
        centerX,
        width: support.width,
        centerZ: SHELF_GEOMETRY.strapZ,
        depth: support.width,
        top: plankUnderside,
        bottom: ground,
      },
      camera,
    ),
    foot: aboutBootBoxBounds(
      {
        centerX,
        width: support.footWidth,
        centerZ: SHELF_GEOMETRY.strapZ,
        depth: support.footDepth,
        top: ground + support.footHeight,
        bottom: ground,
      },
      camera,
    ),
    cleat: aboutBootBoxBounds(
      {
        centerX,
        width: support.cleatWidth,
        centerZ: SHELF_GEOMETRY.strapZ,
        depth: support.cleatDepth,
        top: ground + support.cleatHeight,
        bottom: ground,
      },
      camera,
    ),
  };
}
