// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FULL_PAGE_QUERY } from "~/components/modal-sheet/sheetRoute";

import { useBookNotesActionLabel } from "./useBookNotesActionLabel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("book notes action label", () => {
  it("follows the launcher's viewport decision and updates after resizing", () => {
    let matches = true;
    const listeners = new Set<() => void>();
    const matchMedia = vi.fn((query: string) => {
      expect(query).toBe(FULL_PAGE_QUERY);
      return {
        get matches() {
          return matches;
        },
        addEventListener: (_event: string, listener: () => void) =>
          listeners.add(listener),
        removeEventListener: (_event: string, listener: () => void) =>
          listeners.delete(listener),
      };
    });
    vi.stubGlobal("matchMedia", matchMedia);

    const { result, unmount } = renderHook(useBookNotesActionLabel);
    expect(result.current).toBe("View book notes");

    act(() => {
      matches = false;
      listeners.forEach((listener) => listener());
    });
    expect(result.current).toBe("Preview book notes");

    act(() => {
      matches = true;
      listeners.forEach((listener) => listener());
    });
    expect(result.current).toBe("View book notes");

    unmount();
    expect(listeners.size).toBe(0);
  });
});
