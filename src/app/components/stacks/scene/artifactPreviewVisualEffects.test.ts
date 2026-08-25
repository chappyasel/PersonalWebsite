import { afterEach, describe, expect, it, vi } from "vitest";

import { artifactPreviewVisualEffects } from "./artifactPreviewVisualEffects";

afterEach(() => artifactPreviewVisualEffects.resetForTests());

describe("artifactPreviewVisualEffects", () => {
  it("ships the approved photo blur and exposes a reload-resetting override", () => {
    const listener = vi.fn();
    const unsubscribe = artifactPreviewVisualEffects.subscribe(listener);

    expect(artifactPreviewVisualEffects.getSnapshot().backdropBlur).toBe(true);
    artifactPreviewVisualEffects.setBackdropBlur(false);

    expect(artifactPreviewVisualEffects.getSnapshot().backdropBlur).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
