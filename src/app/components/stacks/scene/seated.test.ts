import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSeatAmount,
  isSeated,
  requestSeat,
  resetSeat,
  setSeatAmount,
  subscribeSeated,
} from "./seated";

describe("seated world lifetime", () => {
  beforeEach(() => resetSeat());

  it("clears both intent and the transient camera blend on world unmount", () => {
    requestSeat();
    setSeatAmount(0.72);
    resetSeat();

    expect(isSeated()).toBe(false);
    expect(getSeatAmount()).toBe(0);
  });

  it("notifies the store mirror while the lifetime subscriber still exists", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSeated(listener);
    requestSeat();
    resetSeat();
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(isSeated()).toBe(false);
  });
});
