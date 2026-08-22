import {
  ABOUT_AIC_ORB_SIZE_INCREASE,
  ABOUT_AWARD_SIZE_INCREASE,
  ABOUT_BOOT_LANDMARKS,
  type AboutLandmarkId,
} from "./aboutBootComposition";
import {
  type QuaternionTuple,
  articulatedDeskLampDirection,
  articulatedDeskLampPoint,
  deskLampHeadQuaternionForTarget,
} from "./deskLampHead";
import { SHELF_GEOMETRY, SHELF_SURFACE } from "./shelfGeometry";
import { TJ_MEDALLION_POSE } from "./tjMedallionGeometry";

export const ABOUT_LAMP_ROOT_YAW = 0.78;
export const ABOUT_LOWER_AWARD_SCALE = 1.32 * ABOUT_AWARD_SIZE_INCREASE;
export const ABOUT_AIC_SCALE =
  ABOUT_LOWER_AWARD_SCALE * ABOUT_AIC_ORB_SIZE_INCREASE;
export const ABOUT_COORDINATION_GLOBE_SCALE =
  ABOUT_LOWER_AWARD_SCALE * 1.05 * ABOUT_AIC_ORB_SIZE_INCREASE;
/** Modest face yaws toward the practical at the left. Apple sits farther from
 * the source, so it takes the slightly stronger turn.
 *
 * The medallion's yaw comes from its geometry specification rather than a
 * literal here: the boot silhouette is traced at that yaw, so a second copy of
 * it could be turned without the outline noticing. */
export const ABOUT_TJ_LIGHT_YAW = TJ_MEDALLION_POSE.yaw;
export const ABOUT_APPLE_LIGHT_YAW = -0.34;
export const ABOUT_LAMP_ROOT_SCALE =
  ABOUT_BOOT_LANDMARKS["desk-lamp"].sceneScale;
export const ABOUT_LAMP_ROOT_POSITION = [
  ABOUT_BOOT_LANDMARKS["desk-lamp"].x,
  SHELF_SURFACE.lower,
  -0.06,
] as const;

export const ABOUT_COORDINATION_TARGET_X =
  (ABOUT_BOOT_LANDMARKS["ai-collective"].x +
    ABOUT_BOOT_LANDMARKS["coordination-globe"].x) /
  2;

/** Pull the task target just toward the camera so the shade mouth presents a
 * narrow glowing ellipse instead of disappearing edge-on. The world target
 * remains well inside the lower plank's front edge. */
export const ABOUT_LAMP_CAMERA_REVEAL = 0.176;

/** Carrier-local target across the visual center between the two marks. */
export const ABOUT_LAMP_HEAD_TARGET = [
  ABOUT_COORDINATION_TARGET_X - ABOUT_BOOT_LANDMARKS["desk-lamp"].x,
  0.125,
  SHELF_GEOMETRY.lower.centerZ - -0.06 + ABOUT_LAMP_CAMERA_REVEAL,
] as const;

export const ABOUT_LAMP_HEAD_QUATERNION: QuaternionTuple =
  deskLampHeadQuaternionForTarget({
    target: ABOUT_LAMP_HEAD_TARGET,
    rootYaw: ABOUT_LAMP_ROOT_YAW,
    rootScale: ABOUT_LAMP_ROOT_SCALE,
  });

/** The head-on social card needs less camera reveal than the moving scene.
 * Aim lower and nearly parallel to the shelf so the shade clearly points at
 * the two coordination marks instead of reading as camera-facing. */
export const ABOUT_OG_LAMP_CAMERA_REVEAL = 0.08;
export const ABOUT_OG_LAMP_HEAD_TARGET = [
  ABOUT_COORDINATION_TARGET_X - ABOUT_BOOT_LANDMARKS["desk-lamp"].x,
  0.09,
  SHELF_GEOMETRY.lower.centerZ - -0.06 + ABOUT_OG_LAMP_CAMERA_REVEAL,
] as const;
export const ABOUT_OG_LAMP_HEAD_QUATERNION: QuaternionTuple =
  deskLampHeadQuaternionForTarget({
    target: ABOUT_OG_LAMP_HEAD_TARGET,
    rootYaw: ABOUT_LAMP_ROOT_YAW,
    rootScale: ABOUT_LAMP_ROOT_SCALE,
  });

export function aboutLampHeadQuaternion(headOnCapture: boolean) {
  return headOnCapture
    ? ABOUT_OG_LAMP_HEAD_QUATERNION
    : ABOUT_LAMP_HEAD_QUATERNION;
}

const ABOUT_LAMP_PERCH_LOCAL = [-0.0065, 0.4155, 0.0399] as const;
const ABOUT_LAMP_PERCH_NORMAL_LOCAL = [0, 0.9166, -0.3998] as const;
const ABOUT_LAMP_PERCH_TANGENT_LOCAL = [1, 0, 0] as const;

/** The lamp Perch follows the recovered shade instead of retaining the old
 * unarticulated coordinates after the visible head moves. */
export const ABOUT_LAMP_SHADE_PERCH = {
  position: articulatedDeskLampPoint({
    point: ABOUT_LAMP_PERCH_LOCAL,
    headQuaternion: ABOUT_LAMP_HEAD_QUATERNION,
    rootPosition: ABOUT_LAMP_ROOT_POSITION,
    rootYaw: ABOUT_LAMP_ROOT_YAW,
    rootScale: ABOUT_LAMP_ROOT_SCALE,
  }),
  normal: articulatedDeskLampDirection({
    direction: ABOUT_LAMP_PERCH_NORMAL_LOCAL,
    headQuaternion: ABOUT_LAMP_HEAD_QUATERNION,
    rootYaw: ABOUT_LAMP_ROOT_YAW,
  }),
  tangent: articulatedDeskLampDirection({
    direction: ABOUT_LAMP_PERCH_TANGENT_LOCAL,
    headQuaternion: ABOUT_LAMP_HEAD_QUATERNION,
    rootYaw: ABOUT_LAMP_ROOT_YAW,
  }),
} as const;

export type AboutShelfInterval = Readonly<{
  id: AboutLandmarkId;
  left: number;
  right: number;
}>;

export function aboutShelfIntervals(
  shelf: "top" | "lower",
): AboutShelfInterval[] {
  return Object.values(ABOUT_BOOT_LANDMARKS)
    .filter((landmark) => landmark.shelf === shelf)
    .map((landmark) => ({
      id: landmark.id,
      left: landmark.x - landmark.profile.width / 2,
      right: landmark.x + landmark.profile.width / 2,
    }))
    .sort((left, right) => left.left - right.left);
}
