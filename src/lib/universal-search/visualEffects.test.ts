import { afterEach, describe, expect, it, vi } from "vitest";

import { universalSearchVisualEffects } from "./visualEffects";

afterEach(() => universalSearchVisualEffects.resetForTests());

describe("universalSearchVisualEffects", () => {
  it("ships approved blur on and exposes a reload-resetting live override", () => {
    const listener = vi.fn();
    const unsubscribe = universalSearchVisualEffects.subscribe(listener);

    expect(universalSearchVisualEffects.getSnapshot().backdropBlur).toBe(true);
    universalSearchVisualEffects.setBackdropBlur(false);

    expect(universalSearchVisualEffects.getSnapshot().backdropBlur).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
