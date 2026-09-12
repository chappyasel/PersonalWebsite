// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWorldBoot } from "./useWorldBoot";
import { WORLD_BOOT_POLICY as P } from "./worldBootPolicy";
import { worldBoot } from "./worldBootSession";

vi.mock("../room/ResidentRoomHost", () => ({ useRoomActive: () => true }));

let markersAtStart: (string | undefined)[];

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function clearDocumentHandshake() {
  for (const attribute of [
    P.worldAttribute,
    P.illustrationAttribute,
    P.presentationAttribute,
    P.ogCaptureAttribute,
  ]) {
    document.documentElement.removeAttribute(attribute);
  }
  const globals = window as unknown as Record<string, unknown>;
  for (const key of [
    P.prepaintTokenGlobal,
    P.prepaintOutcomeGlobal,
    P.prepaintTimerGlobal,
    P.prepaintStartedAtGlobal,
  ]) {
    delete globals[key];
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  sessionStorage.setItem(P.webglCapabilityKey, "1");
  history.replaceState(null, "", "/");
  worldBoot.scope().send({ type: "exit" });
  worldBoot.setDocumentActive(true);
  clearDocumentHandshake();

  markersAtStart = [];
  const start = worldBoot.start.bind(worldBoot);
  vi.spyOn(worldBoot, "start").mockImplementation((...args) => {
    markersAtStart.push(document.documentElement.dataset.roomIllustration);
    return start(...args);
  });
});

afterEach(() => {
  cleanup();
  // A test may open a newer generation than the hook owns.
  worldBoot.scope().send({ type: "exit" });
  clearDocumentHandshake();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("route illustration opt-in", () => {
  it("enables illustration before an SPA boot without a prepaint script", () => {
    history.replaceState(null, "", "/books");
    history.pushState(null, "", "/");
    expect(document.documentElement.hasAttribute(P.illustrationAttribute)).toBe(
      false,
    );

    const { result, unmount } = renderHook(() => useWorldBoot(true));

    expect(markersAtStart).toEqual(["enabled"]);
    expect(worldBoot.getState().illustratedMode).toBe(true);
    expect(result.current.presentation).toBe("illustrated");
    expect(document.documentElement.getAttribute(P.presentationAttribute)).toBe(
      "illustrated",
    );

    unmount();
    expect(worldBoot.getState().status).toBe("exited");
  });

  it.each([
    { label: "Golf's explicit false", illustrated: false },
    { label: "the default argument", illustrated: undefined },
  ])("clears a stale enabled marker for $label", ({ illustrated }) => {
    document.documentElement.dataset.roomIllustration = "enabled";
    history.replaceState(null, "", "/golf");

    renderHook(() => useWorldBoot(illustrated));

    expect(markersAtStart).toEqual(["disabled"]);
    expect(worldBoot.getState().illustratedMode).toBe(false);
    expect(document.documentElement.getAttribute(P.presentationAttribute)).toBe(
      null,
    );
  });

  it("restarts when the route prop changes and keeps identical renders in the same generation", () => {
    const { result, rerender, unmount } = renderHook(
      ({ illustrated }) => useWorldBoot(illustrated),
      { initialProps: { illustrated: true } },
    );
    const initialEpoch = result.current.epoch;

    rerender({ illustrated: true });
    expect(markersAtStart).toHaveLength(1);
    expect(result.current.epoch).toBe(initialEpoch);

    history.pushState(null, "", "/golf");
    rerender({ illustrated: false });
    expect(result.current.epoch).toBe(initialEpoch + 1);
    expect(worldBoot.getState()).toMatchObject({
      illustratedMode: false,
      status: "booting",
    });

    history.pushState(null, "", "/");
    rerender({ illustrated: true });
    expect(markersAtStart).toEqual(["enabled", "disabled", "enabled"]);
    expect(result.current.epoch).toBe(initialEpoch + 2);
    expect(worldBoot.getState().illustratedMode).toBe(true);
    expect(result.current.presentation).toBe("illustrated");

    unmount();
    expect(worldBoot.getState().status).toBe("exited");
  });

  it("does not exit a newer generation when the old hook unmounts", () => {
    const { result, unmount } = renderHook(() => useWorldBoot(true));
    const hookEpoch = result.current.epoch;

    act(() => {
      worldBoot.start("hydrate");
    });
    const newerView = worldBoot.getView();
    expect(newerView.epoch).toBe(hookEpoch + 1);

    unmount();

    expect(worldBoot.getView()).toBe(newerView);
    expect(worldBoot.getState().status).toBe("booting");
  });
});
