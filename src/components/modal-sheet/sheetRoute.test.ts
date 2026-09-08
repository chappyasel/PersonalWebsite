import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FULL_PAGE_QUERY,
  openSheetRoute,
  prefersFullPage,
} from "./sheetRoute";

function stubViewport(matches: boolean) {
  const assign = vi.fn();
  const matchMedia = vi.fn(() => ({ matches }));
  vi.stubGlobal("window", { matchMedia, location: { assign } });
  return { assign, matchMedia };
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

  it("loads the full page on a small viewport", () => {
    const { assign, matchMedia } = stubViewport(true);
    const push = vi.fn();
    openSheetRoute("/weightlifting/workout/2026-09-08", { push });
    expect(matchMedia).toHaveBeenCalledWith(FULL_PAGE_QUERY);
    expect(assign).toHaveBeenCalledWith("/weightlifting/workout/2026-09-08");
    expect(push).not.toHaveBeenCalled();
  });
});
