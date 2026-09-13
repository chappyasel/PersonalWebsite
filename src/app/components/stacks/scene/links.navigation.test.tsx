// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useOpenTarget } from "./links";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  transition: vi.fn(() => false),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../../route-transition-prototype/navigation", () => ({
  requestPrototypeNavigation: mocks.transition,
}));
vi.mock("~/lib/analytics", () => ({
  capture: vi.fn(),
  HOMEPAGE_PORTAL_ACTIVATED_EVENT: "portal",
}));
vi.mock("../fieldNotes/progress", () => ({ recordFieldNoteEvent: vi.fn() }));
vi.mock("./Lift", () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
const context = { portalId: "grab:paper:5", unitIndex: 5 };

describe("shelf reading navigation", () => {
  it("opens the Musings index in place through the page transition", () => {
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    const { result } = renderHook(() => useOpenTarget());
    result.current({ to: "blog" }, context);
    expect(mocks.transition).toHaveBeenCalledWith("/musings", context.portalId);
    expect(mocks.push).toHaveBeenCalledWith("/musings");
    expect(openTab).not.toHaveBeenCalled();
  });

  it("opens a local article in place even when supplied as a raw URL", () => {
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    const { result } = renderHook(() => useOpenTarget());
    result.current(
      { href: "/musings/ai-stack", label: "Read this musing", external: false },
      context,
    );
    expect(mocks.transition).toHaveBeenCalledWith(
      "/musings/ai-stack",
      context.portalId,
    );
    expect(mocks.push).toHaveBeenCalledWith("/musings/ai-stack");
    expect(openTab).not.toHaveBeenCalled();
  });

  it("keeps explicitly external essays in a separate tab", () => {
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    const { result } = renderHook(() => useOpenTarget());
    result.current(
      {
        href: "https://www.aicollective.com/trust",
        label: "Read Trust",
        external: true,
      },
      context,
    );
    expect(openTab).toHaveBeenCalledWith(
      "https://www.aicollective.com/trust",
      "_blank",
      "noopener,noreferrer",
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
