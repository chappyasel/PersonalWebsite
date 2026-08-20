import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
} from "three";
import { afterEach, describe, expect, it } from "vitest";

import {
  activationAtPointer,
  doorAtPointer,
  projectedInteractionBounds,
  setInteractionProjectionContext,
} from "./interactionProjection";
import { projectDoor, registerSceneInteraction } from "./interactionRegistry";

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

  it("anchors an empty linked carrier to its own world origin", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => rect,
    } as HTMLElement);

    const root = new Group();
    root.position.set(1, 0.5, 0);
    const release = registerSceneInteraction({
      id: "test:empty-linked-carrier",
      root,
      activeUnits: [0],
      activation: {
        kind: "action",
        label: "Open test action",
        run: () => undefined,
      },
    });

    const projected = projectDoor("test:empty-linked-carrier");
    expect(projected).not.toBeNull();
    expect(projected!.x).toBeGreaterThan(50);
    expect(projected!.y).toBeLessThan(50);
    expect(projected!.behind).toBe(false);
    release();
  });

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

    expect(doorAtPointer(50, 50)).toBeNull();
    releaseOccluder();
    expect(doorAtPointer(50, 50)).toBe("test:back-door");
    releaseDoor();
  });

  it("resolves a registered easter egg directly from touch coordinates", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => rect,
    } as HTMLElement);

    const release = registerSceneInteraction({
      id: "sky:salesforce",
      root: target(0),
      activeUnits: [0, 1, 2, 3, 4, 5, 6],
      activation: {
        kind: "egg",
        run: () => undefined,
        reducedMotion: "skip",
      },
    });

    expect(activationAtPointer(50, 50)).toEqual({
      id: "sky:salesforce",
      kind: "egg",
    });
    release();
  });

  it("does not let a prop hidden by an ancestor claim mobile focus", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => rect,
    } as HTMLElement);

    const hiddenParent = new Group();
    hiddenParent.visible = false;
    const hiddenRoot = target(1);
    hiddenParent.add(hiddenRoot);
    hiddenParent.updateMatrixWorld(true);
    const releaseHidden = registerSceneInteraction({
      id: "test:hidden-focus-thief",
      root: hiddenRoot,
      activeUnits: [0],
      touchPriority: 10,
      activation: {
        kind: "action",
        label: "Hidden action",
        run: () => undefined,
      },
    });
    const releaseVisible = registerSceneInteraction({
      id: "test:visible-action",
      root: target(0),
      activeUnits: [0],
      activation: {
        kind: "action",
        label: "Visible action",
        run: () => undefined,
      },
    });

    expect(projectedInteractionBounds().map(({ id }) => id)).toEqual([
      "test:visible-action",
    ]);
    expect(activationAtPointer(50, 50)).toEqual({
      id: "test:visible-action",
      kind: "action",
    });

    releaseVisible();
    releaseHidden();
  });

  it("moves a carried prop's focus target with its rendered root", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => rect,
    } as HTMLElement);

    const root = target(0);
    const release = registerSceneInteraction({
      id: "test:moved-prop",
      root,
      activeUnits: [0],
      movable: { massKg: 1, massClass: "light" },
      activation: {
        kind: "action",
        label: "Open moved prop",
        run: () => undefined,
      },
    });

    const before = projectedInteractionBounds()[0]!;
    const beforeCenter = (before.left + before.right) / 2;
    expect(activationAtPointer(beforeCenter, 50)?.id).toBe(
      "test:moved-prop",
    );

    root.position.x = 2;
    const after = projectedInteractionBounds()[0]!;
    const afterCenter = (after.left + after.right) / 2;
    expect(afterCenter).toBeGreaterThan(beforeCenter + 20);
    expect(activationAtPointer(beforeCenter, 50)).toBeNull();
    expect(activationAtPointer(afterCenter, 50)?.id).toBe("test:moved-prop");

    release();
  });

  it("keeps a visible neighboring-unit prop touchable outside its owning unit", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => rect,
    } as HTMLElement);

    const release = registerSceneInteraction({
      id: "book:visible-from-golf",
      root: target(0),
      activeUnits: [1],
      movable: { massKg: 0.65, massClass: "light" },
    });

    expect(projectedInteractionBounds().map(({ id }) => id)).toContain(
      "book:visible-from-golf",
    );

    release();
  });

  it("does not expose off-screen props after removing the active-unit gate", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => rect,
    } as HTMLElement);

    const root = target(0);
    root.position.x = 100;
    root.updateMatrixWorld(true);
    const release = registerSceneInteraction({
      id: "test:distant-shelf-prop",
      root,
      activeUnits: [6],
      movable: { massKg: 1, massClass: "light" },
    });

    expect(projectedInteractionBounds()).toEqual([]);

    release();
  });
});
