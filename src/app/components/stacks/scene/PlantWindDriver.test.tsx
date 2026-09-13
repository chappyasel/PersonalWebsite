// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { MeshoptDecoder } from "meshoptimizer";
import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, expect, it, vi } from "vitest";

import { PlantWind } from "./PlantWindDriver";
import { plantWindDiagnosticsController } from "./plantWindDiagnostics";

const runtime = vi.hoisted(() => ({
  view: { epoch: 1, status: "dissolving" },
  listeners: new Set<() => void>(),
  frames: new Set<
    (state: { clock: { elapsedTime: number } }, delta: number) => void
  >(),
  state: { activeUnit: 6, dragging: null as string | null },
  reduced: false,
  mediaListeners: new Set<() => void>(),
}));
vi.mock("../boot/worldBootSession", () => ({
  isWorldRevealed: () => runtime.view.status === "live",
  worldBoot: {
    getView: () => runtime.view,
    subscribe: (f: () => void) => {
      runtime.listeners.add(f);
      return () => runtime.listeners.delete(f);
    },
  },
}));
vi.mock("../store", () => ({ useStacks: { getState: () => runtime.state } }));
vi.mock("./interactionRegistry", () => ({
  getSceneInteraction: () => undefined,
}));
vi.mock("./unitActivity", async () => {
  const { useEffect } = await import("react");
  return {
    useUnitFrame: (
      f: (state: { clock: { elapsedTime: number } }, delta: number) => void,
    ) => {
      useEffect(() => {
        runtime.frames.add(f);
        return () => {
          runtime.frames.delete(f);
        };
      }, [f]);
    },
  };
});

async function model() {
  const bytes = fs.readFileSync("public/models/pothos.glb");
  const root = (
    await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(new Uint8Array(bytes).buffer, "")
  ).scene;
  let mesh!: THREE.Mesh;
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) mesh = node as THREE.Mesh;
  });
  return { root, mesh };
}
const frame = (count = 1, delta = 1 / 60) =>
  act(() => {
    for (let i = 0; i < count; i++)
      for (const callback of runtime.frames)
        callback({ clock: { elapsedTime: 10 + i * delta } }, delta);
  });
const options = {
  kind: "pothos",
  unitIndex: 6,
  hoverKey: "grab:plant:talks-pothos",
} as const;
const positions = (mesh: THREE.Mesh) => {
  const p = mesh.geometry.getAttribute("position");
  return Array.from({ length: p.count }, (_, i) =>
    [p.getX(i), p.getY(i), p.getZ(i)].map(Math.fround),
  );
};
afterEach(() => {
  cleanup();
  plantWindDiagnosticsController.setEnabled(false);
  vi.unstubAllGlobals();
});

it("mounts no disabled frame work; gates dissolve, grab, offscreen, reduced motion, retry and theme replacement", async () => {
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return runtime.reduced;
    },
    addEventListener: (_: string, f: () => void) =>
      runtime.mediaListeners.add(f),
    removeEventListener: (_: string, f: () => void) =>
      runtime.mediaListeners.delete(f),
  }));
  plantWindDiagnosticsController.setEnabled(false);
  const a = await model();
  const source = a.mesh.geometry;
  const rest = positions(a.mesh);
  const rendered = render(<PlantWind object={a.root} options={options} />);
  expect(runtime.frames.size).toBe(0);
  expect(a.mesh.geometry).toBe(source);
  act(() => plantWindDiagnosticsController.setEnabled(true));
  expect(runtime.frames.size).toBe(1);
  frame(30);
  expect(positions(a.mesh)).toEqual(rest);
  act(() => {
    runtime.view.status = "live";
    for (const f of runtime.listeners) f();
  });
  frame(180);
  expect(positions(a.mesh)).not.toEqual(rest);
  const moving = positions(a.mesh);
  runtime.state.dragging = options.hoverKey;
  frame(20, 10);
  expect(positions(a.mesh)).toEqual(moving);
  runtime.state.dragging = null;
  runtime.state.activeUnit = 0;
  frame(20);
  expect(positions(a.mesh)).toEqual(moving);
  runtime.state.activeUnit = 6;
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  frame(20);
  expect(positions(a.mesh)).toEqual(moving);
  vi.restoreAllMocks();
  const b = await model();
  rendered.rerender(<PlantWind object={b.root} options={options} />);
  expect(a.mesh.geometry).toBe(source);
  expect(positions(b.mesh)).toEqual(moving);
  act(() => {
    runtime.reduced = true;
    for (const f of runtime.mediaListeners) f();
  });
  expect(positions(b.mesh)).toEqual(rest);
  frame(20);
  expect(positions(b.mesh)).toEqual(rest);
  act(() => {
    runtime.reduced = false;
    for (const f of runtime.mediaListeners) f();
  });
  frame(180);
  expect(positions(b.mesh)).not.toEqual(rest);
  act(() => {
    runtime.view.epoch++;
    runtime.view.status = "dissolving";
    for (const f of runtime.listeners) f();
  });
  expect(positions(b.mesh)).toEqual(rest);
  act(() => plantWindDiagnosticsController.setEnabled(false));
  expect(runtime.frames.size).toBe(0);
  expect(runtime.listeners.size).toBe(0);
  expect(runtime.mediaListeners.size).toBe(0);
});

it("makes maximum meadow speed produce clearly faster leaf movement", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const { meadowDiagnosticsController } = await import("./meadowDiagnostics");
  const measure = async (speed: number, wind: number) => {
    runtime.view = { epoch: 1, status: "live" };
    runtime.state = { activeUnit: 6, dragging: null };
    meadowDiagnosticsController.seed({ speed, wind });
    plantWindDiagnosticsController.setEnabled(true);
    const { root, mesh } = await model();
    const rendered = render(<PlantWind object={root} options={options} />);
    let travelled = 0;
    let previous: ReturnType<typeof positions> | undefined;
    for (let i = 0; i < 720; i++) {
      act(() => {
        for (const callback of runtime.frames)
          callback({ clock: { elapsedTime: i / 60 } }, 1 / 60);
      });
      const current = positions(mesh);
      if (previous && i > 240)
        travelled += Math.max(
          ...current.map((p, j) =>
            Math.hypot(...p.map((v, c) => v - previous![j]![c]!)),
          ),
        );
      previous = current;
    }
    rendered.unmount();
    return travelled;
  };
  const normal = await measure(1.608, 0.21);
  const fast = await measure(1.608 * 4, 0.21);
  const strong = await measure(1.608 * 4, 0.21 * 10);
  expect(fast / normal).toBeGreaterThan(2);
  expect(strong / fast).toBeGreaterThan(2);
});
