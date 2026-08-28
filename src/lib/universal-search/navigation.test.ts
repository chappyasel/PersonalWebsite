import { describe, expect, it, vi } from "vitest";

import {
  canSoftNavigate,
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

  it("soft-navigates same-origin jumps only on interceptor-free hosts", () => {
    expect(
      canSoftNavigate(
        "https://books.chappyasel.com/",
        "https://books.chappyasel.com/80-000-hours",
      ),
    ).toBe(true);
    expect(
      canSoftNavigate(
        "http://dad.localhost:3211/",
        "http://dad.localhost:3211/2003/06",
      ),
    ).toBe(true);
    // The weightlifting and home apps run (.) interceptors that would claim
    // a router.push and open the destination as a sheet.
    expect(
      canSoftNavigate(
        "https://weightlifting.chappyasel.com/back-squats",
        "https://weightlifting.chappyasel.com/deadlifts",
      ),
    ).toBe(false);
    // Cross-origin always hard-navigates.
    expect(
      canSoftNavigate(
        "https://www.chappyasel.com/",
        "https://books.chappyasel.com/80-000-hours",
      ),
    ).toBe(false);
  });

  it("routes soft navigations through the app router with a bare path", () => {
    const assign = vi.fn();
    const softNavigate = vi.fn();

    navigateUniversalSearchResult(
      "https://books.chappyasel.com/80-000-hours?tab=notes",
      {
        location: {
          href: "https://books.chappyasel.com/?sort=rating",
          assign,
        } as Pick<Location, "assign" | "href">,
        notifySameDocument: vi.fn(),
        softNavigate,
      },
    );

    expect(softNavigate).toHaveBeenCalledWith("/80-000-hours?tab=notes");
    expect(assign).not.toHaveBeenCalled();
  });

  it("keeps the full load when no soft navigator is provided", () => {
    const assign = vi.fn();

    navigateUniversalSearchResult("https://books.chappyasel.com/80-000-hours", {
      location: {
        href: "https://books.chappyasel.com/",
        assign,
      } as Pick<Location, "assign" | "href">,
      notifySameDocument: vi.fn(),
    });

    expect(assign).toHaveBeenCalledWith(
      "https://books.chappyasel.com/80-000-hours",
    );
  });
});
