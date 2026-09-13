import type * as WorldBootSession from "../boot/worldBootSession";
import { useStacks } from "../store";
import { advance, createRoot, extend } from "@react-three/fiber";
import { act } from "react";
import * as THREE from "three";
import { afterEach, expect, it, vi } from "vitest";

import Wildlife from "./Wildlife";
import type * as InsectFlightWorld from "./insectFlightWorld";
import { ThreeInsectFlightWorld } from "./insectFlightWorld";
import { type InsectPerch, registerInsectPerch } from "./insectPerches";
import { registerMeadowLamp } from "./meadowLights";

vi.mock("../room/roomEvents", () => ({
  roomWindowEvents: new EventTarget(),
  roomDocumentEvents: new EventTarget(),
}));

vi.mock("../boot/worldBootSession", async (original) => ({
  ...(await original<typeof WorldBootSession>()),
  isWorldRevealed: () => true,
}));

// Keep the actual frame callback, lamp registry, and candidate selection. The
// test records which routes they request without doing geometric searches.
vi.mock("./insectFlightWorld", async (original) => ({
  ...(await original<typeof InsectFlightWorld>()),
  prepareInsectLandingTarget: (
    id: string,
    _species: string,
    target: { id: string },
  ) => {
    target.id = id;
    return true;
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["synchronous", "worker"])(
  "keeps %s moth landing searches at their own lamps when the camera changes sections",
  async (mode) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    extend({
      InstancedMesh: THREE.InstancedMesh,
      Group: THREE.Group,
      Mesh: THREE.Mesh,
    });
    const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
    const root = createRoot(canvas);
    await root.configure({
      frameloop: "never",
      size: { width: 800, height: 600, top: 0, left: 0 },
      gl: {
        render: vi.fn(),
        setPixelRatio: vi.fn(),
        setSize: vi.fn(),
        domElement: canvas,
      } as unknown as THREE.WebGLRenderer,
    });
    const cleanup: Array<() => void> = [];
    const previousUnit = useStacks.getState().activeUnit;
    const contexts = new Map<ThreeInsectFlightWorld, number>();
    // Retain the method so the recording spy can call it with its real receiver.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalContext = ThreeInsectFlightWorld.prototype.setContext;
    vi.spyOn(ThreeInsectFlightWorld.prototype, "setContext").mockImplementation(
      function (this: ThreeInsectFlightWorld, unit, time) {
        contexts.set(this, unit);
        originalContext.call(this, unit, time);
      },
    );
    const searches: Array<{ unit: number; perch: string }> = [];
    const compile = vi
      .spyOn(ThreeInsectFlightWorld.prototype, "compileLandingPlan")
      .mockImplementation(function (this: ThreeInsectFlightWorld, request) {
        searches.push({ unit: contexts.get(this)!, perch: request.perchId });
        return { ok: false, rejectionCode: "approach-blocked" };
      });
    if (mode === "worker") {
      vi.spyOn(
        ThreeInsectFlightWorld.prototype,
        "requestLandingPlan",
      ).mockImplementation(function (this: ThreeInsectFlightWorld, request) {
        searches.push({ unit: contexts.get(this)!, perch: request.perchId });
        return {
          result: { ok: false, rejectionCode: "approach-blocked" },
          cancel: vi.fn(),
          validate: () => null,
        };
      });
    }
    try {
      for (const unit of [0, 3]) {
        const id = `test:moth-lamp:${unit}`;
        cleanup.push(
          registerMeadowLamp(id, {
            x: unit * 4.4,
            y: 1,
            z: 0,
            radius: 1,
            strength: 1,
            litRef: { current: 1 },
            sourceX: unit * 4.4,
            sourceY: 1.5,
            sourceZ: 0,
            coneTargetX: unit * 4.4,
            coneTargetY: 0,
            coneTargetZ: 0,
            mothCount: 1,
            mothNearDistance: 0.18,
            mothFarDistance: 0.74,
            mothMaxRadius: 0.72,
          }),
        );
        cleanup.push(
          registerInsectPerch({
            id,
            lampId: id,
            unitIndex: unit,
            kind: "lamp",
            ownerId: null,
            ownerPrefix: null,
            clearance: 0.12,
            contactDistanceTolerance: 0.05,
            normalTolerance: 0.9,
            tangent: [1, 0, 0],
            normal: [0, 1, 0],
            anchor: new THREE.Object3D(),
            resolvedRoot: null,
            resolvedSurface: null,
            resolvedOwnerId: null,
            localPosition: new THREE.Vector3(),
            localNormal: new THREE.Vector3(),
          } satisfies InsectPerch),
        );
      }
      useStacks.setState({ activeUnit: 3 });
      let store!: ReturnType<typeof root.render>;
      await act(async () => {
        store = root.render(<Wildlife dark />);
      });
      for (const [time, activeUnit] of [
        [0, 3],
        [25, 3],
        [30, 4],
      ] as const) {
        useStacks.setState({ activeUnit });
        advance(time, false, store.getState());
      }
      expect(searches).toEqual(
        expect.arrayContaining([
          { unit: 0, perch: "test:moth-lamp:0" },
          { unit: 3, perch: "test:moth-lamp:3" },
        ]),
      );
      for (const search of searches)
        expect(search.perch).toBe(`test:moth-lamp:${search.unit}`);
      expect(searches.length).toBeGreaterThanOrEqual(4);
      if (mode === "worker") expect(compile).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      cleanup.reverse().forEach((dispose) => dispose());
      useStacks.setState({ activeUnit: previousUnit });
    }
  },
);
