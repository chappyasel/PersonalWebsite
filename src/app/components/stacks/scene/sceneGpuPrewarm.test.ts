import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  prewarmSceneGpuPrograms,
  prewarmSceneGpuResources,
  shouldWarmSceneGpuResources,
} from "./sceneGpuPrewarm";

describe("scene GPU prewarm", () => {
  it("repeats the full upload only when the residency mode changes", () => {
    expect(shouldWarmSceneGpuResources(null, "all-units")).toBe(true);
    expect(shouldWarmSceneGpuResources("all-units", "all-units")).toBe(false);
    expect(shouldWarmSceneGpuResources("near-units", "all-units")).toBe(true);
  });

  it("initializes hidden unit resources offscreen and restores renderer state", () => {
    const scene = new THREE.Scene();
    const unit = new THREE.Group();
    unit.visible = false;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    unit.add(mesh);
    scene.add(unit);

    const calls: string[] = [];
    let targetBound = false;
    const renderer = {
      shadowMap: { autoUpdate: true },
      getRenderTarget: vi.fn(() => null),
      getActiveCubeFace: vi.fn(() => 0),
      getActiveMipmapLevel: vi.fn(() => 0),
      setRenderTarget: vi.fn(
        (target: Parameters<THREE.WebGLRenderer["setRenderTarget"]>[0]) => {
          targetBound = Boolean(target);
          calls.push(target ? "target" : "restore");
        },
      ),
      compile: vi.fn(() => {
        expect(unit.visible).toBe(true);
        expect(mesh.frustumCulled).toBe(false);
        // Screen and render-target output color spaces use distinct Three.js
        // program variants. Prepare the screen variant before binding the
        // tiny upload target.
        expect(targetBound).toBe(false);
        calls.push("compile");
      }),
      render: vi.fn(() => {
        expect(unit.visible).toBe(true);
        expect(mesh.frustumCulled).toBe(false);
        expect(targetBound).toBe(true);
        calls.push("render");
      }),
      info: { reset: vi.fn(() => calls.push("reset")) },
    };

    prewarmSceneGpuResources({
      renderer,
      scene,
      camera: new THREE.PerspectiveCamera(),
      withUnitRootsVisible: (run) => {
        const previous = unit.visible;
        unit.visible = true;
        try {
          run();
        } finally {
          unit.visible = previous;
        }
      },
    });

    expect(calls).toEqual(["compile", "target", "render", "restore", "reset"]);
    expect(unit.visible).toBe(false);
    expect(mesh.frustumCulled).toBe(true);
    expect(renderer.shadowMap.autoUpdate).toBe(true);
  });

  it("restores scene and renderer state when the offscreen draw throws", () => {
    const scene = new THREE.Scene();
    const unit = new THREE.Group();
    unit.visible = false;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    unit.add(mesh);
    scene.add(unit);
    const dispose = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    const renderer = {
      shadowMap: { autoUpdate: true },
      getRenderTarget: vi.fn(() => null),
      getActiveCubeFace: vi.fn(() => 0),
      getActiveMipmapLevel: vi.fn(() => 0),
      setRenderTarget: vi.fn(),
      compile: vi.fn(),
      render: vi.fn(() => {
        throw new Error("driver rejected warm-up");
      }),
      info: { reset: vi.fn() },
    };

    expect(() =>
      prewarmSceneGpuResources({
        renderer,
        scene,
        camera: new THREE.PerspectiveCamera(),
        withUnitRootsVisible: (run) => {
          const previous = unit.visible;
          unit.visible = true;
          try {
            run();
          } finally {
            unit.visible = previous;
          }
        },
      }),
    ).toThrow("driver rejected warm-up");

    expect(unit.visible).toBe(false);
    expect(mesh.frustumCulled).toBe(true);
    expect(renderer.shadowMap.autoUpdate).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
    expect(renderer.info.reset).toHaveBeenCalledOnce();
    dispose.mockRestore();
  });

  it("keeps program-only refreshes off the upload render target", () => {
    const scene = new THREE.Scene();
    const unit = new THREE.Group();
    unit.visible = false;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    unit.add(mesh);
    scene.add(unit);
    const renderer = { compile: vi.fn() };

    prewarmSceneGpuPrograms({
      renderer,
      scene,
      camera: new THREE.PerspectiveCamera(),
      withUnitRootsVisible: (run) => {
        expect(unit.visible).toBe(false);
        unit.visible = true;
        try {
          run();
        } finally {
          unit.visible = false;
        }
      },
    });

    expect(renderer.compile).toHaveBeenCalledOnce();
    expect(mesh.frustumCulled).toBe(true);
    expect(unit.visible).toBe(false);
  });
});
