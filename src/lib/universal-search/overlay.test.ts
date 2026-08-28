// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { isUniversalSearchOpen } from "./overlay";

afterEach(() => {
  document.documentElement.removeAttribute("data-universal-search-open");
});

describe("universal search overlay state", () => {
  it("tracks the document marker used by yielding scene and modal listeners", () => {
    expect(isUniversalSearchOpen()).toBe(false);

    document.documentElement.setAttribute("data-universal-search-open", "true");
    expect(isUniversalSearchOpen()).toBe(true);

    document.documentElement.removeAttribute("data-universal-search-open");
    expect(isUniversalSearchOpen()).toBe(false);
  });
});
