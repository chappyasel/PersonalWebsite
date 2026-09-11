// @vitest-environment jsdom
import { useStacks } from "../store";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import ScrollBridges from "./ScrollBridges";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("leaves the departing room idle while Next restores another page", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const initial = useStacks.getState();
  const travelTo = vi.fn();
  history.replaceState(null, "", "/#books");
  useStacks.setState({
    scrollEl: document.createElement("div"),
    jumpTo: vi.fn(),
    travelTo,
    modalOpen: false,
    panelState: "closed",
    unitMapPreview: null,
    visionRidePhase: "idle",
  });
  try {
    render(<ScrollBridges />);
    history.replaceState(null, "", "/books");
    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: { __NA: true } }),
      );
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      useStacks.setState({ activeUnit: initial.activeUnit + 1 });
    });
    expect(travelTo).not.toHaveBeenCalled();
    expect(location.pathname + location.hash).toBe("/books");
  } finally {
    cleanup();
    useStacks.setState(initial);
  }
});
