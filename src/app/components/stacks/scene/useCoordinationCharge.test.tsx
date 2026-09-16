// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  COORDINATION_CHARGE_MS,
  coordinationChargeProgress,
  useCoordinationCharge,
} from "./useCoordinationCharge";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup() {
  const onCharged = vi.fn();
  const hook = renderHook(
    ({ engaged, enabled }) =>
      useCoordinationCharge(engaged, enabled, onCharged),
    { initialProps: { engaged: true, enabled: true } },
  );
  return { ...hook, onCharged };
}

describe("Coordination charge", () => {
  it("cancels a quick pass and requires a full new charge on re-entry", async () => {
    const { result, rerender, onCharged } = setup();
    await act(() => vi.advanceTimersByTime(100));
    rerender({ engaged: false, enabled: true });
    expect(result.current.current).toBeNull();
    await act(() => vi.advanceTimersByTime(COORDINATION_CHARGE_MS));
    expect(onCharged).not.toHaveBeenCalled();

    rerender({ engaged: true, enabled: true });
    await act(() => vi.advanceTimersByTime(COORDINATION_CHARGE_MS - 1));
    expect(onCharged).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTime(1));
    expect(onCharged).toHaveBeenCalledOnce();
  });

  it("shows progressive charge, fires once, and waits for disengagement to rearm", async () => {
    const { result, rerender, onCharged } = setup();
    await act(() => vi.advanceTimersByTime(1000));
    expect(
      coordinationChargeProgress(result.current.current, performance.now()),
    ).toBe(0.5);
    // Moving from hover to carry, or keeping touch selection, stays engaged.
    rerender({ engaged: true, enabled: true });
    await act(() => vi.advanceTimersByTime(1000));
    expect(onCharged).toHaveBeenCalledOnce();
    expect(
      coordinationChargeProgress(result.current.current, performance.now()),
    ).toBe(0);
    await act(() => vi.advanceTimersByTime(COORDINATION_CHARGE_MS * 5));
    expect(onCharged).toHaveBeenCalledOnce();
    rerender({ engaged: false, enabled: true });
    rerender({ engaged: true, enabled: true });
    await act(() => vi.advanceTimersByTime(COORDINATION_CHARGE_MS));
    expect(onCharged).toHaveBeenCalledTimes(2);
  });

  it("cancels when diagnostics or proximity disables it and stays idle for reduced motion", async () => {
    const { result, rerender, onCharged } = setup();
    await act(() => vi.advanceTimersByTime(500));
    rerender({ engaged: true, enabled: false });
    expect(result.current.current).toBeNull();
    await act(() => vi.advanceTimersByTime(COORDINATION_CHARGE_MS * 2));
    expect(onCharged).not.toHaveBeenCalled();
  });

  it.each(["blur", "visibilitychange"])(
    "discards charge on %s",
    async (event) => {
      const { result, onCharged } = setup();
      await act(() => vi.advanceTimersByTime(500));
      if (event === "visibilitychange") {
        vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        await act(() => document.dispatchEvent(new Event(event)));
      } else {
        await act(() => window.dispatchEvent(new Event(event)));
      }
      expect(result.current.current).toBeNull();
      await act(() => vi.advanceTimersByTime(COORDINATION_CHARGE_MS));
      expect(onCharged).not.toHaveBeenCalled();
    },
  );

  it("cleans up a pending burst on unmount", async () => {
    const { unmount, onCharged } = setup();
    unmount();
    await act(() => vi.advanceTimersByTime(COORDINATION_CHARGE_MS));
    expect(onCharged).not.toHaveBeenCalled();
  });
});
