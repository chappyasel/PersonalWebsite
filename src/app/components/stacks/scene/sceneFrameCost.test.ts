/* eslint-disable @typescript-eslint/unbound-method --
 * These tests assert method IDENTITY: that instrumenting twice leaves the same
 * function in place, and that teardown puts the original back. Reading
 * `renderer.render` without calling it is the assertion, not a mistake. */
import type { Camera, Scene, WebGLRenderer } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  instrumentRendererFrameCost,
  markSceneFrameInstrumented,
  markSceneFrameStart,
  readSceneFrameCpuMs,
  resetSceneFrameCost,
  takeSceneFrameInstrumented,
} from "./sceneFrameCost";

type RenderCall = { scene: unknown; camera: unknown; self: unknown };

/** Minimal stand-in for the renderer: only `render` is instrumented, and the
 * contract under test is that calling through is untouched. */
function fakeRenderer(calls: RenderCall[]) {
  const renderer = {
    marker: "original",
    render(scene: unknown, camera: unknown) {
      calls.push({ scene, camera, self: this });
      return "render-result" as unknown as void;
    },
  };
  return renderer as unknown as WebGLRenderer & { marker: string };
}

const asScene = (value: string) => value as unknown as Scene;
const asCamera = (value: string) => value as unknown as Camera;

describe("sceneFrameCost", () => {
  beforeEach(() => resetSceneFrameCost());

  it("forwards every argument, the receiver, and the return value", () => {
    const calls: RenderCall[] = [];
    const renderer = fakeRenderer(calls);
    instrumentRendererFrameCost(renderer);

    const returned = renderer.render(asScene("scene"), asCamera("camera"));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.scene).toBe("scene");
    expect(calls[0]!.camera).toBe("camera");
    expect(calls[0]!.self).toBe(renderer);
    expect(returned).toBe("render-result");
  });

  it("measures from the marked frame start to the render return", () => {
    const renderer = fakeRenderer([]);
    instrumentRendererFrameCost(renderer);

    markSceneFrameStart(performance.now());
    renderer.render(asScene("scene"), asCamera("camera"));

    expect(readSceneFrameCpuMs()).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(readSceneFrameCpuMs())).toBe(true);
  });

  it("keeps the last submission of a multi-pass frame, not the first", () => {
    const renderer = fakeRenderer([]);
    instrumentRendererFrameCost(renderer);

    markSceneFrameStart(performance.now());
    renderer.render(asScene("pass-one"), asCamera("camera"));
    const afterFirstPass = readSceneFrameCpuMs();
    // Burn a little wall clock so the second pass cannot tie the first.
    const spinUntil = performance.now() + 2;
    while (performance.now() < spinUntil) {
      /* deliberate busy wait */
    }
    renderer.render(asScene("pass-two"), asCamera("camera"));

    expect(readSceneFrameCpuMs()).toBeGreaterThan(afterFirstPass);
  });

  it("reports nothing for a render with no marked frame start", () => {
    const renderer = fakeRenderer([]);
    instrumentRendererFrameCost(renderer);

    renderer.render(asScene("offscreen-capture"), asCamera("camera"));

    expect(readSceneFrameCpuMs()).toBe(0);
  });

  it("does not stack wrappers when instrumented twice", () => {
    const calls: RenderCall[] = [];
    const renderer = fakeRenderer(calls);
    instrumentRendererFrameCost(renderer);
    const first = renderer.render;
    instrumentRendererFrameCost(renderer);

    expect(renderer.render).toBe(first);
    renderer.render(asScene("scene"), asCamera("camera"));
    expect(calls).toHaveLength(1);
  });

  it("restores the original render on teardown", () => {
    const calls: RenderCall[] = [];
    const renderer = fakeRenderer(calls);
    const original = renderer.render;

    const restore = instrumentRendererFrameCost(renderer);
    expect(renderer.render).not.toBe(original);
    restore();

    expect(renderer.render).toBe(original);
    renderer.render(asScene("scene"), asCamera("camera"));
    expect(calls).toHaveLength(1);
    expect(readSceneFrameCpuMs()).toBe(0);
  });
});

describe("diagnostic frames are not evidence", () => {
  // Perch diagnostics sweep every perch at 4 Hz in development, searching
  // over a hundred candidate landing curves. Eight expensive frames in a
  // 120-frame window is 6.7 percent, which is exactly where p95 lands — so
  // the controller was reading its own instrumentation as scene cost and
  // degrading a build that never pays for it.
  it("reports a marked frame once, then forgets it", () => {
    resetSceneFrameCost();
    expect(takeSceneFrameInstrumented()).toBe(false);
    markSceneFrameInstrumented();
    expect(takeSceneFrameInstrumented()).toBe(true);
    expect(takeSceneFrameInstrumented()).toBe(false);
  });

  it("is cleared with the rest of the frame state", () => {
    markSceneFrameInstrumented();
    resetSceneFrameCost();
    expect(takeSceneFrameInstrumented()).toBe(false);
  });
});

describe("state survives module duplication", () => {
  // The bundler emits this module into more than one chunk, so the canvas and
  // the diagnostics overlay can end up with separate copies. Re-importing
  // after a module reset is the closest a unit test gets to that: a second
  // copy of the module must observe what the first one wrote.
  it("shares the matrix reading between two copies of the module", async () => {
    const first = await import("./sceneFrameCost");
    first.resetSceneFrameCost();
    const scene = {
      updateMatrixWorld() {
        for (let i = 0; i < 5_000; i += 1) Math.sqrt(i);
      },
    } as unknown as Parameters<typeof first.instrumentSceneMatrixCost>[0];
    first.instrumentSceneMatrixCost(scene);
    (scene as { updateMatrixWorld: () => void }).updateMatrixWorld();

    vi.resetModules();
    const second = await import("./sceneFrameCost");
    expect(second).not.toBe(first);
    expect(second.readSceneMatrixMs()).toBe(first.readSceneMatrixMs());
  });

  it("shares the instrumented-frame flag between two copies", async () => {
    // The perch diagnostics mark the frame; the canvas consumes the mark.
    // Those are different chunks, and this crossing is the whole fix.
    const writer = await import("./sceneFrameCost");
    writer.resetSceneFrameCost();
    writer.markSceneFrameInstrumented();

    vi.resetModules();
    const reader = await import("./sceneFrameCost");
    expect(reader.takeSceneFrameInstrumented()).toBe(true);
    expect(writer.takeSceneFrameInstrumented()).toBe(false);
  });
});
