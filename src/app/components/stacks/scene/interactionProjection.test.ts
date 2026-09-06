import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  SphereGeometry,
  Vector3,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { afterEach, describe, expect, it } from "vitest";

import { meshBoxInLocal } from "./interaction";
import {
  activationAtPointer,
  portalAtPointer,
  projectedInteractionBounds,
  setInteractionProjectionContext,
} from "./interactionProjection";
import {
  projectPortal,
  projectSceneInteractionRect,
  registerSceneInteraction,
} from "./interactionRegistry";

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

    const projected = projectPortal("test:empty-linked-carrier");
    expect(projected).not.toBeNull();
    expect(projected!.x).toBeGreaterThan(50);
    expect(projected!.y).toBeLessThan(50);
    expect(projected!.behind).toBe(false);
    release();
  });

  it("uses authored projection bounds instead of a wide-line shader quad", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => rect,
    } as HTMLElement);

    const root = new Group();
    root.add(
      new Mesh(new SphereGeometry(0.1), new MeshBasicMaterial()).translateY(
        0.15,
      ),
    );
    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions([-0.05, 0.15, 0, 0.05, 0.15, 0]);
    root.add(new LineSegments2(lineGeometry, new LineMaterial()));
    const release = registerSceneInteraction({
      id: "test:wide-line-portal",
      root,
      activeUnits: [0],
      projectedLocalBounds: {
        min: [-0.1, 0.05, -0.1],
        max: [0.1, 0.25, 0.1],
      },
      activation: {
        kind: "action",
        label: "Open wide-line prop",
        run: () => undefined,
      },
    });

    const projected = projectPortal("test:wide-line-portal");
    release();
    lineGeometry.dispose();
    expect(projected).not.toBeNull();
    expect(projected!.y).toBeGreaterThan(40);
    expect(projected!.y).toBeLessThan(50);
  });

  it("projects a live artifact rectangle for the image-preview handoff", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => rect,
    } as HTMLElement);

    const root = target(0);
    const release = registerSceneInteraction({
      id: "test:artifact-preview",
      root,
      activeUnits: [2],
      activation: {
        kind: "artifact",
        label: "Test chart",
        run: () => undefined,
      },
    });

    const projected = projectSceneInteractionRect("test:artifact-preview");
    release();
    expect(projected).not.toBeNull();
    expect(projected!.left).toBeLessThan(50);
    expect(projected!.top).toBeLessThan(50);
    expect(projected!.width).toBeGreaterThan(0);
    expect(projected!.height).toBeGreaterThan(0);
  });

  it("keeps shader-line helpers out of hover hinge measurements", () => {
    const root = new Group();
    root.add(
      new Mesh(new SphereGeometry(0.1), new MeshBasicMaterial()).translateY(
        0.15,
      ),
    );
    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions([-0.05, 0.15, 0, 0.05, 0.15, 0]);
    const line = new LineSegments2(lineGeometry, new LineMaterial());
    line.userData.physicsIgnore = true;
    root.add(line);

    const measured = meshBoxInLocal(root);
    lineGeometry.dispose();

    expect(measured).not.toBeNull();
    expect(measured!.getSize(new Vector3()).y).toBeLessThan(0.25);
  });

  it("lets the nearest registered non-Portal occlude a Portal on touch", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => rect,
    } as HTMLElement);

    const releasePortal = registerSceneInteraction({
      id: "test:back-portal",
      root: target(0),
      activeUnits: [0],
      activation: {
        kind: "portal",
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

    expect(portalAtPointer(50, 50)).toBeNull();
    releaseOccluder();
    expect(portalAtPointer(50, 50)).toBe("test:back-portal");
    releasePortal();
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
    expect(activationAtPointer(beforeCenter, 50)?.id).toBe("test:moved-prop");

    root.position.x = 2;
    const after = projectedInteractionBounds()[0]!;
    const afterCenter = (after.left + after.right) / 2;
    expect(afterCenter).toBeGreaterThan(beforeCenter + 20);
    expect(activationAtPointer(beforeCenter, 50)).toBeNull();
    expect(activationAtPointer(afterCenter, 50)?.id).toBe("test:moved-prop");

    release();
  });

  it("follows children that travel away from their carrier when liveBounds is set", () => {
    // The projection box is measured once in the carrier's frame and cached,
    // which is right for every prop whose carrier is what moves. The Mac's
    // approach moves the CHILDREN while the carrier stays on the shelf, so
    // without the opt-out its label would anchor to the empty shelf spot.
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => rect,
    } as HTMLElement);

    const build = (id: string, liveBounds: boolean) => {
      const root = new Group();
      const child = new Mesh(
        new BoxGeometry(1, 1, 0.2),
        new MeshBasicMaterial(),
      );
      root.add(child);
      root.updateMatrixWorld(true);
      const release = registerSceneInteraction({
        id,
        root,
        activeUnits: [0],
        liveBounds,
        activation: { kind: "action", label: id, run: () => undefined },
      });
      const before = projectPortal(id)!.x;
      child.position.x = 2;
      child.updateMatrixWorld(true);
      const after = projectPortal(id)!.x;
      release();
      return { before, after };
    };

    const cached = build("test:cached-children", false);
    expect(cached.after).toBe(cached.before);
    const live = build("test:live-children", true);
    expect(live.after).toBeGreaterThan(live.before + 20);
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

  it("keeps registry-only structure out of Touch Focus hit testing", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    setInteractionProjectionContext(camera, {
      getBoundingClientRect: () => rect,
    } as HTMLElement);

    const release = registerSceneInteraction({
      id: "shelf:perch-owner",
      root: target(0),
      activeUnits: [0],
      touchable: false,
      hover: { kind: "none" },
    });

    expect(projectedInteractionBounds()).toEqual([]);
    expect(activationAtPointer(50, 50)).toBeNull();

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
