import {
  ABOUT_AIC_ORB_SIZE_INCREASE,
  ABOUT_APPLE_ROOT_YAW,
  ABOUT_AWARD_SIZE_INCREASE,
  ABOUT_LANDMARK_X,
  ABOUT_MODEL_POSES,
} from "./aboutScenePose";
import {
  type QuaternionTuple,
  deskLampHeadQuaternionForTarget,
} from "./deskLampHead";
import { SHELF_GEOMETRY, SHELF_SURFACE } from "./shelfGeometry";
import { TJ_MEDALLION_POSE } from "./tjMedallionGeometry";

export const ABOUT_LAMP_ROOT_YAW = ABOUT_MODEL_POSES["desk-lamp"].rotation[1];
export const ABOUT_LOWER_AWARD_SCALE = 1.32 * ABOUT_AWARD_SIZE_INCREASE;
export const ABOUT_AIC_SCALE =
  ABOUT_LOWER_AWARD_SCALE * ABOUT_AIC_ORB_SIZE_INCREASE;
export const ABOUT_COORDINATION_GLOBE_SCALE =
  ABOUT_LOWER_AWARD_SCALE * 1.05 * ABOUT_AIC_ORB_SIZE_INCREASE;
export const ABOUT_TJ_LIGHT_YAW = TJ_MEDALLION_POSE.yaw;
export const ABOUT_APPLE_LIGHT_YAW = ABOUT_APPLE_ROOT_YAW;
export const ABOUT_LAMP_ROOT_SCALE = ABOUT_MODEL_POSES["desk-lamp"].scale;
export const ABOUT_LAMP_ROOT_POSITION = [
  ABOUT_LANDMARK_X["desk-lamp"],
  SHELF_SURFACE.lower,
  -0.06,
] as const;

export const ABOUT_COORDINATION_TARGET_X =
  (ABOUT_LANDMARK_X["ai-collective"] + ABOUT_LANDMARK_X["coordination-globe"]) /
  2;

export const ABOUT_LAMP_CAMERA_REVEAL = 0.145;
export const ABOUT_LAMP_HEAD_TARGET = [
  ABOUT_COORDINATION_TARGET_X - ABOUT_LANDMARK_X["desk-lamp"],
  0.125,
  SHELF_GEOMETRY.lower.centerZ - -0.06 + ABOUT_LAMP_CAMERA_REVEAL,
] as const;

export const ABOUT_LAMP_HEAD_QUATERNION: QuaternionTuple =
  deskLampHeadQuaternionForTarget({
    target: ABOUT_LAMP_HEAD_TARGET,
    rootYaw: ABOUT_LAMP_ROOT_YAW,
    rootScale: ABOUT_LAMP_ROOT_SCALE,
  });

export const ABOUT_OG_LAMP_CAMERA_REVEAL = 0.056;
export const ABOUT_OG_LAMP_HEAD_TARGET = [
  ABOUT_COORDINATION_TARGET_X - ABOUT_LANDMARK_X["desk-lamp"],
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
