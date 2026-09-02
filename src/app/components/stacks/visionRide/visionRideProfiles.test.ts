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

  it("gives every single modifier a complete palette and car identity", () => {
    const sessions = [
      DEFAULT_VISION_RIDE_SESSION_PROFILE,
      {
        ...DEFAULT_VISION_RIDE_SESSION_PROFILE,
        night: true,
      },
      {
        ...DEFAULT_VISION_RIDE_SESSION_PROFILE,
        redline: true,
      },
      {
        ...DEFAULT_VISION_RIDE_SESSION_PROFILE,
        golf: true,
      },
    ];
    const profiles = sessions.map(resolveVisionRideProfile);
    const signatures = profiles.map((profile) =>
      JSON.stringify({
        sky: profile.palette.skyMagenta,
        sun: profile.palette.sunTop,
        surface: profile.palette.surfaceBottom,
        grid: profile.palette.roadLine,
        terrain: profile.terrain,
        sunScale: profile.sunBaseScale,
        sunStyle: profile.sunStyle,
        stars: profile.starCountScale,
        car: profile.car,
      }),
    );

    expect(new Set(signatures).size).toBe(4);
    expect(new Set(profiles.map((profile) => profile.car.body)).size).toBe(4);
    expect(
      new Set(profiles.map((profile) => profile.terrain.heightScale)).size,
    ).toBe(4);
    expect(
      new Set(profiles.map((profile) => profile.terrain.lineWidthPx)).size,
    ).toBe(4);
    expect(
      new Set(profiles.map((profile) => profile.terrain.lineOpacity)).size,
    ).toBe(4);
    expect(new Set(profiles.map((profile) => profile.sunBaseScale)).size).toBe(
      4,
    );
    expect(profiles[1]!.palette.skyMagenta[2]).toBeGreaterThan(
      profiles[1]!.palette.skyMagenta[0],
    );
    expect(profiles[2]!.palette.skyMagenta[0]).toBeGreaterThan(
      profiles[2]!.palette.skyMagenta[1],
    );
    expect(profiles[3]!.palette.skyMagenta[1]).toBeGreaterThan(
      profiles[3]!.palette.skyMagenta[0],
    );
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
