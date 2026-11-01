import type * as WorldBootSession from "../boot/worldBootSession";
import { advance, createRoot, extend } from "@react-three/fiber";
import { act, createRef } from "react";
import * as THREE from "three";
import { afterEach, expect, it, vi } from "vitest";

import { CoordinationDustCore } from "./CoordinationDustCore";
import {
  CROSSING_TIMELINE as T,
  coordinationCrossing,
  crossingOrbLight,
} from "./coordinationCrossing";
import { createCoordinationBurst } from "./coordinationNetwork";

vi.mock("../boot/worldBootSession", async (original) => ({
  ...(await original<typeof WorldBootSession>()),
  isWorldRevealed: () => true,
}));

afterEach(() => {
  coordinationCrossing.finish();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mountDust({ still }: { still: boolean }) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", vi.fn());
  extend({
    BufferGeometry: THREE.BufferGeometry,
    Group: THREE.Group,
    Mesh: THREE.Mesh,
    PlaneGeometry: THREE.PlaneGeometry,
    PointLight: THREE.PointLight,
    Points: THREE.Points,
    ShaderMaterial: THREE.ShaderMaterial,
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
      getPixelRatio: () => 2,
      domElement: canvas,
    } as unknown as THREE.WebGLRenderer,
  });
  let store!: ReturnType<typeof root.render>;
  await act(async () => {
    store = root.render(
      <CoordinationDustCore
        unitIndex={0}
        visible
        dark
        still={still}
        burstSignal={{ current: createCoordinationBurst() }}
        chargeSignal={{ current: null }}
        horizonMaterial={createRef<THREE.ShaderMaterial>()}
        insideHorizon={{}}
      />,
    );
    await Promise.resolve();
  });
  const blinker = store
    .getState()
    .scene.getObjectByName("coordination-blinker") as THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.ShaderMaterial
  >;
  const light = store
    .getState()
    .scene.getObjectByProperty("type", "PointLight") as THREE.PointLight;
  const dust = store
    .getState()
    .scene.getObjectByName("coordination-dust") as THREE.Points<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  >;
  // In the browser, r3f copies each uniform onto the material rather than keep
  // the object it was handed. Vitest loads a second three, so r3f's instanceof
  // check misses and that branch never runs here. Do its copy by hand, or a
  // write to the handed object passes this test and freezes the real page.
  for (const material of [blinker.material, dust.material])
    material.uniforms = Object.fromEntries(
      Object.entries(material.uniforms).map(([name, uniform]) => [
        name,
        { ...uniform },
      ]),
    );
  let clock = 0;
  const frameAt = (phase: number) => {
    clock += T.blinkPeriod;
    const now = clock + phase * T.blinkPeriod;
    vi.spyOn(performance, "now").mockReturnValue(now);
    act(() => advance(now));
    return blinker.material.uniforms;
  };
  return { blinker, dust, light, frameAt };
}

it("blinks the block on the page's clock, through the live material", async () => {
  const { frameAt } = await mountDust({ still: false });
  expect(frameAt(0.2).uBlock!.value).toBe(1);
  expect(frameAt(0.7).uBlock!.value).toBe(0);
  expect(frameAt(0.2).uBlock!.value).toBe(1);
});

it("lets the glow linger through the block's off beat", async () => {
  const { frameAt } = await mountDust({ still: false });
  const lit = frameAt(0.2);
  const litBloom = lit.uBloom!.value as number;
  const off = frameAt(0.7);
  expect(off.uBlock!.value).toBe(0);
  expect(off.uBloom!.value).toBeGreaterThan(0);
  expect(off.uBloom!.value).toBeLessThan(litBloom);
});

it("keeps the dust's twinkle clock and pixel ratio moving", async () => {
  const { dust, frameAt } = await mountDust({ still: false });
  frameAt(0.2);
  const first = dust.material.uniforms.uTime!.value as number;
  frameAt(0.2);
  expect(dust.material.uniforms.uTime!.value).toBeGreaterThan(first);
  expect(dust.material.uniforms.uPixelRatio!.value).toBe(2);
});

it("is the glow's own size in the room, not its size in ems", async () => {
  const { blinker } = await mountDust({ still: false });
  blinker.geometry.computeBoundingSphere();
  expect(blinker.geometry.boundingSphere!.radius).toBeLessThan(0.7);
});

it("gives the blinker and dust up to the crossing, and takes them back", async () => {
  const { dust, frameAt, light } = await mountDust({ still: false });
  expect(frameAt(0.2).uBlock!.value).toBe(1);
  coordinationCrossing.begin({
    startedAt: performance.now(),
    origin: { x: 0, y: 0 },
    theme: "dark",
  });
  const held = frameAt(0.2);
  expect(held.uBlock!.value).toBe(0);
  expect(held.uBloom!.value).toBe(0);
  expect(dust.material.uniforms.uBoost!.value).toBe(0);
  expect(light.intensity).toBeGreaterThan(0);

  coordinationCrossing.finish();
  expect(frameAt(0.2).uBlock!.value).toBe(1);
  expect(dust.material.uniforms.uBoost!.value).toBeGreaterThan(0);
});

it("lets the orb's light go out behind the blinker", async () => {
  const { frameAt, light } = await mountDust({ still: false });
  frameAt(0.2);
  coordinationCrossing.begin({
    startedAt: performance.now() - T.orbLightFadeEnd - T.blinkPeriod * 2,
    origin: { x: 0, y: 0 },
    theme: "dark",
  });
  expect(crossingOrbLight(T.orbLightFadeEnd)).toBe(0);
  frameAt(0.2);
  expect(light.intensity).toBe(0);
});

it("rests solid under reduced motion", async () => {
  const { frameAt } = await mountDust({ still: true });
  expect(frameAt(0.7).uBlock!.value).toBe(1);
});
