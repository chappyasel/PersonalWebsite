// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWorldBoot } from "./useWorldBoot";
import {
  type WorldBootEvent,
  type WorldBootView,
  initialWorldBootState,
  reduceWorldBoot,
  worldBootView,
} from "./worldBootMachine";
import { WORLD_BOOT_POLICY as P } from "./worldBootPolicy";
import type * as SessionModule from "./worldBootSession";
import { SERVER_WORLD_BOOT_VIEW } from "./worldBootSession";

const boot = vi.hoisted(() => ({
  view: null as WorldBootView | null,
  listeners: new Set<() => void>(),
  start: vi.fn(),
  send: vi.fn(),
}));
vi.mock("../room/ResidentRoomHost", () => ({ useRoomActive: () => true }));
vi.mock("./worldBootSession", async (importOriginal) => {
  const actual = await importOriginal<typeof SessionModule>();
  return {
    ...actual,
    retirePrepaintBackstop: vi.fn(),
    worldBoot: {
      start: boot.start,
      send: boot.send,
      getView: () => boot.view,
      subscribe: (listener: () => void) => {
        boot.listeners.add(listener);
        return () => boot.listeners.delete(listener);
      },
    },
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  boot.view = SERVER_WORLD_BOOT_VIEW;
  boot.send.mockReset();
  boot.start.mockReturnValue({ epoch: 1, send: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  boot.listeners.clear();
});

describe("boot deadline timer", () => {
  function armDissolve() {
    const events: WorldBootEvent[] = [
      {
        type: "start",
        at: 0,
        origin: "hydrate",
        webglAvailable: true,
        prefersReducedMotion: false,
        saveData: false,
        ogCapture: false,
        illustratedMode: true,
        prepaintTimedOut: false,
        warm: { source: "documentPhase", phase: null },
      },
      { type: "illustrationChanged", key: "projects:light", at: 0 },
      {
        type: "assetLoad",
        epoch: 1,
        at: 0,
        assets: { active: false, loaded: 1, total: 1, errors: 0 },
      },
      { type: "firstFrame", epoch: 1, at: 0 },
      { type: "meadowReady", epoch: 1, at: 0 },
      {
        type: "illustrationRegistered",
        key: "projects:light",
        epoch: 1,
        at: 300.25,
      },
    ];
    let state = events.reduce(
      (current, event) => reduceWorldBoot(current, event),
      initialWorldBootState(),
    );
    boot.view = worldBootView(state);
    expect(boot.view).toMatchObject({
      presentation: "dissolve",
      awaitingReveal: false,
      deadlineAt: 300.25 + P.illustrationTravelDelayMs,
    });
    const clockOrigin = vi.getMockedSystemTime()!.getTime();
    const clock = vi
      .spyOn(performance, "now")
      .mockImplementation(() => Date.now() - clockOrigin + 300.5);
    boot.send.mockImplementation((signal: SessionModule.WorldBootSignal) => {
      if (signal.type !== "tick") return;
      const next = reduceWorldBoot(state, {
        type: "tick",
        at: performance.now(),
      });
      if (next === state) return;
      state = next;
      boot.view = worldBootView(state);
      for (const listener of boot.listeners) listener();
    });
    return { hook: renderHook(() => useWorldBoot(true)), clock };
  }

  it("finishes a fractional dissolve deadline without another frame or input event", () => {
    armDissolve();
    // Browser timers truncate fractional delays. The initial delay is
    // 179.75 ms, so an unchecked callback observes time before the deadline.
    void act(() => vi.advanceTimersByTime(P.illustrationTravelDelayMs - 1));
    expect(boot.view?.presentation).toBe("dissolve");
    void act(() => vi.advanceTimersByTime(1));
    expect(boot.view?.presentation).toBe("travel");
    expect(boot.view?.revealed).toBe(false);
    // The following backstop must still work if no matching frame arrives.
    void act(() => vi.advanceTimersByTime(P.illustrationHandoffTimeoutMs));
    expect(boot.view).toMatchObject({
      presentation: "illustrated",
      failure: "hang",
      deadlineAt: null,
    });
  });

  it("cancels the pending deadline when the hook unmounts", () => {
    const { hook, clock } = armDissolve();
    clock.mockReturnValueOnce(479.5);
    void act(() => vi.advanceTimersByTime(P.illustrationTravelDelayMs));
    expect(boot.view?.presentation).toBe("dissolve");
    hook.unmount();
    boot.send.mockClear();
    void act(() => vi.advanceTimersByTime(P.illustrationHandoffTimeoutMs));
    expect(boot.send).not.toHaveBeenCalled();
  });

  it("rechecks the clock if a timer callback still arrives before the deadline", () => {
    const { clock } = armDissolve();
    clock.mockReturnValueOnce(479.5);
    void act(() => vi.advanceTimersByTime(P.illustrationTravelDelayMs));
    expect(boot.view?.presentation).toBe("dissolve");
    void act(() => vi.advanceTimersByTime(1));
    expect(boot.view?.presentation).toBe("travel");
  });
});

function armRecovery() {
  renderHook(useWorldBoot);
  act(() => {
    boot.view = {
      ...SERVER_WORLD_BOOT_VIEW,
      status: "failed",
      presentation: "illustrated",
      failure: "contextLost",
      recoverable: true,
    };
    for (const listener of boot.listeners) listener();
  });
}

describe("context recovery timer", () => {
  it("restarts a recoverable room after the existing delay", () => {
    armRecovery();
    expect(boot.start).toHaveBeenCalledTimes(1);
    void act(() => vi.advanceTimersByTime(P.contextLossRestartDelayMs));
    expect(boot.start).toHaveBeenCalledTimes(2);
  });

  it("does not restart when reading claims the illustration before effect cleanup", () => {
    armRecovery();
    // Session state changes synchronously. React has not yet committed the
    // subscription update that will retire this already-armed timer.
    boot.view = { ...boot.view!, interactionHeld: true, recoverable: false };
    void act(() => vi.advanceTimersByTime(P.contextLossRestartDelayMs));
    expect(boot.start).toHaveBeenCalledTimes(1);
  });

  it("does not restart when the document becomes hidden before the timer fires", () => {
    armRecovery();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    void act(() => vi.advanceTimersByTime(P.contextLossRestartDelayMs));
    expect(boot.start).toHaveBeenCalledTimes(1);
  });
});
