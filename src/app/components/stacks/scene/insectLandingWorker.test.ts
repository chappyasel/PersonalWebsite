import { useStacks } from "../store";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { InsectCollisionIndex } from "./insectCollision";
import {
  ThreeInsectFlightWorld,
  prepareInsectLandingTarget,
  previewInsectPerchRoutes,
  registerInsectCollisionRoot,
} from "./insectFlightWorld";
import * as landingCompiler from "./insectLanding";
import { compileLandingSnapshot } from "./insectLandingSnapshot";
import { insectLandingWorker } from "./insectLandingWorker";
import {
  InsectLandingWorkerClient,
  type LandingWorkerPort,
  type LandingWorkerRequest,
  type LandingWorkerResponse,
} from "./insectLandingWorkerClient";
import {
  type InsectPerch,
  claimInsectPerch,
  insectPerchOccupant,
  registerInsectPerch,
  releaseInsectPerch,
} from "./insectPerches";
import {
  BUTTERFLY_PILOT_PROFILE,
  type InsectLandingTarget,
  MOTH_PILOT_PROFILE,
  advanceInsectPilot,
  commandInsectPilot,
  createInsectPilot,
} from "./insectPilot";
import { registerSceneInteraction } from "./interactionRegistry";
import { registerMeadowLamp } from "./meadowLights";
import { scenePerformanceController } from "./scenePerformance";

/** Delay the transport, then run the real numerical compiler on its cloned
 * payload. Browser verification separately exercises the worker entry/bundle. */
class DelayedWorker implements LandingWorkerPort {
  static instances: DelayedWorker[] = [];
  onmessage: LandingWorkerPort["onmessage"] = null;
  onerror: LandingWorkerPort["onerror"] = null;
  onmessageerror: LandingWorkerPort["onmessageerror"] = null;
  messages: LandingWorkerRequest[] = [];
  index?: InsectCollisionIndex;
  terminate = vi.fn();
  constructor() {
    DelayedWorker.instances.push(this);
  }
  postMessage(message: LandingWorkerRequest) {
    this.messages.push(structuredClone(message));
  }
  finish() {
    const message = this.messages.shift()!;
    this.index = message.index ?? this.index;
    const { result } = compileLandingSnapshot({
      ...message.snapshot,
      index: this.index!,
    });
    this.onmessage?.({
      data: { generation: message.generation, result, workerMs: 12 },
    } as MessageEvent<LandingWorkerResponse>);
    return result;
  }
}
const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
  scenePerformanceController.update({ insectLandingWorker: false });
  useStacks.setState({ dragging: null });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  DelayedWorker.instances = [];
});

function fixture(species: "moth" | "butterfly", enabled = true) {
  vi.stubGlobal("Worker", DelayedWorker);
  scenePerformanceController.update({ insectLandingWorker: enabled });
  const root = new THREE.Group();
  const owner = new THREE.Group();
  new THREE.Scene().add(root);
  root.add(owner);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.1, 0.4),
    new THREE.MeshBasicMaterial(),
  );
  mesh.position.y = 0.5;
  owner.add(mesh);
  const anchor = new THREE.Object3D();
  anchor.position.set(0, 0.55, 0);
  owner.add(anchor);
  const perch: InsectPerch = {
    id: "worker:perch",
    unitIndex: 0,
    kind: "lamp",
    lampId: "worker:lamp",
    ownerId: "worker:owner",
    ownerPrefix: null,
    clearance: 0.12,
    tangent: [1, 0, 0],
    normal: [0, 1, 0],
    contactDistanceTolerance: 0.05,
    normalTolerance: 0.9,
    anchor,
    resolvedRoot: null,
    resolvedSurface: null,
    resolvedOwnerId: null,
    localPosition: new THREE.Vector3(),
    localNormal: new THREE.Vector3(),
  };
  const litRef = { current: 1 };
  cleanup.push(
    registerInsectCollisionRoot(0, root),
    registerSceneInteraction({
      id: "worker:owner",
      root: owner,
      activeUnits: [0],
    }),
    registerInsectPerch(perch),
    registerMeadowLamp("worker:lamp", {
      x: 0,
      y: 0.55,
      z: 0,
      sourceX: 0,
      sourceY: 1,
      sourceZ: 0,
      coneTargetX: 0,
      coneTargetY: 0,
      coneTargetZ: 0,
      mothCount: 1,
      mothNearDistance: 0.18,
      mothFarDistance: 0.74,
      mothMaxRadius: 0.72,
      radius: 1,
      strength: 1,
      litRef,
    }),
  );
  const target: InsectLandingTarget = {
    id: "",
    point: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    tangent: { x: 1, y: 0, z: 0 },
    clearance: 0,
  };
  expect(prepareInsectLandingTarget(perch.id, species, target)).toBe(true);
  const initial = {
    position: { x: 0, y: 0.95, z: 0.6 },
    velocity: { x: 0.1, y: 0, z: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
  };
  const world = new ThreeInsectFlightWorld(
    `${species}:worker`,
    species,
    (_id, time, out) => {
      Object.assign(out.position, initial.position, { x: time * 0.1 });
      Object.assign(out.velocity, initial.velocity);
    },
  );
  world.setContext(0, 0);
  const pilot = createInsectPilot({
    occupantId: world.occupantId,
    flightId: 0,
    seed: 1,
    initialTime: 0,
    initial,
    profile: species === "moth" ? MOTH_PILOT_PROFILE : BUTTERFLY_PILOT_PROFILE,
  });
  const sync = vi.spyOn(world, "compileLandingPlan");
  cleanup.push(() => {
    world.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
  const land = () => commandInsectPilot(pilot, { type: "land", target }, world);
  return { pilot, world, land, target, owner, root, litRef, sync };
}

describe.each(["moth", "butterfly"] as const)("%s worker caller", (species) => {
  it("does not run synchronous synthetic route previews in worker mode", () => {
    const { target } = fixture(species);
    const compile = vi.spyOn(landingCompiler, "compileInsectLandingPlan");
    expect(previewInsectPerchRoutes(target.id, species, 0)).toEqual([]);
    expect(compile).not.toHaveBeenCalled();
  });

  it("keeps flying while pending and adopts without a position or velocity jump", () => {
    const { pilot, world, land, target, sync } = fixture(species);
    expect(land()).toBe(true);
    expect(pilot.phase).toBe("roam");
    expect(insectPerchOccupant(target.id)).toBeNull();
    const before = { ...pilot.position };
    for (let i = 0; i < 10; i++) advanceInsectPilot(pilot, 1 / 60, world);
    expect(pilot.position).not.toEqual(before);
    expect(land()).toBe(false);
    const position = { ...pilot.position },
      velocity = { ...pilot.velocity };
    expect(DelayedWorker.instances[0]!.finish().ok).toBe(true);
    expect(pilot.phase).toBe("approach");
    advanceInsectPilot(pilot, 0, world);
    expect(pilot.phase).toBe("approach");
    expect(pilot.position).toEqual(position);
    expect(pilot.velocity).toEqual(velocity);
    expect(insectPerchOccupant(target.id)).toBe(pilot.occupantId);
    expect(pilot.landingPlan?.approach[0]).toEqual(position);
    expect(sync).not.toHaveBeenCalled();
  });

  it.each([
    "target",
    "collision",
    "position",
    "unit",
    "theme",
    "grab",
    "reservation",
    "cancel",
    "dispose",
    "toggle",
    "light",
  ])("rejects %s changes while pending", (change) => {
    const { pilot, world, land, target, owner, root, litRef, sync } =
      fixture(species);
    expect(land()).toBe(true);
    const worker = DelayedWorker.instances[0]!;
    if (change === "target") owner.rotation.y += 0.1;
    if (change === "collision") {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.1),
        new THREE.MeshBasicMaterial(),
      );
      box.position.x = 3;
      root.add(box);
      cleanup.push(() => {
        box.geometry.dispose();
        box.material.dispose();
      });
    }
    if (change === "position") pilot.position.x += 1;
    if (change === "unit") world.setContext(1, 0.1);
    if (change === "theme") world.setContext(0, 0.1, false);
    if (change === "grab") {
      useStacks.setState({ dragging: "worker:owner" });
      useStacks.setState({ dragging: null });
    }
    if (change === "reservation") {
      expect(claimInsectPerch(target.id, "other")).toBe(true);
      releaseInsectPerch(target.id, "other");
    }
    if (change === "cancel")
      commandInsectPilot(pilot, { type: "cancel" }, world);
    if (change === "dispose") world.dispose();
    if (change === "toggle")
      scenePerformanceController.update({ insectLandingWorker: false });
    if (change === "light") litRef.current = 0;
    worker.finish();
    advanceInsectPilot(pilot, 0, world);
    if (change === "light" && species === "butterfly")
      expect(pilot.phase).toBe("approach");
    else {
      expect(pilot.phase).not.toBe("approach");
      expect(insectPerchOccupant(target.id)).toBeNull();
    }
    expect(sync).not.toHaveBeenCalled();
  });

  it.each([0.001, 0.01])(
    "certifies enclosed ambient motion but rejects movement beyond the snapshot: %s m",
    (delta) => {
      const { pilot, world, land, root, target } = fixture(species);
      const neighbour = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.1),
        new THREE.MeshBasicMaterial(),
      );
      neighbour.position.set(2, 0.5, 0);
      root.add(neighbour);
      cleanup.push(() => {
        neighbour.geometry.dispose();
        neighbour.material.dispose();
      });
      expect(land()).toBe(true);
      neighbour.position.x += delta;
      expect(DelayedWorker.instances[0]!.finish().ok).toBe(true);
      advanceInsectPilot(pilot, 0, world);
      expect(pilot.phase === "approach").toBe(delta < 0.002);
      expect(insectPerchOccupant(target.id)).toBe(
        delta < 0.002 ? pilot.occupantId : null,
      );
    },
  );

  it("keeps flying after worker failure without synchronous retries", () => {
    const { pilot, world, land, sync } = fixture(species);
    expect(land()).toBe(true);
    DelayedWorker.instances[0]!.onerror?.({} as ErrorEvent);
    advanceInsectPilot(pilot, 1 / 60, world);
    for (let i = 1; i < 20; i++) {
      world.setContext(0, i * 3);
      expect(land()).toBe(false);
      advanceInsectPilot(pilot, 1 / 60, world);
    }
    expect(pilot.phase).toBe("roam");
    expect(sync).not.toHaveBeenCalled();
    expect(DelayedWorker.instances).toHaveLength(1);
  });

  it("uses the synchronous baseline without worker snapshots when disabled", () => {
    const { land, sync } = fixture(species, false);
    const request = vi.spyOn(insectLandingWorker, "request");
    expect(land()).toBe(true);
    expect(sync).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
    expect(DelayedWorker.instances).toHaveLength(0);
  });
});

it("bounds the queue, reuses a collision snapshot and releases the last worker", () => {
  const worker = new DelayedWorker();
  const client = new InsectLandingWorkerClient(() => worker);
  client.setEnabled(true);
  const { land } = fixture("butterfly");
  land();
  const original = DelayedWorker.instances.at(-1)!.messages[0]!;
  const snapshot = { ...original.snapshot, index: original.index! };
  const owners = Array.from({ length: 40 }, () => ({}));
  const tickets = owners.map((owner) => client.request(owner, snapshot));
  expect(worker.messages).toHaveLength(1);
  expect(tickets.filter((t) => t.result === null)).toHaveLength(32);
  worker.finish();
  expect(worker.messages[0]!.index).toBeUndefined();
  for (const owner of owners) client.release(owner);
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it("fails closed on worker startup exceptions and timeouts until toggled", () => {
  vi.useFakeTimers();
  const worker = new DelayedWorker();
  const create = vi.fn(() => worker);
  const client = new InsectLandingWorkerClient(create);
  client.setEnabled(true);
  const { land } = fixture("butterfly");
  land();
  const original = DelayedWorker.instances.at(-1)!.messages[0]!;
  const snapshot = { ...original.snapshot, index: original.index! };
  const ticket = client.request({}, snapshot);
  vi.advanceTimersByTime(5001);
  expect(ticket.result?.ok).toBe(false);
  expect(client.canRequest()).toBe(false);
  client.setEnabled(false);
  client.setEnabled(true);
  create.mockImplementationOnce(() => {
    throw new Error("startup");
  });
  expect(client.request({}, snapshot).result?.ok).toBe(false);
  expect(client.canRequest()).toBe(false);
  client.setEnabled(false);
});
