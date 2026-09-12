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

function mountRoom(url: string) {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const initial = useStacks.getState();
  const travelTo = vi.fn();
  const jumpTo = vi.fn();
  history.replaceState(null, "", url);
  useStacks.setState({
    scrollEl: document.createElement("div"),
    jumpTo,
    travelTo,
    modalOpen: false,
    panelState: "closed",
    unitMapPreview: null,
    visionRidePhase: "idle",
    activeUnit: 0,
    golfStop: false,
  });
  render(<ScrollBridges />);
  const here = () => location.pathname + location.search + location.hash;
  return {
    travelTo,
    jumpTo,
    here,
    restore: () => {
      cleanup();
      useStacks.setState(initial);
    },
  };
}

it("mirrors travel as each stop's one URL, from any room path", () => {
  const room = mountRoom("/");
  try {
    act(() => useStacks.setState({ activeUnit: 4 }));
    expect(room.here()).toBe("/projects");
    act(() => useStacks.setState({ activeUnit: 1 }));
    expect(room.here()).toBe("/#books");
    act(() => useStacks.setState({ golfStop: true }));
    expect(room.here()).toBe("/golf");
    act(() => useStacks.setState({ golfStop: false, activeUnit: 2 }));
    expect(room.here()).toBe("/#weightlifting");
    act(() => useStacks.setState({ activeUnit: 0 }));
    expect(room.here()).toBe("/");
  } finally {
    room.restore();
  }
});

it("keeps mirroring after arriving on a shelf's own path", () => {
  // /golf used to switch the mirror off: scroll to Talks and the bar still
  // said /golf, and a refresh went back to the green.
  const room = mountRoom("/golf");
  try {
    act(() => useStacks.setState({ activeUnit: 6 }));
    expect(room.here()).toBe("/talks");
    act(() => useStacks.setState({ activeUnit: 4 }));
    expect(room.here()).toBe("/projects");
  } finally {
    room.restore();
  }
});

it("carries owner modes through the mirrored URL", () => {
  const room = mountRoom("/?debug=1");
  try {
    act(() => useStacks.setState({ activeUnit: 5 }));
    expect(room.here()).toBe("/musings?debug=1");
    act(() => useStacks.setState({ activeUnit: 3 }));
    expect(room.here()).toBe("/?debug=1#systems");
  } finally {
    room.restore();
  }
});

it("canonicalizes a hash alias on load and leaves a bare path as typed", () => {
  let room = mountRoom("/#projects");
  try {
    expect(room.jumpTo).toHaveBeenCalledWith(4);
    expect(room.here()).toBe("/projects");
  } finally {
    room.restore();
  }
  room = mountRoom("/projects#books");
  try {
    expect(room.jumpTo).toHaveBeenCalledWith(1);
    expect(room.here()).toBe("/#books");
  } finally {
    room.restore();
  }
  room = mountRoom("/about");
  try {
    expect(room.jumpTo).not.toHaveBeenCalled();
    expect(room.here()).toBe("/about");
  } finally {
    room.restore();
  }
});

it("travels on an explicit destination written without a fragment change", () => {
  const room = mountRoom("/projects");
  try {
    act(() => {
      history.pushState(null, "", "/#books");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(room.travelTo).toHaveBeenCalledWith(1);
    act(() => {
      history.pushState(null, "", "/talks");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(room.travelTo).toHaveBeenLastCalledWith(6);
  } finally {
    room.restore();
  }
});
