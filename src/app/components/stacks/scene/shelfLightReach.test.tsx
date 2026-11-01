import { createRoot, extend } from "@react-three/fiber";
import { act } from "react";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PALETTES } from "../theme";
import { ShelfLight, woodRoughnessFactor } from "./primitives";
import { SHELF_UNDERSIDE } from "./shelfGeometry";

afterEach(() => vi.unstubAllGlobals());

describe("wood roughness", () => {
  it.each([
    ["night", PALETTES.dark.wood],
    ["day", PALETTES.light.wood],
  ])("does not turn %s wood into a mirror", (_, hex) => {
    const meanGreen = new THREE.Color(hex).g;
    expect(woodRoughnessFactor(hex, 0.72) * meanGreen).toBeCloseTo(0.72);
  });
});

describe("the shelf's real light", () => {
  it("cannot reach the plank it hangs from", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    extend(THREE as unknown as Parameters<typeof extend>[0]);
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
    let store!: ReturnType<typeof root.render>;
    await act(async () => {
      store = root.render(
        <ShelfLight
          y={SHELF_UNDERSIDE.top}
          width={2}
          palette={PALETTES.dark}
          on={false}
          cast
        />,
      );
      await Promise.resolve();
    });
    const { scene } = store.getState();
    scene.updateMatrixWorld(true);
    const light = scene.getObjectByProperty(
      "type",
      "SpotLight",
    ) as THREE.SpotLight;
    const at = light.getWorldPosition(new THREE.Vector3());
    const aim = light.target
      .getWorldPosition(new THREE.Vector3())
      .sub(at)
      .normalize();

    expect(at.y).toBeLessThan(SHELF_UNDERSIDE.top);
    expect(aim.y).toBeCloseTo(-1);
    expect(light.angle).toBeLessThanOrEqual(Math.PI / 2);
    // Any point on the plank is above the light, so it is more than 90 degrees
    // off the aim, and the cone's edge stops at 90.
    const plank = new THREE.Vector3(0.05, SHELF_UNDERSIDE.top, at.z)
      .sub(at)
      .normalize();
    expect(plank.dot(aim)).toBeLessThan(Math.cos(light.angle));
  });
});
