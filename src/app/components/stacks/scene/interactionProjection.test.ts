import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from "three";
import { afterEach, describe, expect, it } from "vitest";

import { registerSceneInteraction } from "./interactionRegistry";
import {
  doorAtPointer,
  setInteractionProjectionContext,
} from "./interactionProjection";

const rect = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 100,
  bottom: 100,
  width: 100,
  height: 100,
  toJSON: () => ({}),
} as DOMRect;

function target(z: number) {
  const root = new Group();
  root.position.z = z;
  root.add(new Mesh(new BoxGeometry(1, 1, 0.2), new MeshBasicMaterial()));
  root.updateMatrixWorld(true);
  return root;
}

describe("scene interaction projection", () => {
  afterEach(() => setInteractionProjectionContext(null, null));

  it("lets the nearest registered non-Door occlude a Door on touch", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => rect,
    } as HTMLElement);

    const releaseDoor = registerSceneInteraction({
      id: "test:back-door",
      root: target(0),
      activeUnits: [0],
      activation: {
        kind: "door",
        label: "Open test",
        external: false,
      },
    });
    const releaseOccluder = registerSceneInteraction({
      id: "test:front-prop",
      root: target(1),
      activeUnits: [0],
      movable: { massKg: 1, massClass: "light" },
    });

    expect(doorAtPointer(50, 50, 0)).toBeNull();
    releaseOccluder();
    expect(doorAtPointer(50, 50, 0)).toBe("test:back-door");
    releaseDoor();
  });
});
