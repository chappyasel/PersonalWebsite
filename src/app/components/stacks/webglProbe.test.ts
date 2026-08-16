import { describe, expect, it } from "vitest";

import { canUseStacksWorld, isWebGLContextUsable } from "./webglProbe";

describe("canUseStacksWorld", () => {
  it("requires WebGL and honors motion and data preferences", () => {
    expect(
      canUseStacksWorld({
        webglAvailable: true,
        prefersReducedMotion: false,
        saveData: false,
      }),
    ).toBe(true);
    expect(
      canUseStacksWorld({
        webglAvailable: false,
        prefersReducedMotion: false,
        saveData: false,
      }),
    ).toBe(false);
    expect(
      canUseStacksWorld({
        webglAvailable: true,
        prefersReducedMotion: true,
        saveData: false,
      }),
    ).toBe(false);
    expect(
      canUseStacksWorld({
        webglAvailable: true,
        prefersReducedMotion: false,
        saveData: true,
      }),
    ).toBe(false);
  });
});

describe("isWebGLContextUsable", () => {
  it("rejects a lost context before postprocessing reads its alpha channel", () => {
    expect(
      isWebGLContextUsable({
        getContextAttributes: () => null,
        isContextLost: () => true,
      }),
    ).toBe(false);
  });

  it("rejects context attribute access errors", () => {
    expect(
      isWebGLContextUsable({
        getContextAttributes: () => {
          throw new Error("GPU unavailable");
        },
        isContextLost: () => false,
      }),
    ).toBe(false);
  });
});
