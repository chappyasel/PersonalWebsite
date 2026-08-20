import { describe, expect, it, vi } from "vitest";

import {
  OPAQUE_SCENE_CONTEXT_ATTRIBUTES,
  createOpaqueSceneContext,
} from "./opaqueSceneContext";

const canvasReturning = (value: unknown) => ({ getContext: vi.fn(() => value) });

describe("opaque scene context", () => {
  // The whole point. With alpha the compositor blends the scene over the
  // page's near-white paper every frame, and anything that goes wrong with
  // the alpha channel lets that paper through.
  it("asks for a context with no alpha channel", () => {
    expect(OPAQUE_SCENE_CONTEXT_ATTRIBUTES.alpha).toBe(false);
  });

  // The quality ladder unmounts the composer, and with it SMAA. Hardware
  // antialiasing is the floor underneath that, so it must survive taking
  // context creation into our own hands.
  it("keeps hardware antialiasing, the ladder's fallback floor", () => {
    expect(OPAQUE_SCENE_CONTEXT_ATTRIBUTES.antialias).toBe(true);
  });

  it("does not pay to preserve the drawing buffer", () => {
    expect(OPAQUE_SCENE_CONTEXT_ATTRIBUTES.preserveDrawingBuffer).toBe(false);
  });

  it("requests webgl2 with exactly those attributes", () => {
    const canvas = canvasReturning(null);
    createOpaqueSceneContext(canvas);
    expect(canvas.getContext).toHaveBeenCalledWith(
      "webgl2",
      OPAQUE_SCENE_CONTEXT_ATTRIBUTES,
    );
  });

  // Every failure degrades to "let three do what it always did". A browser
  // that cannot give us this must still get the world.
  it("returns null rather than throwing when the context is refused", () => {
    const canvas = {
      getContext: () => {
        throw new Error("no");
      },
    };
    expect(createOpaqueSceneContext(canvas)).toBeNull();
  });

  it("returns null when the browser has no webgl2", () => {
    expect(createOpaqueSceneContext(canvasReturning(null))).toBeNull();
  });

  // getContext hands back an EXISTING context when the canvas already has
  // one, and that one carries whatever attributes it was made with. Taking it
  // would silently reinstate the transparency this exists to remove.
  it("rejects anything that is not a webgl2 context", () => {
    expect(createOpaqueSceneContext(canvasReturning({}))).toBeNull();
    expect(createOpaqueSceneContext(canvasReturning(undefined))).toBeNull();
  });
});

describe("opaque scene context, hostile input", () => {
  // The renderer's canvas is typed against a different DOM lib whose
  // OffscreenCanvas arm has no getContext, so this is reachable in principle
  // and must not throw on the way to creating the world.
  it.each([null, undefined, {}, 42, "canvas"])(
    "returns null for %s rather than throwing",
    (value) => {
      expect(createOpaqueSceneContext(value)).toBeNull();
    },
  );
});
