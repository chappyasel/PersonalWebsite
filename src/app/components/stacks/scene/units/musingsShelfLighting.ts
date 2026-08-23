import { PALETTES } from "../../theme";
import {
  type QuaternionTuple,
  articulatedDeskLampDirection,
  articulatedDeskLampPoint,
  deskLampHeadQuaternionForTarget,
} from "../deskLampHead";
import { bookRowXBounds, packRow } from "../primitives";
import { SHELF_GEOMETRY, SHELF_SURFACE } from "../shelfGeometry";

/** The top shelf is packed from right to left using occupied model bounds.
 * These measurements are regression-checked against the built GLBs below;
 * keeping them here makes every authored center a consequence of the same
 * 4 cm gutter instead of an independent visual tweak. */
const MUSINGS_TOP_GAP = 0.04;
const MUSINGS_OPEN_BOOK_TO_ROW_GAP = 0.025;
const MUSINGS_BOOK_ROW_RIGHT_INSET = 0.06;
const MUSINGS_OPEN_BOOK_X = {
  min: -0.36013794730450976,
  max: 0.3557649882492727,
} as const;
const MUSINGS_CUP_WIDTH = 0.2700300067976506;
const MUSINGS_KETTLE_SOURCE_X = {
  min: -0.4063093103468418,
  max: 0.4063093103468418,
} as const;
const MUSINGS_KETTLE_TO_CUP_WIDTH = 1.55;

export const MUSINGS_BOOK_ROW_WIDTH = 0.96;
export const MUSINGS_BOOK_ROW_SALT = 75;
const MUSINGS_BOOK_ROW_ITEMS = packRow(
  MUSINGS_BOOK_ROW_WIDTH,
  [],
  PALETTES.light,
  MUSINGS_BOOK_ROW_SALT,
);
const MUSINGS_BOOK_ROW_BOUNDS = bookRowXBounds(MUSINGS_BOOK_ROW_ITEMS);
const MUSINGS_BOOK_ROW_X =
  SHELF_GEOMETRY.width / 2 -
  MUSINGS_BOOK_ROW_RIGHT_INSET -
  MUSINGS_BOOK_ROW_BOUNDS.max;
const MUSINGS_BOOK_ROW_LEFT = MUSINGS_BOOK_ROW_X + MUSINGS_BOOK_ROW_BOUNDS.min;
const MUSINGS_OPEN_BOOK_RIGHT =
  MUSINGS_BOOK_ROW_LEFT - MUSINGS_OPEN_BOOK_TO_ROW_GAP;
const MUSINGS_OPEN_BOOK_X_BASE =
  MUSINGS_OPEN_BOOK_RIGHT - MUSINGS_OPEN_BOOK_X.max;
const MUSINGS_OPEN_BOOK_LEFT =
  MUSINGS_OPEN_BOOK_X_BASE + MUSINGS_OPEN_BOOK_X.min;
const MUSINGS_KETTLE_SCALE =
  (MUSINGS_CUP_WIDTH * MUSINGS_KETTLE_TO_CUP_WIDTH) /
  (MUSINGS_KETTLE_SOURCE_X.max - MUSINGS_KETTLE_SOURCE_X.min);
const MUSINGS_KETTLE_RIGHT = MUSINGS_OPEN_BOOK_LEFT - MUSINGS_TOP_GAP;
const MUSINGS_KETTLE_X =
  MUSINGS_KETTLE_RIGHT - MUSINGS_KETTLE_SCALE * MUSINGS_KETTLE_SOURCE_X.max;
const MUSINGS_TEA_X = MUSINGS_KETTLE_X + 0.105;
const MUSINGS_HEADPHONE_STACK = MUSINGS_BOOK_ROW_ITEMS.find(
  (item) => item.kind === "flat" && item.n === 2,
);
if (MUSINGS_HEADPHONE_STACK?.kind !== "flat")
  throw new Error("Musings book row must include its two-book headphone stand");
const MUSINGS_HEADPHONE_STACK_HEIGHT =
  MUSINGS_HEADPHONE_STACK.n * (MUSINGS_HEADPHONE_STACK.height ?? 0.052);
const MUSINGS_HEADPHONE_STACK_X =
  MUSINGS_BOOK_ROW_X +
  MUSINGS_HEADPHONE_STACK.x +
  (MUSINGS_HEADPHONE_STACK.n - 1) * (MUSINGS_HEADPHONE_STACK.staggerX ?? 0.012);

export const MUSINGS_TEA_POSE = {
  base: [MUSINGS_TEA_X, 0, 0.27],
  rotation: [0, 0.6, 0],
  scale: 2.4,
} as const;

/** Kept behind the cup so the pair reads as tea without adding a tiny label
 * that disappears at the room camera's normal distance. */
export const MUSINGS_KETTLE_POSE = {
  base: [MUSINGS_KETTLE_X, 0, -0.04],
  rotation: [0, 0, 0],
  scale: MUSINGS_KETTLE_SCALE,
} as const;

export const MUSINGS_OPEN_BOOK_POSE = {
  base: [MUSINGS_OPEN_BOOK_X_BASE, 0, -0.1],
  rotation: [0, -0.25, 0],
  scale: 0.7,
} as const;

export const MUSINGS_LAMP_ROOT_BASE = [-1.12, 0, -0.07] as const;
export const MUSINGS_HEADPHONES_BASE = [
  MUSINGS_HEADPHONE_STACK_X,
  MUSINGS_HEADPHONE_STACK_HEIGHT,
  0.02,
] as const;
export const MUSINGS_BOOK_ROW_BASE = [MUSINGS_BOOK_ROW_X, 0, 0.02] as const;

/** Measured crown of the handle, outside the bowl. The old anchor sat at the
 * cup's center and made a resting butterfly look submerged in the tea. */
const MUSINGS_TEA_HANDLE_LOCAL = [0.044, 0.0503, 0.0005] as const;
export const MUSINGS_TEA_HANDLE_POSITION = [
  MUSINGS_TEA_POSE.base[0] +
    MUSINGS_TEA_POSE.scale *
      (MUSINGS_TEA_HANDLE_LOCAL[0] * Math.cos(MUSINGS_TEA_POSE.rotation[1]) +
        MUSINGS_TEA_HANDLE_LOCAL[2] * Math.sin(MUSINGS_TEA_POSE.rotation[1])),
  SHELF_SURFACE.top + MUSINGS_TEA_POSE.scale * MUSINGS_TEA_HANDLE_LOCAL[1],
  MUSINGS_TEA_POSE.base[2] +
    MUSINGS_TEA_POSE.scale *
      (-MUSINGS_TEA_HANDLE_LOCAL[0] * Math.sin(MUSINGS_TEA_POSE.rotation[1]) +
        MUSINGS_TEA_HANDLE_LOCAL[2] * Math.cos(MUSINGS_TEA_POSE.rotation[1])),
] as const;
export const MUSINGS_OPEN_BOOK_PERCH_POSITION = [
  MUSINGS_OPEN_BOOK_POSE.base[0] - 0.1778,
  0.1205,
  MUSINGS_OPEN_BOOK_POSE.base[2] + 0.0368,
] as const;
export const MUSINGS_HEADPHONE_PERCH_POSITION = [
  MUSINGS_HEADPHONES_BASE[0],
  MUSINGS_HEADPHONES_BASE[1] + 0.387,
  MUSINGS_HEADPHONES_BASE[2],
] as const;

/** Turn the whole angle-poise body toward the book-and-cup composition. The
 * remaining head quaternion is consequently a near-pure downward pitch. */
export const MUSINGS_LAMP_ROOT_SCALE = 1.74;
export const MUSINGS_LAMP_ROOT_POSITION = [
  MUSINGS_LAMP_ROOT_BASE[0],
  SHELF_SURFACE.top,
  MUSINGS_LAMP_ROOT_BASE[2],
] as const;

/** The midpoint between the open paper and the cup, expressed from the lamp
 * carrier. It follows the packed composition instead of preserving a stale
 * aiming coordinate when the props move. */
export const MUSINGS_LAMP_HEAD_TARGET = [
  (MUSINGS_OPEN_BOOK_POSE.base[0] + MUSINGS_TEA_POSE.base[0]) / 2 -
    MUSINGS_LAMP_ROOT_BASE[0],
  0.06,
  (MUSINGS_OPEN_BOOK_POSE.base[2] + MUSINGS_TEA_POSE.base[2]) / 2 -
    MUSINGS_LAMP_ROOT_BASE[2],
] as const;
export const MUSINGS_LAMP_ROOT_YAW = Math.atan2(
  MUSINGS_LAMP_HEAD_TARGET[0],
  MUSINGS_LAMP_HEAD_TARGET[2],
);

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
