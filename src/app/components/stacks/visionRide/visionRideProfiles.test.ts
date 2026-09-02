import { describe, expect, it } from "vitest";

import {
  DEFAULT_VISION_RIDE_SESSION_PROFILE,
  resolveVisionRideProfile,
  visionRideFullStack,
} from "./visionRideProfiles";

describe("Vision ride reality stack", () => {
  it("preserves the authored ride as its default", () => {
    const profile = resolveVisionRideProfile(
      DEFAULT_VISION_RIDE_SESSION_PROFILE,
    );
    expect(profile.speedMetresPerSecond).toBe(12);
    expect(profile.breath.halfCycleSeconds).toBe(30);
    expect(profile.starCountScale).toBe(1);
  });

  it("stacks night colour, Redline motion and golf ground independently", () => {
    const profile = resolveVisionRideProfile({
      night: true,
      redline: true,
      golf: true,
      pixelLook: "palette",
    });
    expect(profile.speedMetresPerSecond).toBe(18);
    expect(profile.breath.halfCycleSeconds).toBe(15);
    expect(profile.starCountScale).toBeGreaterThan(1);
    expect(profile.palette.skyTop[2]).toBeGreaterThan(
      profile.palette.skyTop[0],
    );
    expect(profile.palette.surfaceBottom[1]).toBeGreaterThan(
      profile.palette.surfaceBottom[0],
    );
    expect(profile.palette.roadLine[1]).toBe(1);
  });

  it("requires every room modifier and one pixel finish for the full stack", () => {
    expect(
      visionRideFullStack({
        night: true,
        redline: true,
        golf: true,
        pixelLook: "levels",
      }),
    ).toBe(true);
    expect(
      visionRideFullStack({
        night: true,
        redline: true,
        golf: true,
        pixelLook: "off",
      }),
    ).toBe(false);
  });
});
