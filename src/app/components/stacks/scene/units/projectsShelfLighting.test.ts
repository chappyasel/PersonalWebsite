import {
  DESK_LAMP_HEAD_AXIS,
  DESK_LAMP_MOUTH,
  articulatedDeskLampDirection,
  articulatedDeskLampPoint,
} from "../deskLampHead";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  PROJECTS_ICON_MIDPOINT_X,
  PROJECTS_LAMP_HEAD_QUATERNION,
  PROJECTS_LAMP_HEAD_TARGET,
  PROJECTS_LAMP_ROOT_POSITION,
  PROJECTS_LAMP_ROOT_SCALE,
  PROJECTS_LAMP_ROOT_YAW,
} from "./projectsShelfLighting";
import { REVIEWED_SHELF_LAYOUT } from "./unitShelfLayout";

describe("Projects shelf lighting", () => {
  it("articulates the visible shade toward the midpoint of both icons", () => {
    expect(PROJECTS_ICON_MIDPOINT_X).toBeCloseTo(
      (REVIEWED_SHELF_LAYOUT.projects.topWeightliftingIconX +
        REVIEWED_SHELF_LAYOUT.projects.topHomeworkIconX) /
        2,
      10,
    );
    const mouth = new THREE.Vector3(
      ...articulatedDeskLampPoint({
        point: DESK_LAMP_MOUTH,
        headQuaternion: PROJECTS_LAMP_HEAD_QUATERNION,
        rootPosition: PROJECTS_LAMP_ROOT_POSITION,
        rootYaw: PROJECTS_LAMP_ROOT_YAW,
        rootScale: PROJECTS_LAMP_ROOT_SCALE,
      }),
    );
    const target = new THREE.Vector3(
      PROJECTS_LAMP_ROOT_POSITION[0] + PROJECTS_LAMP_HEAD_TARGET[0],
      PROJECTS_LAMP_ROOT_POSITION[1] + PROJECTS_LAMP_HEAD_TARGET[1],
      PROJECTS_LAMP_ROOT_POSITION[2] + PROJECTS_LAMP_HEAD_TARGET[2],
    );
    const expected = target.sub(mouth).normalize();
    const actual = new THREE.Vector3(
      ...articulatedDeskLampDirection({
        direction: DESK_LAMP_HEAD_AXIS,
        headQuaternion: PROJECTS_LAMP_HEAD_QUATERNION,
        rootYaw: PROJECTS_LAMP_ROOT_YAW,
      }),
    );

    expect(actual.dot(expected)).toBeCloseTo(1, 10);
    expect(PROJECTS_LAMP_HEAD_QUATERNION).not.toEqual([0, 0, 0, 1]);
  });
});
