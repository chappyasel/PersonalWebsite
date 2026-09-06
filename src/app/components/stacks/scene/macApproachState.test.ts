import { afterEach, describe, expect, it } from "vitest";

import {
  MAC_APPROACH_DISMISS_GRACE_MS,
  MAC_APPROACH_MIN_DISTANCE,
  MAC_APPROACH_RELEASE_TRAVEL,
  macApproach,
  macApproachDistance,
  macApproachReleased,
} from "./macApproachState";

afterEach(() => macApproach.set(false));

describe("macApproachDistance", () => {
  const mac = { height: 0.644, width: 0.515 };

  it("frames the machine by height on a wide viewport", () => {
    // fov 33: tan(16.5°) = 0.2962, so 0.644 / (0.62 · 0.5924) = 1.75.
    expect(
      macApproachDistance({ fovDegrees: 33, aspect: 16 / 9, ...mac }),
    ).toBeCloseTo(1.75, 2);
  });

  it("backs off further when the width binds on a phone", () => {
    const portrait = macApproachDistance({
      fovDegrees: 33,
      aspect: 0.5,
      ...mac,
    });
    const wide = macApproachDistance({
      fovDegrees: 33,
      aspect: 16 / 9,
      ...mac,
    });
    expect(portrait).toBeGreaterThan(wide);
    expect(portrait).toBeCloseTo(2.8, 1);
  });

  it("never comes nearer than the floor", () => {
    expect(
      macApproachDistance({
        fovDegrees: 120,
        aspect: 2,
        height: 0.1,
        width: 0.1,
      }),
    ).toBe(MAC_APPROACH_MIN_DISTANCE);
  });
});

describe("macApproachReleased", () => {
  it("lets go when the camera moves on or the unit changes", () => {
    const home = { startPosition: 3, activeUnit: 3, unitIndex: 3 };
    expect(macApproachReleased({ ...home, scenePosition: 3 })).toBe(false);
    expect(
      macApproachReleased({
        ...home,
        scenePosition: 3 + MAC_APPROACH_RELEASE_TRAVEL / 2,
      }),
    ).toBe(false);
    expect(
      macApproachReleased({
        ...home,
        scenePosition: 3 + MAC_APPROACH_RELEASE_TRAVEL * 2,
      }),
    ).toBe(true);
    expect(
      macApproachReleased({ ...home, scenePosition: 3, activeUnit: 4 }),
    ).toBe(true);
  });
});

describe("dismissal", () => {
  it("puts the machine back and refuses to bring it up again within the grace", () => {
    macApproach.approach(1000);
    expect(macApproach.near).toBe(true);
    macApproach.dismiss(2000);
    expect(macApproach.near).toBe(false);
    expect(
      macApproach.recentlyDismissed(2000 + MAC_APPROACH_DISMISS_GRACE_MS - 1),
    ).toBe(true);
    macApproach.approach(2000 + MAC_APPROACH_DISMISS_GRACE_MS - 1);
    expect(macApproach.near).toBe(false);
    expect(
      macApproach.recentlyDismissed(2000 + MAC_APPROACH_DISMISS_GRACE_MS),
    ).toBe(false);
    macApproach.approach(2000 + MAC_APPROACH_DISMISS_GRACE_MS);
    expect(macApproach.near).toBe(true);
  });
});

describe("the approach flag", () => {
  it("toggles and notifies once per change", () => {
    let calls = 0;
    const unsubscribe = macApproach.subscribe(() => calls++);
    macApproach.toggle();
    expect(macApproach.near).toBe(true);
    macApproach.set(true);
    expect(calls).toBe(1);
    macApproach.toggle();
    expect(macApproach.near).toBe(false);
    expect(calls).toBe(2);
    unsubscribe();
    macApproach.toggle();
    expect(calls).toBe(2);
  });
});
