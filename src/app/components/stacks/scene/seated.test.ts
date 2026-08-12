import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ABOUT_COUCH,
  SEAT_POSE,
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

  it("keeps the seated camera aligned with the shifted About couch", () => {
    expect(ABOUT_COUCH.x).toBe(-3.38);
    expect(ABOUT_COUCH.z).toBe(-0.45);
    expect(SEAT_POSE.eye[0]).toBeCloseTo(-3.4081, 3);
    expect(SEAT_POSE.eye[2]).toBeCloseTo(1.0036, 3);
    expect(SEAT_POSE.target[0]).toBe(SEAT_POSE.eye[0]);
    expect(SEAT_POSE.target[2] - SEAT_POSE.eye[2]).toBe(6);
  });
});
