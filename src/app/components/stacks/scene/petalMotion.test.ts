import { describe, expect, it } from "vitest";

import {
  PETAL_FAR_BACKGROUND_Z,
  ambientPetalsPerUnit,
  buildPetalSources,
  petalColorForTheme,
} from "./Petals";
import { shelfBackEdgeAt } from "./meadowInteraction";
import { MEADOW_WIND } from "./meadowMotion";
import {
  PETALS_PER_UNIT,
  PETAL_FIXED_STEP,
  type PetalMotion,
  type PetalSource,
  advancePetal,
  burstPetal,
  createPetalMotion,
  disturbPetal,
  impulsePetal,
  petalRenderScale,
  petalShockwaveImpulse,
  releasePetal,
  samplePetalWind,
} from "./petalMotion";

const SOURCE: PetalSource = {
  unitIndex: 0,
  x: 1,
  y: -1.08,
  z: 0.5,
  tint: 0.2,
  depth: "foreground",
};

function waitingPetal(id = 2) {
  const motion = createPetalMotion(id, SOURCE);
  motion.phase = "waiting";
  motion.phaseStartedAt = 0;
  motion.transitionAt = 2;
  motion.flightsFromSource = 0;
  return motion;
}

function run(motion: PetalMotion, seconds: number, step = PETAL_FIXED_STEP) {
  let time = 0;
  while (time < seconds - 1e-9) {
    time += step;
    advancePetal(motion, {
      time,
      step,
      groundY: -1.17,
      canRelease: true,
    });
  }
  return motion;
}

describe("petal motion", () => {
  it("keeps every petal species visible with a subdued night palette", () => {
    const tints = [0.2, 0.6, 0.9];
    for (const tint of tints) {
      const day = petalColorForTheme(tint, 0);
      const night = petalColorForTheme(tint, 1);
      expect(night.getHex()).not.toBe(0);
      expect(night.getHex()).not.toBe(day.getHex());
      expect(night.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(
        day.getHSL({ h: 0, s: 0, l: 0 }).l,
      );
    }
  });

  it("selects 28 real, separated meadow-head donors across foreground and background", () => {
    const sources = buildPetalSources();
    expect(sources).toHaveLength(7 * PETALS_PER_UNIT);
    for (let unitIndex = 0; unitIndex < 7; unitIndex += 1) {
      const local = sources.filter((source) => source.unitIndex === unitIndex);
      expect(local).toHaveLength(PETALS_PER_UNIT);
      expect(
        local.filter((source) => source.depth === "background").length,
      ).toBeGreaterThanOrEqual(18);
      expect(
        local.filter((source) => source.z < PETAL_FAR_BACKGROUND_Z).length,
      ).toBeGreaterThanOrEqual(14);
      for (let a = 0; a < local.length; a += 1)
        for (let b = a + 1; b < local.length; b += 1)
          expect(
            Math.hypot(local[a]!.x - local[b]!.x, local[a]!.z - local[b]!.z),
          ).toBeGreaterThanOrEqual(0.239 - 1e-6);
    }
  });

  it("caps airborne traffic by the current quality budget", () => {
    expect(ambientPetalsPerUnit(21)).toBe(3);
    expect(ambientPetalsPerUnit(42)).toBe(6);
    expect(ambientPetalsPerUnit(70)).toBe(10);
    expect(ambientPetalsPerUnit(84)).toBe(10);
    expect(ambientPetalsPerUnit(196)).toBe(10);
  });

  it("starts with the quality-budgeted population already in motion", () => {
    const phases = Array.from({ length: 11 }, (_, id) =>
      createPetalMotion(id, SOURCE, 0, 10),
    ).map((motion) => motion.phase);
    expect(
      phases
        .slice(0, 10)
        .every((phase) => phase === "airborne" || phase === "loosening"),
    ).toBe(true);
    expect(phases[10]).toBe("waiting");
  });

  it("samples deterministic, bounded wind that travels through world space", () => {
    const a = samplePetalWind(2, -1, 4);
    const same = samplePetalWind(2, -1, 4);
    const later = samplePetalWind(2, -1, 9);
    expect(same).toEqual(a);
    expect(a.magnitude).toBeGreaterThan(0);
    expect(a.magnitude).toBeLessThanOrEqual(MEADOW_WIND.gustCeiling);
    expect(later).not.toEqual(a);
  });

  it("reveals at its flower, releases, rises, and eventually settles", () => {
    const motion = waitingPetal();
    run(motion, 2.1);
    expect(motion.phase).toBe("loosening");
    expect(petalRenderScale(motion, 2.1)).toBeGreaterThan(0);

    let time = 2.1;
    let peak = motion.position.y;
    while (time < 19 && motion.phase !== "settled") {
      time += PETAL_FIXED_STEP;
      advancePetal(motion, {
        time,
        step: PETAL_FIXED_STEP,
        groundY: -1.17,
        canRelease: true,
      });
      peak = Math.max(peak, motion.position.y);
    }
    expect(peak).toBeGreaterThan(SOURCE.y + 0.04);
    expect(motion.phase).toBe("settled");
    expect(motion.position.y).toBeCloseTo(-1.095, 6);
  });

  it("keeps the same authored trajectory across 60 and 120 Hz render loops", () => {
    const a = waitingPetal(6);
    const b = waitingPetal(6);
    releasePetal(a, 0);
    releasePetal(b, 0);

    // Both render rates feed the same 30 Hz fixed simulation step.
    run(a, 5, PETAL_FIXED_STEP);
    run(b, 5, PETAL_FIXED_STEP);
    expect(b.position.x).toBeCloseTo(a.position.x, 10);
    expect(b.position.y).toBeCloseTo(a.position.y, 10);
    expect(b.position.z).toBeCloseTo(a.position.z, 10);
    expect(b.rotation.x).toBeCloseTo(a.rotation.x, 10);
  });

  it("lets one local disturbance release a passive petal without teleporting it", () => {
    const motion = waitingPetal();
    const before = { ...motion.position };
    expect(disturbPetal(motion, 1, 1.1, 0.5, 0.4, 1, 0, 0.15)).toBe(true);
    expect(motion.phase).toBe("airborne");
    expect(motion.position).toEqual(before);
    expect(motion.velocity.x).toBeGreaterThan(0);
    expect(motion.velocity.y).toBeGreaterThan(0);
  });

  it("ignores distant disturbances", () => {
    const motion = waitingPetal();
    expect(disturbPetal(motion, 1, 4, 4, 0.4, 1, 0, 0.2)).toBe(false);
    expect(motion.phase).toBe("waiting");
  });

  it("lets an expanding shockwave apply one spatially-filtered radial impulse", () => {
    expect(petalShockwaveImpulse(0.7, 0.7, 0.15, 0.2)).toBeCloseTo(0.27);
    expect(petalShockwaveImpulse(0.4, 0.7, 0.15, 0.2)).toBe(0);
    const motion = waitingPetal();
    expect(impulsePetal(motion, 1, 1, -0.25, 0.12)).toBe(true);
    expect(motion.phase).toBe("airborne");
    expect(motion.velocity.x).toBeGreaterThan(0);
    expect(motion.velocity.z).toBeLessThan(0);
  });

  it("launches the click's immediate petals radially from its origin", () => {
    const motion = waitingPetal();
    const clickX = SOURCE.x - 0.35;
    const clickZ = SOURCE.z;

    // This is the immediate click path used before the expanding ring arrives.
    expect(burstPetal(motion, 1, clickX, clickZ, 0.9, 0.17)).toBe(true);

    const radialX = SOURCE.x - clickX;
    const radialZ = SOURCE.z - clickZ;
    const radialSpeed =
      motion.velocity.x * radialX + motion.velocity.z * radialZ;
    const sidewaysSpeed = Math.abs(
      motion.velocity.x * -radialZ + motion.velocity.z * radialX,
    );
    expect(radialSpeed).toBeGreaterThan(sidewaysSpeed);
  });

  it("preserves either drag direction long enough to read against the wind", () => {
    const right = waitingPetal(8);
    const left = waitingPetal(8);
    expect(disturbPetal(right, 0, SOURCE.x, SOURCE.z, 0.85, 1, 0, 0.27)).toBe(
      true,
    );
    expect(disturbPetal(left, 0, SOURCE.x, SOURCE.z, 0.85, -1, 0, 0.27)).toBe(
      true,
    );

    run(right, 0.75);
    run(left, 0.75);
    expect(right.position.x - SOURCE.x).toBeGreaterThan(0.03);
    expect(left.position.x - SOURCE.x).toBeLessThan(-0.03);
  });

  it("keeps every donor on its own side of the shelf row", () => {
    const crossed = buildPetalSources().filter((source) =>
      source.depth === "foreground"
        ? source.z < shelfBackEdgeAt(source.x) + 0.08
        : source.z > shelfBackEdgeAt(source.x) - 0.08,
    );
    expect(crossed).toEqual([]);
  });

  it("keeps airborne petals from passing through the shelf row", () => {
    const motion = waitingPetal();
    releasePetal(motion, 0, 0, -1, 0.8);
    let time = 0;
    while (time < 1.5) {
      time += PETAL_FIXED_STEP;
      advancePetal(motion, {
        time,
        step: PETAL_FIXED_STEP,
        groundY: -2,
        canRelease: true,
        backstopZ: 0.42,
      });
      expect(motion.position.z).toBeGreaterThanOrEqual(0.42);
    }
  });

  it("keeps background petals from passing forward through the shelf row", () => {
    const motion = waitingPetal();
    motion.source = { ...SOURCE, z: -0.6, depth: "background" };
    motion.position.z = -0.6;
    releasePetal(motion, 0, 0, 1, 0.8);
    let time = 0;
    while (time < 1.5) {
      time += PETAL_FIXED_STEP;
      advancePetal(motion, {
        time,
        step: PETAL_FIXED_STEP,
        groundY: -2,
        canRelease: true,
        frontstopZ: -0.42,
      });
      expect(motion.position.z).toBeLessThanOrEqual(-0.42);
    }
  });

  it("lets the meadow wind take over after the interaction impulse", () => {
    const calm = waitingPetal(11);
    const windy = waitingPetal(11);
    releasePetal(calm, 0);
    releasePetal(windy, 0);
    let time = 0;
    while (time < 1.5) {
      time += PETAL_FIXED_STEP;
      advancePetal(calm, {
        time,
        step: PETAL_FIXED_STEP,
        groundY: -2,
        canRelease: true,
        windAmplitude: 0,
      });
      advancePetal(windy, {
        time,
        step: PETAL_FIXED_STEP,
        groundY: -2,
        canRelease: true,
      });
    }
    expect(
      Math.hypot(windy.position.x - SOURCE.x, windy.position.z - SOURCE.z),
    ).toBeGreaterThan(
      Math.hypot(calm.position.x - SOURCE.x, calm.position.z - SOURCE.z),
    );
  });
});
