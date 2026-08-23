import { describe, expect, it, vi } from "vitest";

import {
  isSameDocumentNavigation,
  navigateUniversalSearchResult,
} from "./navigation";

describe("Universal Search navigation", () => {
  it("recognizes fragment-only homepage navigation", () => {
    expect(
      isSameDocumentNavigation(
        "https://www.chappyasel.com/#books",
        "https://www.chappyasel.com/#projects",
      ),
    ).toBe(true);
    expect(
      isSameDocumentNavigation(
        "https://books.chappyasel.com/",
        "https://www.chappyasel.com/#projects",
      ),
    ).toBe(false);
  });

  it("notifies same-document history owners after assigning the target", () => {
    const assign = vi.fn();
    const notifySameDocument = vi.fn();

    navigateUniversalSearchResult("https://www.chappyasel.com/#projects", {
      location: {
        href: "https://www.chappyasel.com/#books",
        assign,
      } as Pick<Location, "assign" | "href">,
      notifySameDocument,
    });

    expect(assign).toHaveBeenCalledWith("https://www.chappyasel.com/#projects");
    expect(notifySameDocument).toHaveBeenCalledOnce();
  });
});
