// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { overlay } from "./dust";

describe("overlay", () => {
  let grow: () => void;
  const disconnect = vi.fn();
  let documentHeight = 800;

  beforeEach(() => {
    documentHeight = 800;
    disconnect.mockClear();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as RenderingContext,
    );
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockImplementation(
      () => documentHeight,
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          grow = callback;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("keeps to the document's height as it changes without a window resize", () => {
    const layer = overlay();
    const canvas = document.body.querySelector("canvas")!;
    expect(canvas.style.height).toBe("800px");

    documentHeight = 944;
    grow();

    expect(canvas.style.height).toBe("944px");
    expect(canvas.height).toBe(944);

    layer!.remove();
    expect(disconnect).toHaveBeenCalled();
  });

  it("leaves the canvas's drawing alone when the document's size is the same", () => {
    overlay();
    const canvas = document.body.querySelector("canvas")!;
    const set = vi.spyOn(canvas, "height", "set");

    grow();

    expect(set).not.toHaveBeenCalled();
    expect(canvas.style.height).toBe("800px");
  });
});
