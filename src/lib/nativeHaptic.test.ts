import { afterEach, describe, expect, it, vi } from "vitest";

import { nativeHaptic } from "./nativeHaptic";

const global = globalThis as { webkit?: unknown };

afterEach(() => {
  delete global.webkit;
});

describe("nativeHaptic", () => {
  it("posts to the app's handler", () => {
    const postMessage = vi.fn();
    global.webkit = { messageHandlers: { chappyHaptic: { postMessage } } };
    expect(nativeHaptic("medium")).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ kind: "medium" });
  });

  it("reports false outside the app", () => {
    expect(nativeHaptic("light")).toBe(false);
    global.webkit = { messageHandlers: {} };
    expect(nativeHaptic("light")).toBe(false);
  });
});
