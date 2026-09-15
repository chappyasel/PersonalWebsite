// @vitest-environment jsdom
// _roots is a private R3F 9.7 export used to inspect the real renderer store.
// Revisit this test adapter when upgrading R3F; it is not a production API.
import { _roots, createRoot } from "@react-three/fiber";
import type { WebGLRenderer } from "three";
import { expect, it, vi } from "vitest";

import { preserveCanvasSize } from "./sceneCanvasSize";

it("does not publish phantom resizes when Canvas reconfigures with full measured bounds", async () => {
  const canvas = {} as HTMLCanvasElement;
  const root = createRoot(canvas);
  const bounds = {
    width: 1440,
    height: 900,
    top: 0,
    left: 0,
    x: 0,
    y: 0,
    right: 1440,
    bottom: 900,
  };
  const resize = vi.fn();
  const pixelRatio = vi.fn();
  const options = {
    frameloop: "never" as const,
    size: bounds,
    gl: {
      render: vi.fn(),
      setPixelRatio: pixelRatio,
      setSize: resize,
      domElement: canvas,
    } as unknown as WebGLRenderer,
  };
  try {
    await root.configure(options);
    const store = _roots.get(canvas)!.store;
    preserveCanvasSize(store.getState());
    const initial = store.getState();
    let publications = 0;
    const stop = store.subscribe((next, previous) => {
      if (next.size !== previous.size) publications++;
    });
    for (let i = 0; i < 8; i++)
      await root.configure({ ...options, size: { ...bounds } });
    expect(publications).toBe(0);
    expect(store.getState().size).toBe(initial.size);
    expect(store.getState().viewport).toBe(initial.viewport);

    // Resize still reaches the camera, renderer, and all size subscribers.
    resize.mockClear();
    const portraitBounds = {
      ...bounds,
      width: 900,
      height: 1440,
      right: 900,
      bottom: 1440,
    };
    await root.configure({ ...options, size: portraitBounds });
    expect(publications).toBe(1);
    const camera = store.getState().camera;
    expect("aspect" in camera && camera.aspect).toBeCloseTo(900 / 1440);
    expect(resize).toHaveBeenCalledTimes(1);

    // Canvas placement matters for event coordinates even at the same size.
    store.getState().setSize(900, 1440, 10, 20);
    expect(publications).toBe(2);
    expect(store.getState().size).toEqual({
      width: 900,
      height: 1440,
      top: 10,
      left: 20,
    });
    const current = store.getState().setSize;
    preserveCanvasSize(store.getState());
    expect(store.getState().setSize).toBe(current);
    store.getState().setSize(900, 1440);
    expect(publications).toBe(3);

    // The quality ladder can change DPR without changing any CSS bounds.
    const unchangedSize = store.getState().size;
    resize.mockClear();
    pixelRatio.mockClear();
    await root.configure({ ...options, size: portraitBounds, dpr: 1.5 });
    expect(publications).toBe(3);
    expect(store.getState().size).toBe(unchangedSize);
    expect(store.getState().viewport.dpr).toBe(1.5);
    expect(pixelRatio).toHaveBeenCalledExactlyOnceWith(1.5);
    expect(resize).toHaveBeenCalledTimes(1);
    stop();
  } finally {
    _roots.delete(canvas);
  }
});
