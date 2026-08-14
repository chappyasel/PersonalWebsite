import { describe, expect, it } from "vitest";

import {
  EAST_FEATHER,
  FAR_FEATHER,
  FLOWER_CLUSTER,
  FLOWER_LIFT,
  GRASS_BANDS,
  GRASS_ROOT_SINK,
  HORIZON_RIDGE,
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
  eastFeatherScale,
  farFeatherScale,
  horizonCrestY,
  inEastFeather,
  inWestFeather,
  meadowHeight,
  shadeScale,
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
    // The far mesh holds three bands (mid + seated + ridge); the mid and
    // ridge bands overlap in z, so split by the audit band id.
    MEADOW_RUNG_FRACTIONS.forEach((frac, ri) => {
      expect(grass.near.rungCounts[ri]! / GRASS_BANDS.near.count).toBeCloseTo(
        frac,
        2,
      );
      const perBand = [0, 0, 0, 0];
      for (let i = 0; i < grass.far.rungCounts[ri]!; i++) {
        perBand[grass.far.band[i]!] = (perBand[grass.far.band[i]!] ?? 0) + 1;
      }
      expect(perBand[1]! / GRASS_BANDS.mid.count).toBeCloseTo(frac, 2);
      expect(perBand[2]! / GRASS_BANDS.seated.count).toBeCloseTo(frac, 2);
      expect(perBand[3]! / GRASS_BANDS.ridge.count).toBeCloseTo(frac, 2);
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
        expect(stream.z[i]!).toBeGreaterThanOrEqual(
          5.8 - GRASS_BANDS.ridge.d1 - 1e-4,
        );
        expect(stream.z[i]!).toBeLessThanOrEqual(MEADOW_BANK.skirtZ + 1e-6);
      }
    }
    for (let i = 0; i < flowers.count; i++) {
      expect(flowers.x[i]!).toBeGreaterThanOrEqual(MEADOW_TERRAIN.minX);
      expect(flowers.x[i]!).toBeLessThanOrEqual(MEADOW_TERRAIN.maxX);
      expect(flowers.z[i]!).toBeGreaterThanOrEqual(
        5.8 - GRASS_BANDS.ridge.d1 - 1e-4,
      );
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

  it("grows uniformly through the furniture strip (no clearings)", () => {
    // Owner round 2: grass must NOT thin or shorten around the shelves and
    // couch. Every tuft's height/width scale comes from the edge feathers
    // alone, so instances deep inside the field carry their full raw size.
    const grass = buildGrassInstances();
    let full = 0;
    for (let i = 0; i < grass.near.count; i++) {
      const x = grass.near.x[i]!;
      const z = grass.near.z[i]!;
      if (x < -2 || x > 28 || z < -4) continue; // furniture strip only
      if (
        westFeatherScale(x, z) === 1 &&
        eastFeatherScale(x, z) === 1 &&
        farFeatherScale(z) === 1
      )
        full += 1;
      // The raw near-band height floor is 0.16·0.8·(feathers). Anything
      // below it would mean a hidden per-position damping crept back in.
      expect(grass.near.height[i]!).toBeGreaterThanOrEqual(
        0.16 *
          0.8 *
          westFeatherScale(x, z) *
          eastFeatherScale(x, z) *
          farFeatherScale(z) -
          1e-6,
      );
    }
    expect(full).toBeGreaterThan(500); // the strip is genuinely populated
  });

  it("shades tufts under the furniture in color, never in geometry", () => {
    // The contact shadow is a mask (shadeScale → aShade, a direct
    // body-color multiplier in the shaders) built from projected occluder
    // BOXES whose penumbra/strength derive from underside height: deep
    // under the low bottom plank + couch, exactly 1 in open field, and the
    // shadow band hugs the plank footprint — a metre north of the shelf
    // line the lawn is already fully lit (the round-3 "far too large"
    // regression guard). The sun term stays pure slope shading.
    expect(shadeScale(0, 0)).toBeLessThan(0.25); // under both unit-0 planks
    expect(shadeScale(-3.41, 0)).toBeLessThan(0.25); // under the couch
    expect(shadeScale(10, -10)).toBe(1);
    expect(shadeScale(0, -2)).toBe(1); // north of the shelf: open lawn
    // The top plank's secondary is FAINT: on its front penumbra where the
    // bottom plank no longer reaches, the mask stays above 0.5.
    expect(shadeScale(0, 0.75)).toBeGreaterThan(0.5);
    const grass = buildGrassInstances();
    for (const stream of [grass.near, grass.far]) {
      for (let i = 0; i < stream.count; i += 31) {
        expect(stream.sun[i]!).toBeGreaterThanOrEqual(0);
        expect(stream.sun[i]!).toBeLessThanOrEqual(1);
        expect(stream.shade[i]!).toBeGreaterThanOrEqual(0);
        expect(stream.shade[i]!).toBeLessThanOrEqual(1);
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
    // The far line (the ridge band's tail since round 3) thins the same way.
    expect(farFeatherScale(5.8 - GRASS_BANDS.ridge.d1)).toBeLessThanOrEqual(0.13);
    expect(
      farFeatherScale(5.8 - GRASS_BANDS.ridge.d1 + FAR_FEATHER.span),
    ).toBeCloseTo(1, 5);
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

  it("authors the horizon ridge exactly at its crest plane", () => {
    // The ridge mask reaches 1 at HORIZON_RIDGE.z, so meadowHeight there IS
    // the authored crest line — no undulation, mid-roll, or bank leak can
    // push a measured silhouette past what horizonCrestY proves.
    for (let x = MEADOW_TERRAIN.minX; x <= MEADOW_TERRAIN.maxX; x += 0.37) {
      expect(meadowHeight(x, HORIZON_RIDGE.z)).toBeCloseTo(horizonCrestY(x), 6);
    }
  });

  it("rolls the held crest inside its provable elevation band", () => {
    // Derived envelope (see horizonCrestY, round 3 heights): from the
    // highest bobbed eye (phone, y 0.41, d 29.1) the lowest held crest
    // clears the horizon outright (e ≥ +0.008 — the water/sky band behind
    // the shelves is closed with margin); from the lowest bobbed eye
    // (desktop, y 0.14, d 27.3) the tallest crest stays under the e 0.036
    // cap, which itself sits under the GGB deck line (0.038).
    for (let x = HORIZON_RIDGE.holdMinX; x <= HORIZON_RIDGE.holdMaxX; x += 0.1) {
      const y = horizonCrestY(x);
      expect(y).toBeGreaterThanOrEqual(0.66);
      expect(y).toBeLessThanOrEqual(1.1);
      expect(Math.atan((y - 0.41) / 29.1)).toBeGreaterThanOrEqual(0.008);
      expect(Math.atan((y - 0.14) / 27.3)).toBeLessThanOrEqual(0.035);
    }
  });

  it("tapers below the horizon before the terrain's x-edges", () => {
    // An above-horizon crest that reached a rectangle x-edge would cut
    // against the sky — a fogged silhouette still has a shape. The tail
    // must be fully below-horizon strictly inside the rectangle.
    // The tapers widened with the round-3 crest raise; ≥ 2 units of
    // below-horizon tail still separate them from the rectangle edges
    // (and the fog cap's border-recovery band overlaps the tails, so the
    // tail region is also at 100% fog).
    expect(HORIZON_RIDGE.endMinX).toBeGreaterThan(MEADOW_TERRAIN.minX + 4);
    expect(HORIZON_RIDGE.endMaxX).toBeLessThan(MEADOW_TERRAIN.maxX - 2);
    for (let x = MEADOW_TERRAIN.minX; x <= HORIZON_RIDGE.endMinX; x += 0.2) {
      expect(horizonCrestY(x)).toBeLessThanOrEqual(HORIZON_RIDGE.tailY + 0.01);
    }
    for (let x = HORIZON_RIDGE.endMaxX; x <= MEADOW_TERRAIN.maxX; x += 0.2) {
      expect(horizonCrestY(x)).toBeLessThanOrEqual(HORIZON_RIDGE.tailY + 0.01);
    }
    // The taper itself is smooth — no cliff for a frame edge to catch.
    // (Worst analytic slope with the round-3 crest: ≈ 0.071 per 0.2 x at
    // the west taper's midpoint.)
    for (let x = MEADOW_TERRAIN.minX; x <= MEADOW_TERRAIN.maxX - 0.2; x += 0.2) {
      expect(
        Math.abs(horizonCrestY(x + 0.2) - horizonCrestY(x)),
      ).toBeLessThanOrEqual(0.09);
    }
  });

  it("cuts the seated bank against open water with a hidden skirt", () => {
    const dCrest = MEADOW_BANK.skirtZ - SEAT_Z;
    const crestE = (theta: number) => {
      const x = SEAT_X + Math.tan(theta) * dCrest;
      const y = meadowHeight(x, MEADOW_BANK.skirtZ);
      return Math.atan(((y - SEAT_Y) * Math.cos(theta)) / dCrest);
    };
    // Central composition band, re-derived for the round-2 bank (skirt at
    // 7.0 after the seated-pose screenshot check — 8.6 still read ~28% of
    // frame height): the grass line from the seat now reads at
    // e ≈ −0.196…−0.171 — two-thirds of the round-1 band height — under a
    // wide strip of open Potomac.
    for (let t = -0.3; t <= 0.3; t += 0.002) {
      expect(crestE(t)).toBeGreaterThanOrEqual(-0.199);
      expect(crestE(t)).toBeLessThanOrEqual(-0.168);
    }
    // Full 21:9 seated frustum + margin: at wide azimuths the crest sits
    // farther out and reads shallower. What matters is staying far below
    // the waterline (e = 0, with every far-shore structure above it):
    // ≤ −0.12 everywhere (worst corner measures ≈ −0.127).
    for (let t = -0.7923; t <= 0.7923; t += 0.002) {
      expect(crestE(t)).toBeLessThanOrEqual(-0.12);
      // Skirt occlusion: the sight ray over the crest descends at most
      // ~0.16 per unit z; the skirt drops 0.9 — the terrain edge is
      // unreachable from the seat.
      const x = SEAT_X + Math.tan(t) * dCrest;
      const rayFall = (SEAT_Y - meadowHeight(x, MEADOW_BANK.skirtZ)) / dCrest;
      expect(rayFall).toBeLessThan(MEADOW_BANK.skirtDrop - 0.5);
    }
  });
});

describe("flower clumps", () => {
  const flowers = buildFlowerPositions();

  it("shares one species tint per cluster at ~1/5 seed density", () => {
    const groups = new Map<number, number[]>();
    for (let i = 0; i < flowers.count; i++) {
      const tint = flowers.tint[i]!;
      expect(tint).toBeGreaterThanOrEqual(0);
      expect(tint).toBeLessThanOrEqual(1);
      const members = groups.get(tint) ?? [];
      members.push(i);
      groups.set(tint, members);
    }
    // ~1/5 of the heads are cluster seeds (4–6 heads each), and every head
    // carries its seed's tint — so distinct tints ≈ seed count.
    expect(groups.size).toBeGreaterThan(flowers.count / 8);
    expect(groups.size).toBeLessThan(flowers.count / 3);
    // Clump cohesion: heads sharing a seed stay inside the bounded gaussian
    // spread (Irwin–Hall caps an axis offset at ±3.46σ; clamps only shrink).
    const reach = 2 * 3.47 * FLOWER_CLUSTER.sigma;
    for (const members of groups.values()) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const i of members) {
        minX = Math.min(minX, flowers.x[i]!);
        maxX = Math.max(maxX, flowers.x[i]!);
        minZ = Math.min(minZ, flowers.z[i]!);
        maxZ = Math.max(maxZ, flowers.z[i]!);
      }
      expect(maxX - minX).toBeLessThanOrEqual(reach);
      expect(maxZ - minZ).toBeLessThanOrEqual(reach);
    }
  });

  it("keeps the shader's species split honest", () => {
    // vTint thresholds in Meadow.tsx: A < 0.55 ≤ B < 0.75 ≤ C. The seed
    // tints are lattice-uniform, so the head split stays near 55/20/25.
    let a = 0;
    for (let i = 0; i < flowers.count; i++) {
      if (flowers.tint[i]! < 0.55) a += 1;
    }
    expect(a / flowers.count).toBeGreaterThan(0.45);
    expect(a / flowers.count).toBeLessThan(0.65);
  });
});
