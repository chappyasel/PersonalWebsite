import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";

import { PhysicsSceneScope } from "./PhysicsSceneProvider";
import {
  getMeadowDisturbance,
  resetMeadowDisturbance,
} from "./meadowDisturbance";
import { MEADOW_TRAIL } from "./meadowMotion";
import {
  GRAVITY,
  type ShelfHandle,
  freeBodyStepPolicy,
  prepareScenePhysics,
  resolveShelf,
  staticColliderSupportY,
  warm,
} from "./physics";
import { physicsDiagnosticsController } from "./physicsDiagnostics";
import { SHELF_GEOMETRY, SHELF_SURFACE } from "./shelfGeometry";
import {
  ABOUT_READING_BOOK,
  readingStackPoses,
} from "./units/aboutReadingStack";

function box(
  size: [number, number, number],
  position: [number, number, number],
) {
  const value = new THREE.Mesh(new THREE.BoxGeometry(...size));
  value.position.set(...position);
  return value;
}

function handle(
  key: string,
  group: THREE.Group,
  plane: "top" | "lower" | "floor" = "top",
  enabled = true,
): ShelfHandle {
  return {
    key,
    unitIndex: 0,
    group,
    base: group.position.clone(),
    spin: 0.9,
    shape: "box",
    plane,
    phase: { current: "rest" },
    physicsEnabled: enabled,
  };
}

const fixtureScopes = new WeakMap<THREE.Object3D, PhysicsSceneScope>();

afterEach(() => {
  physicsDiagnosticsController.reset();
  resetMeadowDisturbance();
});

function worldFor(group: THREE.Object3D, handles: ShelfHandle[]) {
  let root = group;
  while (root.parent) root = root.parent;
  let scope = fixtureScopes.get(root);
  if (!scope) {
    scope = new PhysicsSceneScope();
    scope.registerRoot({
      id: `test:${root.uuid}`,
      kind: "unit",
      unitIndex: 0,
      root,
    });
    fixtureScopes.set(root, scope);
  }
  for (const entry of handles) scope.registerHandle(entry);
  const requested =
    handles.find((entry) => entry.group === group) ?? handles[0]!;
  return prepareScenePhysics(scope, requested);
}

function topFixture() {
  const root = new THREE.Group();
  const shelf = new THREE.Group();
  shelf.position.y = 0.035;
  root.add(shelf);
  const prop = new THREE.Group();
  prop.add(box([0.2, 0.2, 0.2], [0, 0.1, 0]));
  shelf.add(prop);
  root.updateWorldMatrix(true, true);
  return { root, shelf, prop };
}

function ballFixture() {
  const root = new THREE.Group();
  const shelf = new THREE.Group();
  shelf.position.y = 0.035;
  root.add(shelf);
  const prop = new THREE.Group();
  prop.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8)));
  prop.children[0]!.position.y = 0.1;
  shelf.add(prop);
  root.updateWorldMatrix(true, true);
  return { shelf, prop };
}

describe("static collider support height", () => {
  it("keeps shelf-world neighbours above their local plank surface", () => {
    expect(staticColliderSupportY("top")).toBe(0);
    expect(staticColliderSupportY("lower")).toBe(0);
  });

  it("keeps floor-world neighbours down on the shared room floor", () => {
    expect(staticColliderSupportY("floor")).toBe(SHELF_GEOMETRY.groundY);
    expect(staticColliderSupportY("floor")).toBeLessThan(0);
  });
});

describe("shelf physics lifecycle and carrying", () => {
  it("uses physical gravity", () => {
    expect(GRAVITY).toBe(9.81);
  });

  it("bounds thin-body collision stepping so a slow frame cannot multiply solver work", () => {
    expect(freeBodyStepPolicy(false)).toEqual({
      fixedStep: 1 / 60,
      maxSubSteps: 2,
    });
    expect(freeBodyStepPolicy(true)).toEqual({
      fixedStep: 1 / 240,
      maxSubSteps: 4,
    });
    // The thin tier buys narrowphase resolution, not solver catch-up time.
    // Its ceiling is still 1/60 s of simulated time per frame, exactly what
    // two 1/120 steps bought, so a late frame cannot spiral any further than
    // it already could.
    const thin = freeBodyStepPolicy(true);
    expect(thin.fixedStep * thin.maxSubSteps).toBeCloseTo(1 / 60, 10);
  });

  it("knocks a parked prop into dynamic motion with a toppling spin", async () => {
    await warm();
    const { prop } = topFixture();
    const entry = handle("shockwave-neighbor", prop);
    const prepared = worldFor(prop, [entry]);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;

    expect(prepared.world.knock(entry, new THREE.Vector3(1.4, 0.32, 0))).toBe(
      true,
    );
    expect(entry.phase.current).toBe("sim");
    expect(entry.parked).toBe(false);
    expect(entry.body?.velocity.length()).toBeGreaterThan(1);
    expect(entry.body?.angularVelocity.length()).toBeGreaterThan(5);
  });

  it("resolves top, lower, and floor handles from their shared support frame", () => {
    const top = topFixture();
    expect(resolveShelf(top.prop).plane).toBe("top");

    const lowerRoot = new THREE.Group();
    const lowerShelf = new THREE.Group();
    lowerShelf.position.y =
      SHELF_GEOMETRY.lower.centerY + SHELF_GEOMETRY.lower.thickness / 2;
    const lowerProp = new THREE.Group();
    lowerRoot.add(lowerShelf);
    lowerShelf.add(lowerProp);
    lowerRoot.updateWorldMatrix(true, true);
    expect(resolveShelf(lowerProp).plane).toBe("lower");

    const floorRoot = new THREE.Group();
    const floorProp = new THREE.Group();
    floorRoot.add(floorProp);
    floorRoot.updateWorldMatrix(true, true);
    expect(resolveShelf(floorProp).plane).toBe("floor");
  });

  it("prepares a ready handle while a sibling remains pending, then adopts it", async () => {
    await warm();
    const { shelf, prop } = topFixture();
    const pending = new THREE.Group();
    pending.position.x = -0.6;
    shelf.add(pending);
    const readyHandle = handle("ready", prop);
    const pendingHandle = handle("pending", pending);
    const handles = [readyHandle, pendingHandle];

    const first = worldFor(prop, handles);
    expect(first.status).toBe("ready");
    expect(readyHandle.body).toBeDefined();
    expect(pendingHandle.body).toBeUndefined();

    pending.add(box([0.15, 0.15, 0.15], [0, 0.075, 0]));
    shelf.updateWorldMatrix(true, true);
    const second = worldFor(prop, handles);
    expect(second.status).toBe("ready");
    expect(pendingHandle.body).toBeDefined();
  });

  it("adopts late static geometry on the next preparation revision", async () => {
    await warm();
    const { shelf, prop } = topFixture();
    const entry = handle("late-static", prop);
    const first = worldFor(prop, [entry]);
    expect(first.status).toBe("ready");
    if (first.status !== "ready") return;
    const before = first.world.report();
    expect(before.neighbours).toHaveLength(0);

    shelf.add(box([0.12, 0.2, 0.12], [0.55, 0.1, 0]));
    shelf.updateWorldMatrix(true, true);
    const second = worldFor(prop, [entry]);
    expect(second.status).toBe("ready");
    if (second.status !== "ready") return;
    const after = second.world.report();
    expect(after.geometryRevision).not.toBe(before.geometryRevision);
    expect(after.neighbours).toHaveLength(1);
  });

  it("blocks normal motion and preserves tangential wall sliding", async () => {
    await warm();
    const { shelf, prop } = topFixture();
    shelf.add(box([0.04, 0.45, 0.8], [0.3, 0.225, 0]));
    shelf.updateWorldMatrix(true, true);
    const entry = handle("moving", prop);
    const prepared = worldFor(prop, [entry]);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    expect(prepared.world.grab(entry)).toBe(true);

    const result = prepared.world.moveHeld(
      entry,
      {
        position: new THREE.Vector3(0.5, 0, 0.3),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.accepted.position.x).toBeLessThanOrEqual(0.191);
    // The static hull's thin x axis limits this frame to 40% of cursor
    // demand; at least 80% of that unobstructed tangent still advances.
    expect(result.accepted.position.z).toBeGreaterThan(0.095);
    expect(result.sliding).toBe(true);

    const pinned = prepared.world.moveHeld(
      entry,
      {
        position: new THREE.Vector3(0.5, 0, 0.3),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    expect(Math.abs(pinned.acceptedVelocity.x)).toBeLessThan(0.01);
    prepared.world.release(entry, pinned.acceptedVelocity);
    expect(Math.abs(entry.body!.velocity.x)).toBeLessThan(0.01);
  });

  it("can isolate held collision probing without disabling the solver", async () => {
    await warm();
    const { shelf, prop } = topFixture();
    shelf.add(box([0.04, 0.45, 0.8], [0.3, 0.225, 0]));
    shelf.updateWorldMatrix(true, true);
    const entry = handle("probe-isolation", prop);
    const prepared = worldFor(prop, [entry]);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    prepared.world.grab(entry);
    physicsDiagnosticsController.update({
      runtime: {
        ...physicsDiagnosticsController.getSnapshot().runtime,
        heldCollisionProbes: false,
      },
    });
    let result = prepared.world.moveHeld(
      entry,
      {
        position: new THREE.Vector3(0.5, 0, 0),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    for (let attempt = 0; attempt < 3; attempt++)
      result = prepared.world.moveHeld(
        entry,
        {
          position: new THREE.Vector3(0.5, 0, 0),
          quaternion: new THREE.Quaternion(),
        },
        1 / 60,
      );
    expect(result.blockers).toEqual([]);
    expect(result.accepted.position.x).toBeCloseTo(0.5);
  });

  it("can isolate generated scene statics while retaining authored supports", async () => {
    await warm();
    const { shelf, prop } = topFixture();
    shelf.add(box([0.04, 0.45, 0.8], [0.3, 0.225, 0]));
    shelf.updateWorldMatrix(true, true);
    const entry = handle("static-isolation", prop);
    const prepared = worldFor(prop, [entry]);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    prepared.world.grab(entry);
    physicsDiagnosticsController.update({
      runtime: {
        ...physicsDiagnosticsController.getSnapshot().runtime,
        generatedStatics: false,
      },
    });
    let result = prepared.world.moveHeld(
      entry,
      {
        position: new THREE.Vector3(0.5, 0, 0),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    for (let attempt = 0; attempt < 3; attempt++)
      result = prepared.world.moveHeld(
        entry,
        {
          position: new THREE.Vector3(0.5, 0, 0),
          quaternion: new THREE.Quaternion(),
        },
        1 / 60,
      );
    expect(result.blockers).toEqual([]);
    expect(result.accepted.position.x).toBeGreaterThan(0.45);
  });

  it("can pause and resume free-body simulation without moving the prop", async () => {
    await warm();
    const { prop } = topFixture();
    const entry = handle("simulation-isolation", prop);
    const prepared = worldFor(prop, [entry]);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    prepared.world.grab(entry);
    prepared.world.moveHeld(
      entry,
      {
        position: new THREE.Vector3(0, 0.45, 0),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    prepared.world.release(entry, new THREE.Vector3());
    physicsDiagnosticsController.update({
      runtime: {
        ...physicsDiagnosticsController.getSnapshot().runtime,
        simulation: false,
      },
    });
    const pausedY = entry.group.position.y;
    for (let frame = 0; frame < 30; frame++)
      prepared.world.tick(1 / 60, frame + 1);
    expect(entry.group.position.y).toBeCloseTo(pausedY, 8);

    physicsDiagnosticsController.update({
      runtime: {
        ...physicsDiagnosticsController.getSnapshot().runtime,
        simulation: true,
      },
    });
    for (let frame = 30; frame < 40; frame++)
      prepared.world.tick(1 / 60, frame + 1);
    expect(entry.group.position.y).toBeLessThan(pausedY - 0.05);
  });

  it("subdivides motion so a thin obstacle cannot be tunneled through", async () => {
    await warm();
    const { shelf, prop } = topFixture();
    shelf.add(box([0.01, 0.4, 0.5], [0.28, 0.2, 0]));
    shelf.updateWorldMatrix(true, true);
    const entry = handle("swept", prop);
    const prepared = worldFor(prop, [entry]);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    prepared.world.grab(entry);
    let result = prepared.world.moveHeld(
      entry,
      {
        position: new THREE.Vector3(1, 0, 0),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    for (let index = 0; index < 8; index++)
      result = prepared.world.moveHeld(
        entry,
        {
          position: new THREE.Vector3(1, 0, 0),
          quaternion: new THREE.Quaternion(),
        },
        1 / 60,
      );
    expect(result.accepted.position.x).toBeLessThan(0.19);
    expect(result.acceptedVelocity.x).toBeLessThan(0.02);
  });

  it("keeps an opted-out root bodyless without turning it into a generated static", async () => {
    await warm();
    const { shelf, prop } = topFixture();
    const opted = new THREE.Group();
    opted.position.x = 0.45;
    opted.add(box([0.2, 0.2, 0.2], [0, 0.1, 0]));
    shelf.add(opted);
    shelf.updateWorldMatrix(true, true);
    const moving = handle("moving-enabled", prop);
    const authored = handle("authored", opted, "top", false);
    const prepared = worldFor(prop, [moving, authored]);
    expect(prepared.status).toBe("ready");
    expect(authored.body).toBeUndefined();
    if (prepared.status === "ready")
      expect(prepared.world.report().neighbours).toHaveLength(0);
  });

  it("activates a pinned prop at its detached pose", async () => {
    await warm();
    const { shelf, prop } = topFixture();
    const pinnedGroup = new THREE.Group();
    pinnedGroup.position.x = 0.45;
    pinnedGroup.add(box([0.2, 0.2, 0.03], [0, 0.1, 0]));
    shelf.add(pinnedGroup);
    shelf.updateWorldMatrix(true, true);

    const moving = handle("moving-before-pin", prop);
    const pinned = handle("pinned-until-carried", pinnedGroup);
    pinned.physicsActivation = "detach";
    pinned.physicsActivated = false;

    const first = worldFor(prop, [moving, pinned]);
    expect(first.status).toBe("ready");
    expect(pinned.body).toBeUndefined();
    expect(pinned.physicsActivated).toBe(false);

    pinnedGroup.position.z += 0.08;
    pinned.physicsActivated = true;
    const second = worldFor(pinnedGroup, [moving, pinned]);
    expect(second.status).toBe("ready");
    if (second.status !== "ready") return;
    expect(pinned.body).toBeDefined();
    expect(second.world.grab(pinned)).toBe(true);
    expect(pinned.body!.type).not.toBe(moving.body!.type);
    expect(pinned.body!.position.z).toBeGreaterThan(0.05);
  });

  it("pushes a dynamic blocker without accepting an overlapped pose", async () => {
    await warm();
    const { shelf, prop } = topFixture();
    const blocker = new THREE.Group();
    blocker.position.x = 0.34;
    blocker.add(box([0.2, 0.2, 0.2], [0, 0.1, 0]));
    shelf.add(blocker);
    shelf.updateWorldMatrix(true, true);
    const moving = handle("dynamic-moving", prop);
    const blocked = handle("dynamic-blocker", blocker);
    const prepared = worldFor(prop, [moving, blocked]);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    prepared.world.grab(moving);
    const result = prepared.world.moveHeld(
      moving,
      {
        position: new THREE.Vector3(0.5, 0, 0),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    expect(result.blockers).toContain("dynamic-blocker");
    expect(result.accepted.position.x).toBeLessThan(0.16);
    expect(blocked.body!.velocity.x).toBeGreaterThan(0);
    expect(blocked.phase.current).toBe("sim");
  });

  it("releases at the accepted pose and falls monotonically under 9.81 gravity", async () => {
    await warm();
    const { prop } = topFixture();
    const entry = handle("drop", prop);
    const impactRevision = getMeadowDisturbance().physicalEvent.revision;
    const prepared = worldFor(prop, [entry]);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    prepared.world.grab(entry);
    const lifted = prepared.world.moveHeld(
      entry,
      {
        position: new THREE.Vector3(0, 0.2, 0),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    const releaseY = lifted.accepted.position.y;
    expect(prepared.world.release(entry, new THREE.Vector3())).toBe(true);
    expect(entry.group.position.y).toBeCloseTo(releaseY, 6);
    const heights: number[] = [];
    for (let frame = 0; frame < 10; frame++) {
      prepared.world.tick(1 / 60, frame + 1);
      heights.push(entry.group.position.y);
    }
    expect(
      heights.every(
        (height, index) => index === 0 || height <= heights[index - 1]!,
      ),
    ).toBe(true);
    expect(heights.at(-1)).toBeLessThan(releaseY - 0.1);
    for (let frame = 10; frame < 120; frame++)
      prepared.world.tick(1 / 60, frame + 1);
    expect(entry.body!.sleepState).toBe(2);
    expect(getMeadowDisturbance().physicalEvent.revision).toBe(impactRevision);
  });

  it("honors an authored basketball restitution on a shelf landing", async () => {
    await warm();
    const { prop } = ballFixture();
    const entry = handle("bouncy-ball", prop);
    entry.shape = "sphere";
    entry.massKg = 0.62;
    entry.restitution = 0.62;
    const prepared = worldFor(prop, [entry]);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    prepared.world.grab(entry);
    prepared.world.moveHeld(
      entry,
      {
        position: new THREE.Vector3(0, 0.45, 0),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    prepared.world.release(entry, new THREE.Vector3());

    let reboundVelocity = 0;
    for (let frame = 0; frame < 150; frame++) {
      prepared.world.tick(1 / 120, frame + 1);
      reboundVelocity = Math.max(reboundVelocity, entry.body!.velocity.y);
    }

    expect(reboundVelocity).toBeGreaterThan(0.8);
  });

  it("settles a dropped prop on another movable prop without a secondary bounce", async () => {
    await warm();
    const root = new THREE.Group();
    const shelf = new THREE.Group();
    shelf.position.y = SHELF_SURFACE.top;
    root.add(shelf);

    const supportGroup = new THREE.Group();
    supportGroup.add(box([0.3, 0.2, 0.3], [0, 0.1, 0]));
    shelf.add(supportGroup);
    const droppedGroup = new THREE.Group();
    droppedGroup.position.y = 0.55;
    const droppedMesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8));
    droppedMesh.position.y = 0.1;
    droppedGroup.add(droppedMesh);
    shelf.add(droppedGroup);
    root.updateWorldMatrix(true, true);

    const support = handle("stack-support", supportGroup);
    const dropped = handle("stack-dropped", droppedGroup);
    dropped.shape = "sphere";
    const prepared = worldFor(droppedGroup, [support, dropped]);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    prepared.world.grab(dropped);
    prepared.world.release(dropped, new THREE.Vector3());

    let contacted = false;
    let maxReboundVelocity = 0;
    for (let frame = 0; frame < 180; frame++) {
      prepared.world.tick(1 / 120, frame + 1);
      contacted ||= dropped.body!.position.y < SHELF_SURFACE.top + 0.36;
      if (contacted)
        maxReboundVelocity = Math.max(
          maxReboundVelocity,
          dropped.body!.velocity.y,
        );
    }

    expect(contacted).toBe(true);
    expect(maxReboundVelocity).toBeLessThan(0.15);
    expect(dropped.body!.sleepState).toBe(2);
    expect(support.body!.sleepState).toBe(2);
  });

  it("can drag a prop beyond a finite shelf edge and land it on the room floor", async () => {
    await warm();
    const { prop } = topFixture();
    const entry = handle("dragged-off", prop);
    const impactRevision = getMeadowDisturbance().physicalEvent.revision;
    const prepared = worldFor(prop, [entry]);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    expect(prepared.world.report().authoredStatics).toBe(3);
    prepared.world.grab(entry);

    let moved = prepared.world.moveHeld(
      entry,
      {
        position: new THREE.Vector3(1.55, 0, 0),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    moved = prepared.world.moveHeld(
      entry,
      {
        position: new THREE.Vector3(1.55, 0, 0),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    expect(moved.blockers).toHaveLength(0);
    expect(moved.accepted.position.x).toBeCloseTo(1.55, 3);

    prepared.world.release(entry, new THREE.Vector3());
    for (let frame = 0; frame < 120; frame++)
      prepared.world.tick(1 / 60, frame + 1);
    expect(entry.group.position.y).toBeLessThan(-1);
    expect(entry.group.position.x).toBeCloseTo(1.55, 1);
    const impact = getMeadowDisturbance().physicalEvent;
    expect(impact.revision).toBe(impactRevision + 1);
    expect(impact.y).toBeLessThan(SHELF_GEOMETRY.groundY + 0.02);
    expect(impact.y).toBeGreaterThan(SHELF_GEOMETRY.groundY - 0.15);
    expect(impact.strength).toBeGreaterThan(0);
  });

  it("can throw a prop across the shelf edge", async () => {
    await warm();
    const { prop } = topFixture();
    const entry = handle("thrown-off", prop);
    const prepared = worldFor(prop, [entry]);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    prepared.world.grab(entry);
    prepared.world.moveHeld(
      entry,
      {
        position: new THREE.Vector3(1.23, 0, 0),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    prepared.world.moveHeld(
      entry,
      {
        position: new THREE.Vector3(1.23, 0, 0),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    prepared.world.release(entry, new THREE.Vector3(3, 0, 0));
    for (let frame = 0; frame < 30; frame++)
      prepared.world.tick(1 / 60, frame + 1);
    expect(entry.group.position.x).toBeGreaterThan(SHELF_GEOMETRY.width / 2);
    expect(entry.group.position.y).toBeLessThan(-0.1);
  });
});

function sceneHandle(
  key: string,
  unit: THREE.Group,
  plane: "top" | "lower" | "floor",
  x = 0,
) {
  const parent = new THREE.Group();
  parent.position.y =
    plane === "top"
      ? SHELF_GEOMETRY.top.centerY + SHELF_GEOMETRY.top.thickness / 2
      : plane === "lower"
        ? SHELF_GEOMETRY.lower.centerY + SHELF_GEOMETRY.lower.thickness / 2
        : SHELF_GEOMETRY.groundY;
  unit.add(parent);
  const prop = new THREE.Group();
  prop.position.x = x;
  prop.add(box([0.2, 0.2, 0.2], [0, 0.1, 0]));
  parent.add(prop);
  return handle(key, prop, plane);
}

describe("scene-wide physics world", () => {
  it("emits bounded travel wakes while a released prop crosses the ground", async () => {
    await warm();
    const unit = new THREE.Group();
    const entry = sceneHandle("ground-trail", unit, "floor");
    entry.shape = "sphere";
    entry.massKg = 0.62;
    const scope = new PhysicsSceneScope();
    scope.registerRoot({
      id: "unit:ground-trail",
      kind: "unit",
      unitIndex: 0,
      root: unit,
    });
    scope.registerHandle(entry);
    unit.updateWorldMatrix(true, true);
    const prepared = prepareScenePhysics(scope, entry);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    const revision = getMeadowDisturbance().physicalEvent.revision;
    prepared.world.grab(entry);
    prepared.world.release(entry, new THREE.Vector3(4, 0, 0));
    for (let frame = 0; frame < 90; frame += 1)
      prepared.world.tick(1 / 120, frame + 1);

    const impact = getMeadowDisturbance().physicalEvent;
    expect(impact.revision).toBeGreaterThan(revision + 1);
    expect(impact.directionX).toBeGreaterThan(0.9);
    expect(impact.timeScale).toBe(MEADOW_TRAIL.timeScale);
    expect(impact.radius).toBeGreaterThan(0);
    expect(impact.kind).toBe("trail");
    expect(impact.endX).toBeGreaterThan(impact.startX);
  });

  it("resets every settled About reading-stack book after leaving it off-screen", async () => {
    await warm();
    const unit = new THREE.Group();
    const lower = new THREE.Group();
    lower.position.y = SHELF_SURFACE.lower;
    unit.add(lower);
    const scope = new PhysicsSceneScope();
    const entries = readingStackPoses().map((pose, index) => {
      const prop = new THREE.Group();
      prop.position.set(...pose.base);
      const facing = new THREE.Group();
      facing.rotation.set(...pose.rotation);
      facing.add(
        box(
          [
            ABOUT_READING_BOOK.width,
            ABOUT_READING_BOOK.thickness,
            ABOUT_READING_BOOK.depth,
          ],
          [0, 0, 0],
        ),
      );
      prop.add(facing);
      lower.add(prop);
      const entry = handle(`about-reading:${index}`, prop, "lower");
      entry.unitIndex = 0;
      entry.massKg = 0.62;
      scope.registerHandle(entry);
      return entry;
    });
    scope.registerRoot({
      id: "unit:about-reading",
      kind: "unit",
      unitIndex: 0,
      root: unit,
    });
    unit.updateWorldMatrix(true, true);
    const prepared = prepareScenePhysics(scope, entries[0]!);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;

    for (const [index, entry] of entries.entries()) {
      expect(prepared.world.grab(entry)).toBe(true);
      prepared.world.moveHeld(
        entry,
        {
          position: entry.base
            .clone()
            .add(new THREE.Vector3(0.15 * index, 0.2, 0.18)),
          quaternion: new THREE.Quaternion(),
        },
        1 / 60,
      );
      prepared.world.release(entry, new THREE.Vector3());
    }

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(26.4, 0.2, 5);
    camera.lookAt(26.4, 0, 0);
    camera.updateProjectionMatrix();
    for (let frame = 0; frame < 600; frame++)
      prepared.world.tick(1 / 120, frame + 1, camera);

    expect(entries.map((entry) => entry.phase.current)).toEqual([
      "rest",
      "rest",
      "rest",
    ]);
    for (const entry of entries)
      expect(entry.group.position.toArray()).toEqual(entry.base.toArray());
  });

  it("builds shelf statics when the first pointerdown already marked its handle held", async () => {
    await warm();
    const unit = new THREE.Group();
    const entry = sceneHandle("first-held-grab", unit, "top");
    const scope = new PhysicsSceneScope();
    scope.registerRoot({
      id: "unit:first-held-grab",
      kind: "unit",
      unitIndex: 0,
      root: unit,
    });
    scope.registerHandle(entry);
    unit.updateWorldMatrix(true, true);

    // This is the real Grabbable pointerdown order: authored carrying starts
    // before the lazy solver prepares its first scene world.
    entry.phase.current = "held";
    const prepared = prepareScenePhysics(scope, entry);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    expect(prepared.world.grab(entry)).toBe(true);
    prepared.world.moveHeld(
      entry,
      {
        position: entry.base.clone().add(new THREE.Vector3(0, 0.45, 0)),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    prepared.world.release(entry, new THREE.Vector3());
    for (let frame = 0; frame < 180; frame++)
      prepared.world.tick(1 / 120, frame + 1);

    expect(entry.body!.position.y).toBeGreaterThan(SHELF_SURFACE.top + 0.05);
  });

  it("does not drag a lower-shelf prop downward through its plank", async () => {
    await warm();
    const unit = new THREE.Group();
    const entry = sceneHandle("lower-held-plank", unit, "lower");
    const scope = new PhysicsSceneScope();
    scope.registerRoot({
      id: "unit:lower-held-plank",
      kind: "unit",
      unitIndex: 0,
      root: unit,
    });
    scope.registerHandle(entry);
    unit.updateWorldMatrix(true, true);

    const prepared = prepareScenePhysics(scope, entry);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    expect(prepared.world.grab(entry)).toBe(true);

    const moved = prepared.world.moveHeld(
      entry,
      {
        position: entry.base.clone().add(new THREE.Vector3(0, -0.2, 0)),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );

    expect(moved.blockers).toContain(
      "support:unit:lower-held-plank:plank:lower",
    );
    expect(moved.accepted.position.y).toBeGreaterThan(-0.02);
  });

  it("keeps top-shelf drops on all seven transformed units and resets the distant sleeper", async () => {
    await warm();
    const scene = new THREE.Group();
    const scope = new PhysicsSceneScope();
    const entries: ShelfHandle[] = [];
    for (let index = 0; index < 7; index++) {
      const unit = new THREE.Group();
      unit.position.set(index * 4.4, 0, index % 2 === 0 ? 0 : -0.55);
      unit.rotation.y = index % 2 === 0 ? 0.1 : -0.12;
      scene.add(unit);
      const entry = sceneHandle(`seven-unit:${index}`, unit, "top");
      entry.unitIndex = index;
      entries.push(entry);
      scope.registerRoot({
        id: `unit:${index}`,
        kind: "unit",
        unitIndex: index,
        root: unit,
      });
      scope.registerHandle(entry);
    }
    scene.updateWorldMatrix(true, true);
    const prepared = prepareScenePhysics(scope, entries[0]!);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    for (const entry of entries) {
      expect(prepared.world.grab(entry)).toBe(true);
      prepared.world.moveHeld(
        entry,
        {
          position: entry.base.clone().add(new THREE.Vector3(0, 0.45, 0)),
          quaternion: new THREE.Quaternion(),
        },
        1 / 60,
      );
      prepared.world.release(entry, new THREE.Vector3());
    }
    for (let frame = 0; frame < 180; frame++)
      prepared.world.tick(1 / 120, frame + 1);
    for (const entry of entries) {
      expect(entry.body!.position.y).toBeGreaterThan(SHELF_SURFACE.top + 0.05);
      expect(entry.body!.position.y).toBeLessThan(SHELF_SURFACE.top + 0.2);
    }

    const distant = entries.at(-1)!;
    distant.body!.position.x += 1;
    distant.body!.allowSleep = true;
    distant.body!.sleep();
    distant.phase.current = "sim";
    distant.parked = false;
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    for (let frame = 180; frame < 245; frame++)
      prepared.world.tick(1 / 60, frame + 1, camera);
    expect(distant.phase.current).toBe("rest");
    expect(distant.group.position.toArray()).toEqual(distant.base.toArray());
  });

  it("does not tunnel through thin planks on a fast downward release", async () => {
    await warm();
    const unit = new THREE.Group();
    const ballParent = new THREE.Group();
    ballParent.position.y = SHELF_SURFACE.top;
    unit.add(ballParent);
    const ballGroup = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8));
    mesh.position.y = 0.1;
    ballGroup.add(mesh);
    ballParent.add(ballGroup);
    unit.updateWorldMatrix(true, true);
    const ball = handle("fast-downward", ballGroup);
    ball.shape = "sphere";
    ball.maxThrowSpeed = 8;
    const scope = new PhysicsSceneScope();
    scope.registerRoot({
      id: "unit:fast",
      kind: "unit",
      unitIndex: 0,
      root: unit,
    });
    scope.registerHandle(ball);
    const prepared = prepareScenePhysics(scope, ball);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    prepared.world.grab(ball);
    prepared.world.moveHeld(
      ball,
      {
        position: new THREE.Vector3(0, 0.25, 0),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    prepared.world.release(ball, new THREE.Vector3(0, -8, 0));
    let fellBelowTop = false;
    for (let frame = 0; frame < 60; frame++) {
      prepared.world.tick(1 / 30, frame + 1);
      fellBelowTop ||= ball.body!.position.y < SHELF_SURFACE.top - 0.05;
    }
    expect(fellBelowTop).toBe(false);
    expect(ball.body!.position.y).toBeGreaterThan(SHELF_SURFACE.top + 0.05);
  });

  it("does not tunnel a fast thin prop with the bounded step policy", async () => {
    await warm();
    const unit = new THREE.Group();
    const propParent = new THREE.Group();
    propParent.position.y = SHELF_SURFACE.top;
    unit.add(propParent);
    const propGroup = new THREE.Group();
    propGroup.add(box([0.2, 0.02, 0.2], [0, 0.01, 0]));
    propParent.add(propGroup);
    unit.updateWorldMatrix(true, true);
    const prop = handle("fast-thin", propGroup);
    prop.maxThrowSpeed = 4;
    const scope = new PhysicsSceneScope();
    scope.registerRoot({
      id: "unit:fast-thin",
      kind: "unit",
      unitIndex: 0,
      root: unit,
    });
    scope.registerHandle(prop);
    const prepared = prepareScenePhysics(scope, prop);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    prepared.world.grab(prop);
    prepared.world.moveHeld(
      prop,
      {
        position: new THREE.Vector3(0, 0.25, 0),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    prepared.world.release(prop, new THREE.Vector3(0, -4, 0));
    let fellBelowTop = false;
    for (let frame = 0; frame < 120; frame++) {
      prepared.world.tick(1 / 30, frame + 1);
      fellBelowTop ||= prop.body!.position.y < SHELF_SURFACE.top - 0.02;
    }
    expect(fellBelowTop).toBe(false);
    expect(prop.body!.position.y).toBeGreaterThan(SHELF_SURFACE.top);
  });

  it("adopts shelf colliders for roots registered after the world already exists", async () => {
    await warm();
    const scene = new THREE.Group();
    const first = new THREE.Group();
    scene.add(first);
    const firstEntry = sceneHandle("late-root:first", first, "top");
    const scope = new PhysicsSceneScope();
    scope.registerRoot({
      id: "unit:first",
      kind: "unit",
      unitIndex: 0,
      root: first,
    });
    scope.registerHandle(firstEntry);
    scene.updateWorldMatrix(true, true);
    const prepared = prepareScenePhysics(scope, firstEntry);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;

    const distant = new THREE.Group();
    distant.position.set(26.4, 0, 0);
    scene.add(distant);
    const distantEntry = sceneHandle("late-root:distant", distant, "top");
    distantEntry.unitIndex = 6;
    scope.registerRoot({
      id: "unit:distant",
      kind: "unit",
      unitIndex: 6,
      root: distant,
    });
    scope.registerHandle(distantEntry);
    scene.updateWorldMatrix(true, true);
    const late = prepareScenePhysics(scope, distantEntry);
    expect(late.status).toBe("ready");
    if (late.status !== "ready") return;
    late.world.grab(distantEntry);
    late.world.moveHeld(
      distantEntry,
      {
        position: distantEntry.base.clone().add(new THREE.Vector3(0, 0.4, 0)),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    late.world.release(distantEntry, new THREE.Vector3());
    for (let frame = 0; frame < 180; frame++)
      late.world.tick(1 / 120, frame + 1);
    expect(distantEntry.body!.position.y).toBeGreaterThan(
      SHELF_SURFACE.top + 0.05,
    );
  });

  it("shares one x-axis SAP world across surfaces and transformed units", async () => {
    await warm();
    const scene = new THREE.Group();
    const first = new THREE.Group();
    first.rotation.y = 0.1;
    const second = new THREE.Group();
    second.position.set(4.4, 0, -0.55);
    second.rotation.y = -0.12;
    scene.add(first, second);
    const top = sceneHandle("scene-top", first, "top", 0.3);
    const lower = sceneHandle("scene-lower", first, "lower", -0.3);
    const floor = sceneHandle("scene-floor", second, "floor", 0.2);
    scene.updateWorldMatrix(true, true);

    const scope = new PhysicsSceneScope();
    scope.registerRoot({
      id: "unit:0",
      kind: "unit",
      unitIndex: 0,
      root: first,
    });
    scope.registerRoot({
      id: "unit:1",
      kind: "unit",
      unitIndex: 1,
      root: second,
    });
    for (const entry of [top, lower, floor]) scope.registerHandle(entry);
    const worlds = [top, lower, floor].map((entry) =>
      prepareScenePhysics(scope, entry),
    );
    expect(worlds.every((result) => result.status === "ready")).toBe(true);
    const [topWorld, lowerWorld, floorWorld] = worlds;
    if (
      topWorld?.status !== "ready" ||
      lowerWorld?.status !== "ready" ||
      floorWorld?.status !== "ready"
    )
      return;
    expect(topWorld.world).toBe(lowerWorld.world);
    expect(lowerWorld.world).toBe(floorWorld.world);
    expect(topWorld.world.report().broadphase).toBe("SAPBroadphase");
    expect(topWorld.world.report().broadphaseAxis).toBe(0);

    const expected = floor.group.localToWorld(floor.com!.clone());
    expect(floor.body!.position.x).toBeCloseTo(expected.x, 6);
    expect(floor.body!.position.y).toBeCloseTo(expected.y, 6);
    expect(floor.body!.position.z).toBeCloseTo(expected.z, 6);
  });

  it("updates only the changed root geometry revision", async () => {
    await warm();
    const scene = new THREE.Group();
    const first = new THREE.Group();
    const second = new THREE.Group();
    second.position.x = 4.4;
    scene.add(first, second);
    const left = sceneHandle("left-revision", first, "top");
    const right = sceneHandle("right-revision", second, "top");
    scene.updateWorldMatrix(true, true);
    const scope = new PhysicsSceneScope();
    scope.registerRoot({
      id: "unit:left",
      kind: "unit",
      unitIndex: 0,
      root: first,
    });
    scope.registerRoot({
      id: "unit:right",
      kind: "unit",
      unitIndex: 1,
      root: second,
    });
    scope.registerHandle(left);
    scope.registerHandle(right);
    const prepared = prepareScenePhysics(scope, left);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    const before = prepared.world.report().rootGeometry;
    second.add(box([0.25, 0.3, 0.25], [0.6, -0.95, 0]));
    scene.updateWorldMatrix(true, true);
    prepareScenePhysics(scope, right);
    const after = prepared.world.report().rootGeometry;
    expect(after.find((root) => root.root === "unit:left")?.revision).toBe(
      before.find((root) => root.root === "unit:left")?.revision,
    );
    expect(after.find((root) => root.root === "unit:right")?.revision).not.toBe(
      before.find((root) => root.root === "unit:right")?.revision,
    );
  });

  it("does not retain bodies across provider-scope remounts", async () => {
    await warm();
    const { root, prop } = topFixture();
    const entry = handle("scope-remount", prop);
    const firstScope = new PhysicsSceneScope();
    firstScope.registerRoot({
      id: "unit:scope",
      kind: "unit",
      unitIndex: 0,
      root,
    });
    firstScope.registerHandle(entry);
    const first = prepareScenePhysics(firstScope, entry);
    expect(first.status).toBe("ready");
    if (first.status !== "ready") return;
    const oldWorld = first.world;
    firstScope.dispose();
    expect(entry.body).toBeUndefined();
    expect(entry.world).toBeUndefined();

    const nextScope = new PhysicsSceneScope();
    nextScope.registerRoot({
      id: "unit:scope",
      kind: "unit",
      unitIndex: 0,
      root,
    });
    nextScope.registerHandle(entry);
    const next = prepareScenePhysics(nextScope, entry);
    expect(next.status).toBe("ready");
    if (next.status !== "ready") return;
    expect(next.world).not.toBe(oldWorld);
    expect(entry.body).toBeDefined();
  });

  it("magnitude-caps ordinary throws while allowing the basketball override", async () => {
    await warm();
    const root = new THREE.Group();
    const ballGroup = new THREE.Group();
    ballGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8)));
    const ordinaryGroup = new THREE.Group();
    ordinaryGroup.position.x = 2;
    ordinaryGroup.add(box([0.2, 0.2, 0.2], [0, 0.1, 0]));
    root.add(ballGroup, ordinaryGroup);
    root.updateWorldMatrix(true, true);
    const ball = handle("basketball-speed", ballGroup);
    ball.shape = "sphere";
    ball.restitution = 0.62;
    ball.maxThrowSpeed = 8;
    const ordinary = handle("ordinary-speed", ordinaryGroup);
    const scope = new PhysicsSceneScope();
    scope.registerRoot({ id: "shared:test", kind: "shared", root });
    scope.registerHandle(ball);
    scope.registerHandle(ordinary);
    const prepared = prepareScenePhysics(scope, ball);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;

    prepared.world.grab(ball);
    prepared.world.release(ball, new THREE.Vector3(0, 7, 0));
    expect(ball.body!.velocity.length()).toBeCloseTo(7, 6);
    const releaseY = ball.group.position.y;
    let apex = releaseY;
    for (let frame = 0; frame < 90; frame++) {
      prepared.world.tick(1 / 120, frame + 1);
      apex = Math.max(apex, ball.group.position.y);
    }
    expect(apex - releaseY).toBeGreaterThan(2.3);
    expect(apex - releaseY).toBeLessThan(3.3);

    prepared.world.grab(ordinary);
    prepared.world.release(ordinary, new THREE.Vector3(3, 4, 0));
    expect(ordinary.body!.velocity.length()).toBeCloseTo(4, 6);
  });

  it("installs explicit restitution pairs for wood, ordinary, and bouncy props", async () => {
    await warm();
    const root = new THREE.Group();
    const ballGroup = new THREE.Group();
    ballGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8)));
    const barbellGroup = new THREE.Group();
    barbellGroup.position.x = 0.5;
    barbellGroup.add(box([0.3, 0.15, 0.15], [0, 0.075, 0]));
    const otherBallGroup = new THREE.Group();
    otherBallGroup.position.x = 1;
    otherBallGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8)));
    root.add(ballGroup, barbellGroup, otherBallGroup);
    root.updateWorldMatrix(true, true);
    const ball = handle("material-ball", ballGroup);
    ball.shape = "sphere";
    ball.restitution = 0.62;
    const barbell = handle("material-barbell", barbellGroup);
    const otherBall = handle("material-other-ball", otherBallGroup);
    otherBall.shape = "sphere";
    otherBall.restitution = 0.4;
    const scope = new PhysicsSceneScope();
    scope.registerRoot({ id: "shared:materials", kind: "shared", root });
    for (const entry of [ball, barbell, otherBall]) scope.registerHandle(entry);
    const prepared = prepareScenePhysics(scope, ball);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    expect(prepared.world.contactRestitution(ball, "wood")).toBe(0.62);
    expect(prepared.world.contactRestitution(ball, barbell)).toBe(0);
    expect(prepared.world.contactRestitution(ball, otherBall)).toBe(0);
    expect(prepared.world.contactRestitution(barbell, "wood")).toBe(0);
  });

  it("lets a basketball strike a dynamic prop owned by another unit", async () => {
    await warm();
    const scene = new THREE.Group();
    const first = new THREE.Group();
    const second = new THREE.Group();
    second.position.x = 0.65;
    scene.add(first, second);
    const ballParent = new THREE.Group();
    const barbellParent = new THREE.Group();
    ballParent.position.y = SHELF_SURFACE.top;
    barbellParent.position.y = SHELF_SURFACE.top;
    first.add(ballParent);
    second.add(barbellParent);
    const ballGroup = new THREE.Group();
    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8));
    ballMesh.position.y = 0.1;
    ballGroup.add(ballMesh);
    ballParent.add(ballGroup);
    const barbellGroup = new THREE.Group();
    barbellGroup.add(box([0.25, 0.2, 0.2], [0, 0.1, 0]));
    barbellParent.add(barbellGroup);
    scene.updateWorldMatrix(true, true);
    const ball = handle("cross-unit-ball", ballGroup);
    ball.unitIndex = 0;
    ball.shape = "sphere";
    ball.restitution = 0.62;
    ball.maxThrowSpeed = 8;
    const barbell = handle("cross-unit-barbell", barbellGroup);
    barbell.unitIndex = 1;
    const scope = new PhysicsSceneScope();
    scope.registerRoot({
      id: "unit:ball",
      kind: "unit",
      unitIndex: 0,
      root: first,
    });
    scope.registerRoot({
      id: "unit:barbell",
      kind: "unit",
      unitIndex: 1,
      root: second,
    });
    scope.registerHandle(ball);
    scope.registerHandle(barbell);
    const prepared = prepareScenePhysics(scope, ball);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    prepared.world.grab(ball);
    prepared.world.release(ball, new THREE.Vector3(3, 0, 0));
    for (let frame = 0; frame < 30; frame++)
      prepared.world.tick(1 / 120, frame + 1);
    expect(barbell.phase.current).toBe("sim");
    expect(barbell.body!.velocity.x).toBeGreaterThan(0);
    expect(
      prepared.world.report().contacts.some((contact) => contact.crossUnit),
    ).toBe(true);
  });

  it("lets a top-origin basketball land on the finite lower plank", async () => {
    await warm();
    const unit = new THREE.Group();
    const parent = new THREE.Group();
    parent.position.y = SHELF_SURFACE.top;
    unit.add(parent);
    const ballGroup = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8));
    mesh.position.y = 0.1;
    ballGroup.add(mesh);
    parent.add(ballGroup);
    unit.updateWorldMatrix(true, true);
    const ball = handle("lower-plank-ball", ballGroup);
    ball.shape = "sphere";
    ball.restitution = 0.62;
    const scope = new PhysicsSceneScope();
    scope.registerRoot({
      id: "unit:planks",
      kind: "unit",
      unitIndex: 0,
      root: unit,
    });
    scope.registerHandle(ball);
    const prepared = prepareScenePhysics(scope, ball);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    prepared.world.grab(ball);
    prepared.world.release(ball, new THREE.Vector3(-0.4, 0, 0));
    // The ball has already cleared the top edge; it is still authored by the
    // top shelf but now descends toward the lower plank's outer edge.
    ball.body!.position.set(1.43, -0.2, 0);
    ball.body!.velocity.set(-0.4, -0.2, 0);
    let rebound = false;
    for (let frame = 0; frame < 90; frame++) {
      prepared.world.tick(1 / 120, frame + 1);
      rebound ||= ball.body!.velocity.y > 0.15;
    }
    expect(rebound).toBe(true);
    expect(ball.group.position.y).toBeGreaterThan(SHELF_SURFACE.lower - 0.05);
  });

  it("resets only sleeping bodies that remain outside the expanded frustum", async () => {
    await warm();
    const root = new THREE.Group();
    const prop = new THREE.Group();
    prop.add(box([0.2, 0.2, 0.2], [0, 0.1, 0]));
    root.add(prop);
    root.updateWorldMatrix(true, true);
    const entry = handle("visibility-reset", prop);
    const scope = new PhysicsSceneScope();
    scope.registerRoot({ id: "shared:visibility", kind: "shared", root });
    scope.registerHandle(entry);
    const prepared = prepareScenePhysics(scope, entry);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    entry.phase.current = "sim";
    entry.parked = false;
    entry.body!.position.x = 5;
    entry.body!.allowSleep = true;
    entry.body!.sleep();
    for (let frame = 0; frame < 30; frame++)
      prepared.world.tick(1 / 60, frame + 1, camera);
    expect(entry.phase.current).toBe("sim");
    entry.body!.position.x = 0;
    entry.body!.aabbNeedsUpdate = true;
    prepared.world.tick(1 / 60, 31, camera);
    expect(entry.offscreenFor).toBe(0);

    entry.body!.position.x = 5;
    for (let frame = 31; frame < 95; frame++)
      prepared.world.tick(1 / 60, frame + 1, camera);
    expect(entry.phase.current).toBe("rest");
    expect(entry.group.position.toArray()).toEqual(entry.base.toArray());

    entry.phase.current = "sim";
    entry.parked = false;
    entry.body!.position.set(5, 1, 0);
    entry.body!.velocity.set(0.1, 0, 0);
    entry.body!.allowSleep = false;
    entry.body!.wakeUp();
    for (let frame = 95; frame < 125; frame++)
      prepared.world.tick(1 / 60, frame + 1, camera);
    expect(entry.phase.current).toBe("sim");
  });

  it("parks a supported low-motion prop that Cannon keeps awake off-screen", async () => {
    await warm();
    const { root, prop } = topFixture();
    const entry = handle("tj-medallion-reset", prop);
    const scope = new PhysicsSceneScope();
    scope.registerRoot({
      id: "unit:tj-reset",
      kind: "unit",
      unitIndex: 0,
      root,
    });
    scope.registerHandle(entry);
    const prepared = prepareScenePhysics(scope, entry);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;

    expect(prepared.world.grab(entry)).toBe(true);
    prepared.world.moveHeld(
      entry,
      {
        position: entry.base.clone().add(new THREE.Vector3(0.45, 0.25, 0.1)),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    prepared.world.release(entry, new THREE.Vector3());
    // Reproduces the medallion's contact-jitter failure mode: its motion falls
    // below our settled threshold, but Cannon never advances it to SLEEPY.
    entry.body!.sleepSpeedLimit = 0;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(26.4, 0.2, 5);
    camera.lookAt(26.4, 0, 0);
    camera.updateProjectionMatrix();
    for (let frame = 0; frame < 600; frame++)
      prepared.world.tick(1 / 120, frame + 1, camera);

    expect(entry.phase.current).toBe("rest");
    expect(entry.group.position.toArray()).toEqual(entry.base.toArray());
  });

  it("regrabs a floor-landed prop at its current pose", async () => {
    await warm();
    const { prop } = topFixture();
    const entry = handle("floor-regrab", prop);
    const prepared = worldFor(prop, [entry]);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    entry.phase.current = "sim";
    entry.parked = false;
    entry.body!.position.set(0.8, SHELF_GEOMETRY.groundY + 0.07, 0.2);
    entry.body!.allowSleep = true;
    entry.body!.sleep();
    prepared.world.tick(1 / 60, 1);
    const landed = entry.group.position.clone();
    expect(landed.y).toBeLessThan(entry.base.y - 0.5);
    expect(prepared.world.grab(entry)).toBe(true);
    expect(entry.group.position.distanceTo(landed)).toBeLessThan(1e-8);
    expect(entry.body!.position.y).toBeCloseTo(
      SHELF_GEOMETRY.groundY + 0.07,
      6,
    );
  });

  it("uses broadphase AABB queries for held collision probes", async () => {
    await warm();
    const { prop } = topFixture();
    const entry = handle("query-probe", prop);
    const prepared = worldFor(prop, [entry]);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    prepared.world.grab(entry);
    prepared.world.moveHeld(
      entry,
      {
        position: new THREE.Vector3(0.1, 0, 0),
        quaternion: new THREE.Quaternion(),
      },
      1 / 60,
    );
    expect(prepared.world.report().probeBroadphaseQueries).toBeGreaterThan(0);
  });
});
