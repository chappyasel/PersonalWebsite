import {
  ABOUT_BOOT_LANDMARKS,
  type AboutLandmarkId,
} from "./aboutBootComposition";
import {
  ABOUT_LAMP_HEAD_QUATERNION,
  ABOUT_LAMP_ROOT_POSITION,
  ABOUT_LAMP_ROOT_SCALE,
  ABOUT_LAMP_ROOT_YAW,
} from "./aboutLampPose";
import {
  articulatedDeskLampDirection,
  articulatedDeskLampPoint,
} from "./deskLampHead";

export {
  ABOUT_AIC_SCALE,
  ABOUT_APPLE_LIGHT_YAW,
  ABOUT_COORDINATION_GLOBE_SCALE,
  ABOUT_COORDINATION_TARGET_X,
  ABOUT_LAMP_CAMERA_REVEAL,
  ABOUT_LAMP_HEAD_QUATERNION,
  ABOUT_LAMP_HEAD_TARGET,
  ABOUT_LAMP_ROOT_POSITION,
  ABOUT_LAMP_ROOT_SCALE,
  ABOUT_LAMP_ROOT_YAW,
  ABOUT_LOWER_AWARD_SCALE,
  ABOUT_OG_LAMP_CAMERA_REVEAL,
  ABOUT_OG_LAMP_HEAD_QUATERNION,
  ABOUT_OG_LAMP_HEAD_TARGET,
  ABOUT_TJ_LIGHT_YAW,
  aboutLampHeadQuaternion,
} from "./aboutLampPose";

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
