import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { DOCUMENT_TRANSITION_KEY } from "./documentBootstrap";
import { navigateFullDocument } from "./documentNavigation";
import { useRouteTransitionPrototype } from "./store";

const assign = vi.fn(),
  replace = vi.fn(),
  setItem = vi.fn();
const rect = { left: 12, top: 120, width: 200, height: 100 };
beforeEach(() => {
  vi.clearAllMocks();
  useRouteTransitionPrototype.setState({ enabled: true });
  vi.stubGlobal("window", {
    innerWidth: 390,
    innerHeight: 844,
    location: { href: "https://www.chappyasel.com/", assign, replace },
    sessionStorage: { setItem },
    matchMedia: () => ({ matches: false }),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  useRouteTransitionPrototype.setState({ enabled: true });
});

it("normalizes a book's host and captures its cover without changing presentation or history semantics", () => {
  const measure = vi.fn(() => rect);
  const source = { getBoundingClientRect: measure } as unknown as HTMLElement;
  navigateFullDocument("https://books.chappyasel.com/behave?tags=x#notes", {
    source,
  });
  expect(assign).toHaveBeenCalledWith(
    "https://www.chappyasel.com/books/behave?tags=x#notes",
  );
  expect(measure).toHaveBeenCalledOnce();
  expect(setItem).toHaveBeenCalledWith(
    DOCUMENT_TRANSITION_KEY,
    expect.any(String),
  );
  expect(JSON.parse(setItem.mock.calls[0]![1] as string)).toMatchObject({
    enabled: true,
    to: "https://www.chappyasel.com/books/behave?tags=x#notes",
    clip: "inset(120px 178px 624px 12px round 16px)",
  });
});
it.each(["off", "reduced"])(
  "navigates with %s without measuring the source",
  (mode) => {
    if (mode === "off")
      useRouteTransitionPrototype.setState({ enabled: false });
    else
      window.matchMedia = vi.fn(() => ({
        matches: true,
      })) as unknown as typeof matchMedia;
    const measure = vi.fn(() => rect);
    const source = { getBoundingClientRect: measure } as unknown as HTMLElement;
    navigateFullDocument("/manual", { source, replace: true });
    expect(measure).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("https://www.chappyasel.com/manual");
    expect(JSON.parse(setItem.mock.calls[0]![1] as string)).toMatchObject({
      enabled: false,
    });
  },
);
it("still navigates if session storage is unavailable", () => {
  setItem.mockImplementationOnce(() => {
    throw new Error("blocked");
  });
  navigateFullDocument("/musings/essay", { source: rect });
  expect(assign).toHaveBeenCalledWith(
    "https://www.chappyasel.com/musings/essay",
  );
});
it("does not prepare transitions for external links or feeds", () => {
  navigateFullDocument("https://example.com/article");
  navigateFullDocument("/musings/feed.xml");
  expect(setItem).not.toHaveBeenCalled();
  expect(assign).toHaveBeenCalledWith("https://example.com/article");
});
