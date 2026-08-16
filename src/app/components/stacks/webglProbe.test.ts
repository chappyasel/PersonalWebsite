import { describe, expect, it } from "vitest";

import { isWebGLContextUsable } from "./webglProbe";

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
