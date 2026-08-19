import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { WILDLIFE_PRESENTATION } from "./Wildlife";
import { MOTH_LIGHT_PROFILES, TALKS_FLOOR_SHADE_RADIUS } from "./meadowLights";
import {
  BAT_FLIGHT,
  MOTH_COUNT,
  MOTH_FLIGHT,
  MOTH_FORWARD_CLEARANCE,
  batFlightFrame,
  createMothFrame,
  mothFrame,
} from "./wildlifeBehavior";

describe("wildlife presentation contract", () => {
  it("keeps moths below the light source in a broad cone volume", () => {
    let highest = -Infinity;
    let lowest = Infinity;
    let farthest = 0;
    for (let i = 0; i < MOTH_COUNT; i++) {
      for (let t = 0; t < 120; t += 0.1) {
        const frame = mothFrame(
          i,
          t,
          1,
          MOTH_FLIGHT.nearDistance,
          MOTH_FLIGHT.farDistance,
          MOTH_FLIGHT.maxRadius,
          createMothFrame(),
        );
        highest = Math.max(highest, frame.y);
        lowest = Math.min(lowest, frame.y);
        farthest = Math.max(farthest, Math.hypot(frame.x, frame.z));
      }
    }
    expect(highest).toBeLessThanOrEqual(-0.18);
    expect(lowest).toBeLessThanOrEqual(-0.65);
    expect(farthest).toBeGreaterThanOrEqual(1);
  });

  it("provides an explicit butterfly-like wing flap", () => {
    let minFlap = Infinity;
    let maxFlap = -Infinity;
    for (let t = 0; t < 2; t += 1 / 120) {
      const frame = mothFrame(
        0,
        t,
        1,
        MOTH_FLIGHT.nearDistance,
        MOTH_FLIGHT.farDistance,
        MOTH_FLIGHT.maxRadius,
        createMothFrame(),
      );
      const flap = frame.flap;
      minFlap = Math.min(minFlap, flap);
      maxFlap = Math.max(maxFlap, flap);
    }
    expect(maxFlap - minFlap).toBeGreaterThanOrEqual(1.4);
  });

  it("gives moths butterfly-style heading and bounded flap rates", () => {
    for (let index = 0; index < 32; index++) {
      const sample = createMothFrame();
      let flapCrossings = 0;
      let previousFlap = 0;
      for (let t = 17; t <= 18; t += 1 / 240) {
        const frame = mothFrame(
          index,
          t,
          1,
          MOTH_FLIGHT.nearDistance,
          MOTH_FLIGHT.farDistance,
          MOTH_FLIGHT.maxRadius,
          sample,
        );
        expect(frame.yaw).toBeCloseTo(
          Math.atan2(frame.velocityX, frame.velocityZ),
          10,
        );
        if (Math.sign(frame.flap) !== Math.sign(previousFlap)) flapCrossings++;
        previousFlap = frame.flap;
      }
      expect(flapCrossings).toBeGreaterThanOrEqual(12);
      expect(flapCrossings).toBeLessThanOrEqual(15);
    }
  });

  it("assigns more moths and flight area to the larger floor practical", () => {
    expect(MOTH_LIGHT_PROFILES.floor.count).toBeGreaterThan(
      MOTH_LIGHT_PROFILES.desk.count,
    );
    expect(MOTH_LIGHT_PROFILES.floor.farDistance).toBeGreaterThan(
      MOTH_LIGHT_PROFILES.desk.farDistance,
    );
    expect(MOTH_LIGHT_PROFILES.desk.farDistance).toBeLessThanOrEqual(0.75);
    expect(MOTH_LIGHT_PROFILES.floor.nearDistance).toBeGreaterThan(
      TALKS_FLOOR_SHADE_RADIUS,
    );
    // Three registered desk lamps plus the Talks floor lamp fit the fixed
    // instancing budget with one spare slot.
    expect(
      MOTH_LIGHT_PROFILES.desk.count * 3 + MOTH_LIGHT_PROFILES.floor.count,
    ).toBeLessThanOrEqual(MOTH_COUNT);
  });

  it("renders moth wings as dark shapes rather than warm mini-lights", () => {
    // Measured at the LIT end, which is the only end that could ever look
    // emissive: the unlit colour is dark by construction and proves nothing.
    // Opacity is now allowed to be substantial — presence is its job — and
    // luminance is what has to stay down.
    const luminance = (hex: string) => {
      const color = new THREE.Color(hex);
      return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    };
    expect(WILDLIFE_PRESENTATION.moth.wingOpacity).toBeGreaterThanOrEqual(0.55);
    expect(WILDLIFE_PRESENTATION.moth.bodyOpacity).toBeGreaterThan(
      WILDLIFE_PRESENTATION.moth.wingOpacity,
    );
    expect(
      luminance(WILDLIFE_PRESENTATION.moth.litWingColor),
    ).toBeLessThanOrEqual(0.16);
    expect(luminance(WILDLIFE_PRESENTATION.moth.litBodyColor)).toBeLessThan(
      luminance(WILDLIFE_PRESENTATION.moth.litWingColor),
    );
    expect(luminance(WILDLIFE_PRESENTATION.moth.wingColor)).toBeLessThan(
      luminance(WILDLIFE_PRESENTATION.moth.litWingColor),
    );
  });

  it("brightens moths from cone position without using wing angle", () => {
    let darkest = 1;
    let brightest = 0;
    for (let t = 0; t < 120; t += 0.05) {
      const frame = mothFrame(
        0,
        t,
        1,
        MOTH_FLIGHT.nearDistance,
        MOTH_FLIGHT.farDistance,
        MOTH_FLIGHT.maxRadius,
        createMothFrame(),
      );
      darkest = Math.min(darkest, frame.illumination);
      brightest = Math.max(brightest, frame.illumination);
    }
    expect(brightest).toBeGreaterThan(darkest + 0.2);
    expect(brightest).toBeLessThanOrEqual(1);
  });

  it("keeps the analytic moth path continuously in open air", () => {
    let previousVelocity: number | null = null;
    let largestVelocityStep = 0;
    for (let t = 0; t < 120; t += 1 / 60) {
      const frame = mothFrame(
        0,
        t,
        1,
        MOTH_FLIGHT.nearDistance,
        MOTH_FLIGHT.farDistance,
        MOTH_FLIGHT.maxRadius,
        createMothFrame(),
      );
      expect(frame.z).toBeGreaterThanOrEqual(MOTH_FORWARD_CLEARANCE);
      if (previousVelocity !== null) {
        largestVelocityStep = Math.max(
          largestVelocityStep,
          Math.abs(frame.velocityZ - previousVelocity),
        );
      }
      previousVelocity = frame.velocityZ;
    }
    expect(largestVelocityStep).toBeLessThan(0.05);
  });

  it("makes the bat flap strongly while wandering off a straight glide", () => {
    expect(WILDLIFE_PRESENTATION.bat.scale).toBeLessThanOrEqual(0.36);
    expect(WILDLIFE_PRESENTATION.bat.baseZ).toBeLessThanOrEqual(-8);
    let minFlap = Infinity;
    let maxFlap = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let maxZ = 0;
    for (
      let t = BAT_FLIGHT.firstRevealSeconds;
      t < BAT_FLIGHT.firstRevealSeconds + 8;
      t += 1 / 120
    ) {
      const frame = batFlightFrame(t, 1, {
        opacity: 0,
        progress: 0,
        flap: 0,
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0,
      });
      minFlap = Math.min(minFlap, frame.flap);
      maxFlap = Math.max(maxFlap, frame.flap);
      minY = Math.min(minY, frame.offsetY);
      maxY = Math.max(maxY, frame.offsetY);
      maxZ = Math.max(maxZ, Math.abs(frame.offsetZ));
    }
    expect(maxFlap - minFlap).toBeGreaterThanOrEqual(1.6);
    expect(maxY - minY).toBeGreaterThanOrEqual(0.35);
    expect(maxZ).toBeGreaterThanOrEqual(0.2);
  });
});
