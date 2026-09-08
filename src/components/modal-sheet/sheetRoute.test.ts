import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FULL_PAGE_QUERY,
  loadFullPageOnSmallViewport,
  openSheetRoute,
  prefersFullPage,
} from "./sheetRoute";

function stubViewport(matches: boolean) {
  const assign = vi.fn();
  const replace = vi.fn();
  const matchMedia = vi.fn(() => ({ matches }));
  vi.stubGlobal("window", { matchMedia, location: { assign, replace } });
  return { assign, replace, matchMedia };
}

describe("sheet route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips the sheet below phone-portrait width or phone-landscape height", () => {
    expect(FULL_PAGE_QUERY).toBe("(width < 640px), (height < 500px)");
  });

  it("never prefers the full page on the server", () => {
    expect(typeof window).toBe("undefined");
    expect(prefersFullPage()).toBe(false);
  });

  it("soft-navigates on a roomy viewport so the interceptor mounts the sheet", () => {
    const { assign } = stubViewport(false);
    const push = vi.fn();
    openSheetRoute("/manual", { push });
    expect(push).toHaveBeenCalledWith("/manual");
    expect(assign).not.toHaveBeenCalled();
  });

  it("lets an overlay opener proceed on a roomy viewport", () => {
    const { assign, replace } = stubViewport(false);
    expect(loadFullPageOnSmallViewport("/some-book")).toBe(false);
    expect(assign).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends an overlay opener to the full page on a small viewport", () => {
    const { assign, replace } = stubViewport(true);
    expect(loadFullPageOnSmallViewport("/some-book")).toBe(true);
    expect(assign).toHaveBeenCalledWith("/some-book");
    expect(
      loadFullPageOnSmallViewport("/some-book?tags=x", { replace: true }),
    ).toBe(true);
    expect(replace).toHaveBeenCalledWith("/some-book?tags=x");
  });

  it("loads the full page on a small viewport", () => {
    const { assign, matchMedia } = stubViewport(true);
    const push = vi.fn();
    openSheetRoute("/weightlifting/workout/2026-09-08", { push });
    expect(matchMedia).toHaveBeenCalledWith(FULL_PAGE_QUERY);
    expect(assign).toHaveBeenCalledWith("/weightlifting/workout/2026-09-08");
    expect(push).not.toHaveBeenCalled();
  });
});
