// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWorldBoot } from "./useWorldBoot";
import type { WorldBootView } from "./worldBootMachine";
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
  boot.start.mockReturnValue({ epoch: 1, send: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  boot.listeners.clear();
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
