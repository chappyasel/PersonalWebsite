// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { UNIVERSAL_SEARCH_OPEN_ATTRIBUTE } from "./overlay";
import { useUniversalSearchOpen } from "./useUniversalSearchOpen";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute(UNIVERSAL_SEARCH_OPEN_ATTRIBUTE);
  vi.restoreAllMocks();
});

it("notifies scene consumers when search opens and closes repeatedly", async () => {
  const { result } = renderHook(useUniversalSearchOpen);
  expect(result.current).toBe(false);

  for (const open of [true, false, true, false]) {
    await act(async () => {
      document.documentElement.toggleAttribute(
        UNIVERSAL_SEARCH_OPEN_ATTRIBUTE,
        open,
      );
    });
    expect(result.current).toBe(open);
  }
});

it("starts paused when search is already open and disconnects on unmount", () => {
  document.documentElement.setAttribute(
    UNIVERSAL_SEARCH_OPEN_ATTRIBUTE,
    "true",
  );
  const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
  const { result, unmount } = renderHook(useUniversalSearchOpen);
  expect(result.current).toBe(true);
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
