import { describe, expect, it } from "vitest";

import {
  EAST_FEATHER,
  FAR_FEATHER,
  FLOWER_LIFT,
  GRASS_BANDS,
  GRASS_ROOT_SINK,
  LATERAL_REACH,
  MEADOW_BANK,
  MEADOW_FLOWER_TOTAL,
  MEADOW_GRASS_TOTAL,
  MEADOW_RUNG_FLOWERS,
  MEADOW_RUNG_FRACTIONS,
  MEADOW_RUNG_GRASS,
  MEADOW_RUNG_GRASS_FAR,
  MEADOW_RUNG_GRASS_NEAR,
  MEADOW_SHELF_CEILING_Y,
  MEADOW_TERRAIN,
  NEAR_FEATHER_ZONE,
  VEGETATION_FRONT_Z,
  WEST_FEATHER,
  buildFlowerPositions,
  buildGrassInstances,
  clearingScale,
  eastFeatherScale,
  farFeatherScale,
  inEastFeather,
  inWestFeather,
  meadowHeight,
  ridgeCrestY,
  unionWestX,
  westFeatherScale,
} from "./meadowField";
import { SEAT_POSE } from "./seated";

const SEAT_X = SEAT_POSE.eye[0];
const SEAT_Y = SEAT_POSE.eye[1];
const SEAT_Z = SEAT_POSE.eye[2];

describe("rung dial", () => {
  const grass = buildGrassInstances();
  const flowers = buildFlowerPositions();

  it("orders both mesh buffers at the exported rung boundaries", () => {
    expect(grass.near.rungCounts).toEqual([...MEADOW_RUNG_GRASS_NEAR]);
    expect(grass.far.rungCounts).toEqual([...MEADOW_RUNG_GRASS_FAR]);
    expect(flowers.rungCounts).toEqual([...MEADOW_RUNG_FLOWERS]);
    expect(grass.near.count + grass.far.count).toBe(MEADOW_GRASS_TOTAL);
    expect(flowers.count).toBe(MEADOW_FLOWER_TOTAL);
    MEADOW_RUNG_FRACTIONS.forEach((frac, i) => {
      expect(MEADOW_RUNG_GRASS[i]).toBe(
        MEADOW_RUNG_GRASS_NEAR[i]! + MEADOW_RUNG_GRASS_FAR[i]!,
      );
      expect(MEADOW_RUNG_GRASS[i]).toBe(Math.round(MEADOW_GRASS_TOTAL * frac));
    });
  });

  it("never dials down to bare terrain", () => {
    expect(MEADOW_RUNG_GRASS_NEAR[0]).toBeGreaterThan(0);
    expect(MEADOW_RUNG_GRASS_FAR[0]).toBeGreaterThan(0);
  });

  it("draws front-to-back within each rung (early-z)", () => {
    for (const stream of [grass.near, grass.far]) {
      let start = 0;
      for (const end of stream.rungCounts) {
        for (let i = start + 1; i < end; i++) {
          // Ascending view depth from the rail plane = descending z.
          expect(stream.z[i]!).toBeLessThanOrEqual(stream.z[i - 1]! + 1e-6);
        }
        start = end;
      }
    }
  });

  it("thins every band uniformly at every rung", () => {
    // A rung prefix must keep every band alive at the rung's fraction —
    // that is what makes `count` a density dial instead of a depth cut.
    // The far mesh holds two bands (mid + seated); split by z.
    MEADOW_RUNG_FRACTIONS.forEach((frac, ri) => {
      expect(grass.near.rungCounts[ri]! / GRASS_BANDS.near.count).toBeCloseTo(
        frac,
        2,
      );
      let mid = 0;
      let seated = 0;
      for (let i = 0; i < grass.far.rungCounts[ri]!; i++) {
        if (grass.far.z[i]! <= -8.19) mid += 1;
        else seated += 1;
      }
      expect(mid / GRASS_BANDS.mid.count).toBeCloseTo(frac, 2);
      expect(seated / GRASS_BANDS.seated.count).toBeCloseTo(frac, 2);
    });
  });
});

describe("placement", () => {
  const grass = buildGrassInstances();
  const streams = [grass.near, grass.far];
  const flowers = buildFlowerPositions();

  it("keeps every instance on the terrain rectangle", () => {
    for (const stream of streams) {
      for (let i = 0; i < stream.count; i++) {
        expect(stream.x[i]!).toBeGreaterThanOrEqual(MEADOW_TERRAIN.minX);
        expect(stream.x[i]!).toBeLessThanOrEqual(MEADOW_TERRAIN.maxX);
        expect(stream.z[i]!).toBeGreaterThanOrEqual(-18.3);
        expect(stream.z[i]!).toBeLessThanOrEqual(MEADOW_BANK.skirtZ + 1e-6);
      }
    }
    for (let i = 0; i < flowers.count; i++) {
      expect(flowers.x[i]!).toBeGreaterThanOrEqual(MEADOW_TERRAIN.minX);
      expect(flowers.x[i]!).toBeLessThanOrEqual(MEADOW_TERRAIN.maxX);
      expect(flowers.z[i]!).toBeGreaterThanOrEqual(-18.3);
      expect(flowers.z[i]!).toBeLessThanOrEqual(MEADOW_BANK.skirtZ + 1e-6);
    }
  });

  it("starts vegetation inside the near-feather zone, below every frame", () => {
    let front = -Infinity;
    for (const stream of streams) {
      for (let i = 0; i < stream.count; i++) {
        // Traverse front line only — the seated band lives behind the rail.
        if (stream.z[i]! <= VEGETATION_FRONT_Z)
          front = Math.max(front, stream.z[i]!);
      }
    }
    expect(front).toBeLessThanOrEqual(NEAR_FEATHER_ZONE.maxZ);
    // The zone itself must sit behind the deepest frame-bottom ground entry
    // (tablet portrait at low eye bob, z 4.52) — the old z = 3.25 front
    // line violated this.
    expect(NEAR_FEATHER_ZONE.minZ).toBeGreaterThanOrEqual(4.52);
    expect(3.25).toBeLessThan(NEAR_FEATHER_ZONE.minZ);
  });

  it("roots tufts in the terrain and floats flowers at canopy height", () => {
    for (const stream of streams) {
      for (let i = 0; i < stream.count; i += 47) {
        expect(stream.y[i]!).toBeCloseTo(
          meadowHeight(stream.x[i]!, stream.z[i]!) - GRASS_ROOT_SINK,
          5,
        );
        expect(stream.sun[i]!).toBeGreaterThanOrEqual(0);
        expect(stream.sun[i]!).toBeLessThanOrEqual(1);
      }
    }
    for (let i = 0; i < flowers.count; i += 7) {
      expect(flowers.y[i]!).toBeCloseTo(
        meadowHeight(flowers.x[i]!, flowers.z[i]!) + FLOWER_LIFT,
        5,
      );
    }
  });

  it("is deterministic across builds", () => {
    const again = buildGrassInstances();
    for (const [a, b] of [
      [again.near, grass.near],
      [again.far, grass.far],
    ] as const) {
      expect(Buffer.from(a.x.buffer).equals(Buffer.from(b.x.buffer))).toBe(true);
      expect(Buffer.from(a.z.buffer).equals(Buffer.from(b.z.buffer))).toBe(true);
      expect(Buffer.from(a.height.buffer).equals(Buffer.from(b.height.buffer))).toBe(
        true,
      );
    }
    const flowersAgain = buildFlowerPositions();
    expect(
      Buffer.from(flowersAgain.x.buffer).equals(Buffer.from(flowers.x.buffer)),
    ).toBe(true);
  });

  it("clears furniture without ever deleting grass", () => {
    expect(clearingScale(0, 0)).toBeCloseTo(0.4, 3);
    expect(clearingScale(-3.5, -0.3)).toBeCloseTo(0.4, 3);
    expect(clearingScale(10, -10)).toBe(1);
    for (let x = -6; x <= 30; x += 0.7) {
      for (let z = -4; z <= 4; z += 0.7) {
        expect(clearingScale(x, z)).toBeGreaterThanOrEqual(0.4);
      }
    }
  });

  it("feathers the western flank instead of cutting it", () => {
    // The walk phase of the seat transition can face this flank directly,
    // so the boundary must be a density fade, not a line the check script
    // would otherwise have to prove unreachable.
    for (let z = -10; z <= 11; z += 0.9) {
      const west = unionWestX(z);
      if (!Number.isFinite(west)) continue;
      expect(westFeatherScale(west, z)).toBeLessThanOrEqual(0.13);
      expect(westFeatherScale(west + WEST_FEATHER.span, z)).toBeCloseTo(1, 5);
      expect(inWestFeather(west, z)).toBe(true);
      expect(inWestFeather(west + WEST_FEATHER.span + 1, z)).toBe(false);
    }
    // The seated band's east flank past the front line fades the same way.
    for (let z = 5.2; z <= 11; z += 1.1) {
      const east = SEAT_X + 3.2 + (z - SEAT_Z) * 1.017 + 0.6;
      expect(eastFeatherScale(east, z)).toBeLessThanOrEqual(0.13);
      expect(eastFeatherScale(east - EAST_FEATHER.span, z)).toBeCloseTo(1, 5);
      expect(inEastFeather(east, z)).toBe(true);
    }
    // The far line thins out the same way.
    expect(farFeatherScale(5.8 - 24)).toBeLessThanOrEqual(0.13);
    expect(farFeatherScale(5.8 - 24 + FAR_FEATHER.span)).toBeCloseTo(1, 5);
  });
});

describe("terrain silhouette", () => {
  it("stays under the shadow pools through the shelf strip", () => {
    for (let x = -8; x <= 32; x += 0.1) {
      for (let z = -3; z <= 1; z += 0.1) {
        expect(meadowHeight(x, z)).toBeLessThanOrEqual(MEADOW_SHELF_CEILING_Y);
      }
    }
  });

  it("is continuous everywhere, steep only on the authored skirts", () => {
    const step = 0.2;
    for (let x = MEADOW_TERRAIN.minX; x <= MEADOW_TERRAIN.maxX; x += step) {
      for (let z = MEADOW_TERRAIN.minZ; z <= MEADOW_TERRAIN.maxZ - step; z += step) {
        const jump = Math.abs(meadowHeight(x, z + step) - meadowHeight(x, z));
        const onSkirt =
          z + step > MEADOW_BANK.skirtZ - 1e-6 || z < -24.5 + step + 1e-6;
        // Measured worst: 0.093 off-skirt, 0.30 on the 1.1/unit far skirt.
        expect(jump).toBeLessThanOrEqual(onSkirt ? 0.36 : 0.16);
      }
    }
  });

  it("lands the far-ridge crest inside the skyline fade band", () => {
    const eyes = [
      { y: 0.25, z: 5.8 }, // desktop
      { y: 0.3, z: 7.6 }, // phone / tablet
    ];
    for (const eye of eyes) {
      const dz = eye.z - -24.5;
      for (let ex = -1.2; ex <= 26.4; ex += 2.76) {
        for (let x = MEADOW_TERRAIN.minX; x <= MEADOW_TERRAIN.maxX; x += 0.5) {
          if (Math.abs(x - ex) > LATERAL_REACH * dz) continue; // beyond widest frustum
          const dist = Math.hypot(dz, x - ex);
          const e = Math.atan((ridgeCrestY(x) - eye.y) / dist);
          expect(e).toBeGreaterThanOrEqual(-0.098);
          expect(e).toBeLessThanOrEqual(-0.021);
        }
      }
    }
  });

  it("caps the flanking swells below every drawn landmark", () => {
    const apexNear = (cx: number, cz: number) => {
      let best = { x: cx, z: cz, y: -Infinity };
      for (let x = cx - 6; x <= cx + 6; x += 0.1) {
        for (let z = cz - 6; z <= cz + 6; z += 0.1) {
          const y = meadowHeight(x, z);
          if (y > best.y) best = { x, z, y };
        }
      }
      return best;
    };
    const aL = apexNear(-13, -22);
    const aR = apexNear(38, -21);
    for (const ex of [-1.2, 2, 6, 13, 20, 26.4]) {
      for (const a of [aL, aR]) {
        // Eye y 0.14 — the LOW bob — is the steepest sightline any pose has.
        const e = Math.atan(
          (a.y - 0.14) / Math.hypot(a.x - ex, a.z - 5.8),
        );
        // Sutro's lowest drawn pixel is e 0.010, the GGB deck 0.038 — an
        // apex under 0.009 can never touch either.
        expect(e).toBeLessThanOrEqual(0.009);
      }
    }
  });

  it("keeps the swells' above-horizon spans clear of the bridges", () => {
    const pan = (ex: number) =>
      Math.min(1, Math.max(0, ex / 26.4)) * 0.6 - 0.25;
    // S_L: every above-horizon sample stays ≥ 0.015 rad left of the GGB
    // window's left edge (dome az −2.102) from every eye that can frame it.
    for (const ex of [-1.2, 0, 2, 4, 6, 8]) {
      for (let x = -21; x <= -5; x += 0.2) {
        for (let z = -30; z <= -14; z += 0.2) {
          const dist = Math.hypot(x - ex, z - 5.8);
          const e = Math.atan((meadowHeight(x, z) - 0.25) / dist);
          if (e <= -0.002) continue;
          expect(Math.atan2(z - 5.8, x - ex) + pan(ex)).toBeLessThanOrEqual(
            -2.102 - 0.015,
          );
        }
      }
    }
    // S_R: stays right of the Bay Bridge's right edge (dome az −1.027).
    for (const ex of [13.2, 18, 22, 26.4]) {
      for (let x = 30; x <= 46; x += 0.2) {
        for (let z = -29; z <= -13; z += 0.2) {
          const dist = Math.hypot(x - ex, z - 5.8);
          const e = Math.atan((meadowHeight(x, z) - 0.25) / dist);
          if (e <= -0.002) continue;
          expect(
            Math.atan2(z - 5.8, x - ex) + pan(ex),
          ).toBeGreaterThanOrEqual(-1.027 + 0.015);
        }
      }
    }
  });

  it("cuts the seated bank against open water with a hidden skirt", () => {
    const dCrest = MEADOW_BANK.skirtZ - SEAT_Z;
    const crestE = (theta: number) => {
      const x = SEAT_X + Math.tan(theta) * dCrest;
      const y = meadowHeight(x, MEADOW_BANK.skirtZ);
      return Math.atan(((y - SEAT_Y) * Math.cos(theta)) / dCrest);
    };
    // Central composition band (the plan's derivation): the bank holds the
    // bottom ~14% of the seated frame under a wide strip of open Potomac.
    for (let t = -0.3; t <= 0.3; t += 0.002) {
      expect(crestE(t)).toBeGreaterThanOrEqual(-0.115);
      expect(crestE(t)).toBeLessThanOrEqual(-0.093);
    }
    // Full 21:9 seated frustum + margin: at wide azimuths the crest sits
    // farther out and reads shallower — geometry caps it at the base-plain
    // elevation (−0.086 at the corner), so the tight central band cannot
    // hold there. What matters is staying far below the waterline (e = 0,
    // with every far-shore structure above it): ≤ −0.06 everywhere.
    for (let t = -0.7923; t <= 0.7923; t += 0.002) {
      expect(crestE(t)).toBeLessThanOrEqual(-0.06);
      // Skirt occlusion: the sight ray over the crest descends at most
      // ~0.11 per unit z; the skirt drops 0.9 — the terrain edge is
      // unreachable from the seat.
      const x = SEAT_X + Math.tan(t) * dCrest;
      const rayFall = (SEAT_Y - meadowHeight(x, MEADOW_BANK.skirtZ)) / dCrest;
      expect(rayFall).toBeLessThan(MEADOW_BANK.skirtDrop - 0.5);
    }
  });
});
