// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useBookPath } from "./useBookPath";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([
  ["www.chappyasel.com", "/books/behave?size=L"],
  ["books.chappyasel.com", "/behave?size=L"],
  ["localhost", "/books/behave?size=L"],
])("builds a usable book URL on %s", (hostname, expected) => {
  vi.stubGlobal("window", {
    ...window,
    location: { ...window.location, hostname },
  });
  const { result } = renderHook(() => useBookPath());
  expect(result.current("behave", "size=L")).toBe(expected);
});
