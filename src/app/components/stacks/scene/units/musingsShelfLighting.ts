import {
  type QuaternionTuple,
  articulatedDeskLampDirection,
  articulatedDeskLampPoint,
  deskLampHeadQuaternionForTarget,
} from "../deskLampHead";
import { SHELF_SURFACE } from "../shelfGeometry";

export const MUSINGS_TEA_POSE = {
  base: [-0.56, 0, 0.31],
  rotation: [0, 0.6, 0],
  scale: 2.4,
} as const;

export const MUSINGS_OPEN_BOOK_POSE = {
  base: [-0.46, 0, -0.16],
  rotation: [0, -0.25, 0],
  scale: 0.7,
} as const;

/** Existing measured contacts translated with their unchanged model poses. */
export const MUSINGS_TEA_RIM_POSITION = [
  MUSINGS_TEA_POSE.base[0],
  0.1526,
  MUSINGS_TEA_POSE.base[2],
] as const;
export const MUSINGS_OPEN_BOOK_PERCH_POSITION = [
  MUSINGS_OPEN_BOOK_POSE.base[0] - 0.1778,
  0.1205,
  MUSINGS_OPEN_BOOK_POSE.base[2] + 0.0368,
] as const;

/** Turn the whole angle-poise body toward the book-and-cup composition. The
 * remaining head quaternion is consequently a near-pure downward pitch. */
export const MUSINGS_LAMP_ROOT_YAW = Math.atan2(0.56, 0.17);
export const MUSINGS_LAMP_ROOT_SCALE = 1.74;
export const MUSINGS_LAMP_ROOT_POSITION = [
  -1.06,
  SHELF_SURFACE.top,
  -0.07,
] as const;

/** The midpoint between the open paper and the cup in their new left-hand
 * composition, expressed from the lamp carrier. */
export const MUSINGS_LAMP_HEAD_TARGET = [0.56, 0.06, 0.17] as const;

export const MUSINGS_LAMP_HEAD_QUATERNION: QuaternionTuple =
  deskLampHeadQuaternionForTarget({
    target: MUSINGS_LAMP_HEAD_TARGET,
    rootYaw: MUSINGS_LAMP_ROOT_YAW,
    rootScale: MUSINGS_LAMP_ROOT_SCALE,
  });

// The existing measured triangle contact, recovered into the GLB's local
// frame before the shade was articulated. Keeping the source measurement here
// lets the insect Perch follow the same hinge as the visible shade.
const MUSINGS_LAMP_PERCH_LOCAL = [
  0.0535912988891899, 0.3059770114942528, 0.04809987797682139,
] as const;
const MUSINGS_LAMP_PERCH_NORMAL_LOCAL = [
  0.9864008550429395, 0.15649779496160335, 0.050217460536290656,
] as const;

export const MUSINGS_LAMP_SHADE_PERCH = {
  position: articulatedDeskLampPoint({
    point: MUSINGS_LAMP_PERCH_LOCAL,
    headQuaternion: MUSINGS_LAMP_HEAD_QUATERNION,
    rootPosition: MUSINGS_LAMP_ROOT_POSITION,
    rootYaw: MUSINGS_LAMP_ROOT_YAW,
    rootScale: MUSINGS_LAMP_ROOT_SCALE,
  }),
  normal: articulatedDeskLampDirection({
    direction: MUSINGS_LAMP_PERCH_NORMAL_LOCAL,
    headQuaternion: MUSINGS_LAMP_HEAD_QUATERNION,
    rootYaw: MUSINGS_LAMP_ROOT_YAW,
  }),
} as const;
