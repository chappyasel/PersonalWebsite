import { deskLampHeadQuaternionForTarget } from "../deskLampHead";
import { SHELF_SURFACE } from "../shelfGeometry";

import { REVIEWED_SHELF_LAYOUT } from "./unitShelfLayout";

export const PROJECTS_LAMP_ROOT_YAW = 0.72;
export const PROJECTS_LAMP_ROOT_SCALE = 1.48;
export const PROJECTS_LAMP_ROOT_POSITION = [
  REVIEWED_SHELF_LAYOUT.projects.topLampX,
  SHELF_SURFACE.top,
  -0.08,
] as const;

export const PROJECTS_ICON_MIDPOINT_X =
  (REVIEWED_SHELF_LAYOUT.projects.topWeightliftingIconX +
    REVIEWED_SHELF_LAYOUT.projects.topHomeworkIconX) /
  2;

/** Carrier-local point between the two icon faces, slightly below center so
 * the cone also catches the dice without sending the shade toward the sky. */
export const PROJECTS_LAMP_HEAD_TARGET = [
  PROJECTS_ICON_MIDPOINT_X - REVIEWED_SHELF_LAYOUT.projects.topLampX,
  0.14,
  0.02 - PROJECTS_LAMP_ROOT_POSITION[2],
] as const;

export const PROJECTS_LAMP_HEAD_QUATERNION = deskLampHeadQuaternionForTarget({
  target: PROJECTS_LAMP_HEAD_TARGET,
  rootYaw: PROJECTS_LAMP_ROOT_YAW,
  rootScale: PROJECTS_LAMP_ROOT_SCALE,
});
