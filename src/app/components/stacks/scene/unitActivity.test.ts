import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  GOLF_CLUB_GRIP_HEIGHT,
  GOLF_CLUB_PROJECTED_LOCAL_BOUNDS,
  GOLF_CLUB_REST_BASE,
} from "./golf/golfLayout";
import {
  directionalUnitLookahead,
  projectUnitActivityEnvelope,
  projectedUnitIntersects,
  resolveUnitActivityState,
} from "./unitActivity";
import {
  CAMERA,
  CAMERA_LOOK_Y,
  CAMERA_LOOK_Z_OFFSET,
  unitPose,
} from "./worldLayout";

describe("resident unit activity", () => {
  it("treats a unit spanning the viewport as visible even when both edges are outside", () => {
    expect(
      projectedUnitIntersects({ inDepth: true, minX: -1.4, maxX: 1.4 }, 1.05),
    ).toBe(true);
  });

  it("rejects units outside the horizontal envelope or camera depth", () => {
    expect(
      projectedUnitIntersects({ inDepth: true, minX: 1.21, maxX: 1.8 }, 1.2),
    ).toBe(false);
    expect(
      projectedUnitIntersects({ inDepth: false, minX: -0.2, maxX: 0.2 }, 1.05),
    ).toBe(false);
  });

  it("uses hysteresis and a 250ms cold delay without unmounting state", () => {
    const projected = { inDepth: true, minX: 1.1, maxX: 1.8 };
    expect(
      resolveUnitActivityState({
        projected,
        previous: "hot",
        active: false,
        lookahead: false,
        pinned: false,
        enabled: true,
        outsideSince: -1,
        now: 100,
      }).state,
    ).toBe("hot");
    const leaving = resolveUnitActivityState({
      projected: { inDepth: true, minX: 1.7, maxX: 2.1 },
      previous: "warm",
      active: false,
      lookahead: false,
      pinned: false,
      enabled: true,
      outsideSince: -1,
      now: 100,
    });
    expect(leaving).toEqual({ state: "warm", outsideSince: 100 });
    expect(
      resolveUnitActivityState({
        projected: { inDepth: true, minX: 1.7, maxX: 2.1 },
        previous: "warm",
        active: false,
        lookahead: false,
        pinned: false,
        enabled: true,
        outsideSince: leaving.outsideSince,
        now: 351,
      }).state,
    ).toBe("cold");
  });

  it("keeps active, lookahead, and pinned units prepared", () => {
    const offscreen = { inDepth: true, minX: 2, maxX: 3 };
    const base = {
      projected: offscreen,
      previous: "cold" as const,
      active: false,
      lookahead: false,
      pinned: false,
      enabled: true,
      outsideSince: 0,
      now: 1_000,
    };
    expect(resolveUnitActivityState({ ...base, active: true }).state).toBe(
      "warm",
    );
    expect(resolveUnitActivityState({ ...base, lookahead: true }).state).toBe(
      "warm",
    );
    expect(resolveUnitActivityState({ ...base, pinned: true }).state).toBe(
      "hot",
    );
    expect(directionalUnitLookahead(2.4, 1, 7)).toBe(3);
    expect(directionalUnitLookahead(2.4, -1, 7)).toBe(1);
    expect(directionalUnitLookahead(6, 1, 7)).toBe(6);
  });

  it("does not hide Training while the edge of its golf club remains visible", () => {
    const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 100);
    camera.position.set(4.07, CAMERA.y, CAMERA.z);
    camera.lookAt(4.07, CAMERA_LOOK_Y, CAMERA_LOOK_Z_OFFSET);
    camera.updateMatrixWorld();

    const projected = { inDepth: false, minX: Infinity, maxX: -Infinity };
    projectUnitActivityEnvelope(2, camera, projected, [
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);

    const pose = unitPose(2);
    const unit = new THREE.Group();
    unit.position.fromArray(pose.position);
    unit.rotation.set(...pose.rotation);
    const club = new THREE.Group();
    club.position.set(
      GOLF_CLUB_REST_BASE.x,
      GOLF_CLUB_REST_BASE.y + GOLF_CLUB_GRIP_HEIGHT,
      GOLF_CLUB_REST_BASE.z,
    );
    club.rotation.set(-0.08, 0.04, 0, "YXZ");
    unit.add(club);
    unit.updateWorldMatrix(true, true);

    const projectedClubX: number[] = [];
    const { min, max } = GOLF_CLUB_PROJECTED_LOCAL_BOUNDS;
    for (const x of [min[0], max[0]])
      for (const y of [min[1], max[1]])
        for (const z of [min[2], max[2]])
          projectedClubX.push(
            new THREE.Vector3(x, y, z)
              .applyMatrix4(club.matrixWorld)
              .project(camera).x,
          );

    expect(Math.min(...projectedClubX)).toBeLessThan(1);
    expect(projectedUnitIntersects(projected, 1.6)).toBe(true);
    expect(
      resolveUnitActivityState({
        projected,
        previous: "warm",
        active: false,
        lookahead: false,
        pinned: false,
        enabled: true,
        outsideSince: 0,
        now: 251,
      }).state,
    ).not.toBe("cold");
  });

  it("still releases Training after its complete activity envelope leaves view", () => {
    const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 100);
    camera.position.set(-4, CAMERA.y, CAMERA.z);
    camera.lookAt(-4, CAMERA_LOOK_Y, CAMERA_LOOK_Z_OFFSET);
    camera.updateMatrixWorld();

    const projected = { inDepth: false, minX: Infinity, maxX: -Infinity };
    projectUnitActivityEnvelope(2, camera, projected, [
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);

    expect(projectedUnitIntersects(projected, 1.6)).toBe(false);
    expect(
      resolveUnitActivityState({
        projected,
        previous: "warm",
        active: false,
        lookahead: false,
        pinned: false,
        enabled: true,
        outsideSince: 0,
        now: 251,
      }).state,
    ).toBe("cold");
  });
});

describe("screenshot solo unit", () => {
  it("hides every other unit's root regardless of the camera, and hands them back when lifted", async () => {
    const { sceneUnitActivityController } = await import("./unitActivity");
    // A 4:1 banner window at the About stop: Books' envelope is well inside
    // the frame, so without the solo it would be hot.
    const camera = new THREE.PerspectiveCamera(CAMERA.fov, 4, 0.1, 100);
    camera.position.set(0, CAMERA.y, CAMERA.z);
    camera.lookAt(0, CAMERA_LOOK_Y, CAMERA_LOOK_Z_OFFSET);
    camera.updateMatrixWorld();
    const about = new THREE.Group();
    const books = new THREE.Group();
    const releaseAbout = sceneUnitActivityController.registerRoot(0, about);
    const releaseBooks = sceneUnitActivityController.registerRoot(1, books);
    try {
      sceneUnitActivityController.update(camera, 0.016, 1_000);
      expect(books.visible).toBe(true);

      sceneUnitActivityController.setSoloUnit(0);
      sceneUnitActivityController.update(camera, 0.016, 1_016);
      expect(about.visible).toBe(true);
      expect(books.visible).toBe(false);
      expect(sceneUnitActivityController.stateFor(1)).toBe("cold");
      expect(sceneUnitActivityController.allows(1, "ambient")).toBe(false);

      sceneUnitActivityController.setSoloUnit(null);
      sceneUnitActivityController.update(camera, 0.016, 1_032);
      expect(books.visible).toBe(true);
    } finally {
      sceneUnitActivityController.setSoloUnit(null);
      releaseAbout();
      releaseBooks();
    }
  });
});
