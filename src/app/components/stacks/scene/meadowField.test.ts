import { describe, expect, it } from "vitest";

import { GOLF_COURSE_CENTER, suppressGolfVegetation } from "./golf/golfCourse";
import {
  EAST_FEATHER,
  FAR_FEATHER,
  FLING_APRON_FLOWERS,
  FLING_GRASS_APRON,
  FLOWER_BACKGROUND_DENSITY,
  FLOWER_BACKGROUND_LIFT,
  FLOWER_CLUSTER,
  FLOWER_LIFT,
  FLOWER_VARIATION,
  GRASS_BANDS,
  GRASS_ROOT_SINK,
  GRASS_STILL_ENVELOPE,
  type GrassInstances,
  HORIZON_RIDGE,
  LATERAL_REACH,
  MEADOW_BANK,
  MEADOW_FLOWER_TOTAL,
  MEADOW_FURNITURE_ALL,
  MEADOW_GRASS_TOTAL,
  MEADOW_RUNG_FLOWERS,
  MEADOW_RUNG_FRACTIONS,
  MEADOW_RUNG_GRASS,
  MEADOW_RUNG_GRASS_FAR,
  MEADOW_RUNG_GRASS_NEAR,
  MEADOW_SHELF_CEILING_Y,
  MEADOW_TERRAIN,
  MEADOW_TILE_SIZE,
  NEAR_FEATHER_ZONE,
  TRAVERSE_BAND_SLACK,
  TRAVERSE_EYE,
  UNDER_SHELF_GRASS_TIP_Y,
  VEGETATION_FRONT_Z,
  WEST_FEATHER,
  buildFlowerPositions,
  buildGrassInstances,
  buildMeadowTiles,
  clearanceScale,
  eastFeatherScale,
  farFeatherScale,
  flingApronHeightScale,
  flowerCanopyLift,
  flowerSurvivesBackgroundThinning,
  grassFocusHeightScale,
  grassShade,
  grassStillLiftWeight,
  grassTuftHorizontalReach,
  grassTuftNormalizationScale,
  horizonCrestY,
  inEastFeather,
  inWestFeather,
  meadowHeight,
  midGrassHeight,
  midGrassWidth,
  nearGrassHeight,
  nearGrassWidth,
  ridgeGrassWidth,
  shadeScale,
  traverseGrassDensityWeight,
  underLowerShelf,
  unionWestX,
  westFeatherScale,
} from "./meadowField";
import { ABOUT_COUCH, SEAT_POSE } from "./seated";
import { SHELF_GEOMETRY } from "./shelfGeometry";
import { TRAINING_BARBELL_POSE } from "./units/unitShelfLayout";
import { TRAVEL_X, UNIT_SPACING, unitPose } from "./worldLayout";

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
    expect(MEADOW_RUNG_FLOWERS).toEqual([
      MEADOW_FLOWER_TOTAL,
      MEADOW_FLOWER_TOTAL,
      MEADOW_FLOWER_TOTAL,
      MEADOW_FLOWER_TOTAL,
    ]);
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
      expect(
        grass.near.rungCounts[ri]! /
          (GRASS_BANDS.near.count + GRASS_BANDS.apron.count),
      ).toBeCloseTo(frac, 2);
      const perBand = [0, 0, 0, 0, 0];
      for (let i = 0; i < grass.near.rungCounts[ri]!; i++) {
        perBand[grass.near.band[i]!] = (perBand[grass.near.band[i]!] ?? 0) + 1;
      }
      for (let i = 0; i < grass.far.rungCounts[ri]!; i++) {
        perBand[grass.far.band[i]!] = (perBand[grass.far.band[i]!] ?? 0) + 1;
      }
      expect(perBand[1]! / GRASS_BANDS.mid.count).toBeCloseTo(frac, 2);
      expect(perBand[2]! / GRASS_BANDS.seated.count).toBeCloseTo(frac, 2);
      expect(perBand[3]! / GRASS_BANDS.ridge.count).toBeCloseTo(frac, 2);
      expect(perBand[4]! / GRASS_BANDS.apron.count).toBeCloseTo(frac, 2);
    });
  });
});

describe("grass tuft LOD normalization", () => {
  it("corrects cheap-LOD coverage without stretching its cards to full size", () => {
    const full = grassTuftNormalizationScale(0.13, 0.13);
    const reduced = grassTuftNormalizationScale(0.15, 0.13);
    const minimal = grassTuftNormalizationScale(0.2, 0.13);

    expect(reduced.x).toBe(full.x);
    expect(reduced.z).toBe(full.z);
    expect(minimal.x).toBeLessThan(full.x);
    expect(minimal.z).toBeLessThan(full.z);
    expect(minimal.x).toBeGreaterThan(minimal.y);
    expect(reduced.y).toBeLessThan(full.y);
    expect(minimal.y).toBeLessThan(reduced.y);
  });
});

describe("near-lawn coverage", () => {
  const worldPoint = (unit: number, localX: number, localZ: number) => {
    const pose = unitPose(unit);
    const yaw = pose.rotation[1];
    return {
      x: pose.position[0] + localX * Math.cos(yaw) + localZ * Math.sin(yaw),
      z: pose.position[2] - localX * Math.sin(yaw) + localZ * Math.cos(yaw),
    };
  };

  const safetyCoverageP99 = (
    center: { x: number; z: number },
    halfWidth: number,
    halfDepth: number,
  ) => {
    const grass = buildGrassInstances();
    const distances: number[] = [];
    for (let z = center.z - halfDepth; z <= center.z + halfDepth; z += 0.2) {
      for (let x = center.x - halfWidth; x <= center.x + halfWidth; x += 0.2) {
        let nearest = Number.POSITIVE_INFINITY;
        for (const stream of [grass.near, grass.far]) {
          for (let i = 0; i < stream.rungCounts[0]!; i += 1) {
            if (stream.band[i] !== 0 && stream.band[i] !== 1) continue;
            nearest = Math.min(
              nearest,
              Math.hypot(x - stream.x[i]!, z - stream.z[i]!),
            );
          }
        }
        distances.push(nearest);
      }
    }
    distances.sort((a, b) => a - b);
    return distances[Math.floor(distances.length * 0.99)]!;
  };

  it("overlaps the near and midfield bands instead of exposing a root seam", () => {
    expect(GRASS_BANDS.near.d1 - GRASS_BANDS.mid.d0).toBeGreaterThanOrEqual(1);
  });

  it("keeps the barbell rear and About approach covered at Safety density", () => {
    const barbell = worldPoint(
      2,
      TRAINING_BARBELL_POSE.base[0],
      TRAINING_BARBELL_POSE.base[2],
    );
    const couch = worldPoint(0, ABOUT_COUCH.x, ABOUT_COUCH.z);

    expect(
      safetyCoverageP99({ x: barbell.x, z: TRAVERSE_EYE.z - 14 }, 2.2, 1),
    ).toBeLessThan(0.4);
    expect(
      safetyCoverageP99({ x: couch.x, z: couch.z - 3.2 }, 3, 3.2),
    ).toBeLessThan(0.4);
  });

  it("raises the grass behind the shelves into the midfield height", () => {
    const shelfHeight = nearGrassHeight(5.8, 0.5);
    const rearHeight = nearGrassHeight(14, 0.5);

    expect(rearHeight).toBeGreaterThan(shelfHeight * 1.4);
    expect(rearHeight).toBeCloseTo(midGrassHeight(14, 0.5), 2);
  });

  it("fills the shelf seam without stretching the middle into flat fans", () => {
    const shelfWidth = nearGrassWidth(5.8, 0.5);
    const backWidth = nearGrassWidth(14, 0.5);

    expect(shelfWidth).toBeGreaterThan(0.56);
    expect(backWidth).toBeGreaterThan(shelfWidth * 1.1);
    expect(backWidth).toBeLessThan(shelfWidth * 1.15);
    expect(buildGrassInstances().near.count).toBe(MEADOW_RUNG_GRASS_NEAR[3]);
  });

  it("moves broad overlap out of the midfield and onto the hill", () => {
    expect(midGrassWidth(24, 0.5)).toBeLessThan(0.75);
    expect(ridgeGrassWidth(0.5)).toBeGreaterThan(1.7);
  });

  it("redistributes roots from outer margins into the critical views", () => {
    const training = unitPose(2);
    const barbellX =
      training.position[0] +
      TRAINING_BARBELL_POSE.base[0] * Math.cos(training.rotation[1]) +
      TRAINING_BARBELL_POSE.base[2] * Math.sin(training.rotation[1]);
    const barbellZ =
      training.position[2] -
      TRAINING_BARBELL_POSE.base[0] * Math.sin(training.rotation[1]) +
      TRAINING_BARBELL_POSE.base[2] * Math.cos(training.rotation[1]);

    const betweenShelves = unitPose(0).position[0] + 0.5 * UNIT_SPACING;
    const couch = worldPoint(0, ABOUT_COUCH.x, ABOUT_COUCH.z);
    expect(traverseGrassDensityWeight(betweenShelves, -4)).toBe(0.86);
    expect(traverseGrassDensityWeight(couch.x, couch.z - 3.2)).toBe(1);
    expect(traverseGrassDensityWeight(TRAVEL_X + 4, -4)).toBe(0.42);
    expect(traverseGrassDensityWeight(barbellX, barbellZ - 2.4)).toBe(1);
    expect(
      traverseGrassDensityWeight(
        GOLF_COURSE_CENTER.x + 3.4,
        GOLF_COURSE_CENTER.z - 2.3,
      ),
    ).toBe(1);
    expect(buildGrassInstances().near.count).toBe(MEADOW_RUNG_GRASS_NEAR[3]);
    expect(buildGrassInstances().far.count).toBe(MEADOW_RUNG_GRASS_FAR[3]);
  });

  it("lifts sparse focus grass without raising the surrounding field", () => {
    const training = unitPose(2);
    const barbellX =
      training.position[0] +
      TRAINING_BARBELL_POSE.base[0] * Math.cos(training.rotation[1]) +
      TRAINING_BARBELL_POSE.base[2] * Math.sin(training.rotation[1]);
    const barbellZ =
      training.position[2] -
      TRAINING_BARBELL_POSE.base[0] * Math.sin(training.rotation[1]) +
      TRAINING_BARBELL_POSE.base[2] * Math.cos(training.rotation[1]);

    expect(grassFocusHeightScale(barbellX, barbellZ - 2.4)).toBeCloseTo(1.14);
    expect(grassFocusHeightScale(20, -4)).toBe(1);
  });
});

describe("spatial meadow tiles", () => {
  const grass = buildGrassInstances();
  const flowers = buildFlowerPositions();

  const verifyPartition = (
    stream: Pick<typeof grass.near, "count" | "rungCounts" | "x" | "z">,
  ) => {
    const tiles = buildMeadowTiles(stream);
    const seen = new Uint8Array(stream.count);

    expect(tiles.length).toBeGreaterThan(1);
    for (const tile of tiles) {
      expect(tile.indices.length).toBeGreaterThan(0);
      expect(tile.maxX - tile.minX).toBe(MEADOW_TILE_SIZE.x);
      expect(tile.maxZ - tile.minZ).toBe(MEADOW_TILE_SIZE.z);

      for (const index of tile.indices) {
        expect(seen[index]).toBe(0);
        seen[index] = 1;
        expect(stream.x[index]!).toBeGreaterThanOrEqual(tile.minX);
        expect(stream.x[index]!).toBeLessThan(tile.maxX);
        expect(stream.z[index]!).toBeGreaterThanOrEqual(tile.minZ);
        expect(stream.z[index]!).toBeLessThan(tile.maxZ);
      }

      // A local rung is exactly the matching source-rung prefix in this
      // cell. Tiling therefore cannot create a density seam or activate a
      // lower-quality instance before its authored rung.
      stream.rungCounts.forEach((sourceEnd, rung) => {
        const active = [...tile.indices.slice(0, tile.rungCounts[rung])];
        const expected = [...tile.indices].filter((index) => index < sourceEnd);
        expect(active).toEqual(expected);
      });
    }

    expect([...seen].every((value) => value === 1)).toBe(true);
    stream.rungCounts.forEach((count, rung) => {
      expect(tiles.reduce((sum, tile) => sum + tile.rungCounts[rung]!, 0)).toBe(
        count,
      );
    });

    // Tile ordering retains the old front-to-back submission bias.
    for (let i = 1; i < tiles.length; i++) {
      const previous = tiles[i - 1]!;
      const current = tiles[i]!;
      expect(
        previous.iz > current.iz ||
          (previous.iz === current.iz && previous.ix < current.ix),
      ).toBe(true);
    }
  };

  it("covers every grass and flower exactly once with seamless cells", () => {
    verifyPartition(grass.near);
    verifyPartition(grass.far);
    verifyPartition(flowers);
  });

  it("is deterministic across builds", () => {
    const first = buildMeadowTiles(grass.far);
    const again = buildMeadowTiles(buildGrassInstances().far);
    expect(
      first.map(({ key, rungCounts, indices }) => ({
        key,
        rungCounts,
        indices: [...indices],
      })),
    ).toEqual(
      again.map(({ key, rungCounts, indices }) => ({
        key,
        rungCounts,
        indices: [...indices],
      })),
    );
  });

  it("optionally splits dense cells without changing any rung population", () => {
    const limit = 800;
    const legacy = buildMeadowTiles(grass.near);
    const balanced = buildMeadowTiles(grass.near, {
      maxPopulation: limit,
    });

    expect(
      Math.max(...legacy.map((tile) => tile.indices.length)),
    ).toBeGreaterThan(limit);
    expect(
      Math.max(...balanced.map((tile) => tile.indices.length)),
    ).toBeLessThanOrEqual(limit);
    expect(balanced.length).toBeGreaterThan(legacy.length);
    grass.near.rungCounts.forEach((count, rung) => {
      expect(
        balanced.reduce((sum, tile) => sum + tile.rungCounts[rung]!, 0),
      ).toBe(count);
    });
    expect(
      [...balanced.flatMap((tile) => [...tile.indices])].sort((a, b) => a - b),
    ).toEqual(Array.from({ length: grass.near.count }, (_, index) => index));
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
    // (tablet portrait at low eye bob with the pointer at the viewport's
    // bottom, z 4.75) — the old z = 3.25 front line violated this.
    expect(NEAR_FEATHER_ZONE.minZ).toBeGreaterThanOrEqual(4.75);
    expect(3.25).toBeLessThan(NEAR_FEATHER_ZONE.minZ);
  });

  it("keeps a camera-side grass apron outside the settled view", () => {
    const apronIndices: number[] = [];
    for (let i = 0; i < grass.near.count; i++) {
      if (grass.near.band[i] === 4) apronIndices.push(i);
    }

    expect(apronIndices).toHaveLength(FLING_GRASS_APRON.count);
    for (const i of apronIndices) {
      expect(grass.near.x[i]!).toBeGreaterThanOrEqual(FLING_GRASS_APRON.minX);
      expect(grass.near.x[i]!).toBeLessThanOrEqual(FLING_GRASS_APRON.maxX);
      expect(grass.near.z[i]!).toBeGreaterThanOrEqual(FLING_GRASS_APRON.minZ);
      expect(grass.near.z[i]!).toBeLessThanOrEqual(FLING_GRASS_APRON.maxZ);
    }
  });

  it("grows the camera-side apron in broad height drifts", () => {
    let low = Infinity;
    let high = -Infinity;
    for (let x = FLING_GRASS_APRON.minX; x <= FLING_GRASS_APRON.maxX; x += 1) {
      for (
        let z = FLING_GRASS_APRON.minZ;
        z <= FLING_GRASS_APRON.maxZ;
        z += 0.2
      ) {
        const scale = flingApronHeightScale(x, z);
        low = Math.min(low, scale);
        high = Math.max(high, scale);
      }
    }
    expect(low).toBeLessThan(0.9);
    expect(high).toBeGreaterThan(1.35);
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
      const expectedLift =
        flowers.apron[i] === 1
          ? FLOWER_LIFT
          : flowerCanopyLift(
              flowers.x[i]!,
              flowers.z[i]!,
              flowers.variation[i],
            );
      expect(flowers.y[i]!).toBeCloseTo(
        meadowHeight(flowers.x[i]!, flowers.z[i]!) + expectedLift,
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
      expect(Buffer.from(a.x.buffer).equals(Buffer.from(b.x.buffer))).toBe(
        true,
      );
      expect(Buffer.from(a.z.buffer).equals(Buffer.from(b.z.buffer))).toBe(
        true,
      );
      expect(
        Buffer.from(a.height.buffer).equals(Buffer.from(b.height.buffer)),
      ).toBe(true);
    }
    const flowersAgain = buildFlowerPositions();
    expect(
      Buffer.from(flowersAgain.x.buffer).equals(Buffer.from(flowers.x.buffer)),
    ).toBe(true);
  });

  it("preserves instances with unmown growth under furniture and at its edges", () => {
    const grass = buildGrassInstances();
    let full = 0;
    for (let i = 0; i < grass.near.count; i++) {
      if (grass.near.band[i] === 4) continue;
      const x = grass.near.x[i]!;
      const z = grass.near.z[i]!;
      if (x < -2 || x > 28 || z < -4) continue; // furniture strip only
      if (
        westFeatherScale(x, z) === 1 &&
        eastFeatherScale(x, z) === 1 &&
        farFeatherScale(z) === 1
      )
        full += 1;
      // Neither the global tiers nor furniture masks ever shrink the grass.
      expect(grass.near.height[i]!).toBeGreaterThanOrEqual(
        0.16 *
          0.8 *
          westFeatherScale(x, z) *
          eastFeatherScale(x, z) *
          farFeatherScale(z) *
          clearanceScale(x, z) -
          1e-6,
      );
      expect(clearanceScale(x, z)).toBeGreaterThanOrEqual(1);
    }
    expect(full).toBeGreaterThan(500); // the strip is genuinely populated
    expect(grass.near.count + grass.far.count).toBe(MEADOW_GRASS_TOTAL);
  });

  it("grows grass beneath shelves and a taller unmown apron at their edges", () => {
    // First shelf is centred at x=0 and has a 1.40-unit half-width mask.
    expect(clearanceScale(0, 0)).toBeCloseTo(1.22, 5);
    expect(clearanceScale(1.41, 0)).toBeGreaterThan(1.22);
    expect(clearanceScale(2.2, 0)).toBe(1);
  });

  it("keeps unmown grass tall without piercing the lower shelf plank", () => {
    const grass = buildGrassInstances();
    let checked = 0;
    for (const stream of [grass.near, grass.far]) {
      for (let i = 0; i < stream.count; i += 1) {
        if (!underLowerShelf(stream.x[i]!, stream.z[i]!)) continue;
        checked += 1;
        expect(stream.y[i]! + stream.height[i]!).toBeLessThanOrEqual(
          UNDER_SHELF_GRASS_TIP_Y + 1e-6,
        );
        expect(stream.height[i]!).toBeGreaterThan(0.14);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(100);
  });

  it("caps wide tufts whose cards reach a lower shelf from outside it", () => {
    const grass = buildGrassInstances();
    let checked = 0;
    for (const stream of [grass.near, grass.far]) {
      for (let i = 0; i < stream.count; i += 1) {
        const reach = grassTuftHorizontalReach(
          stream.width[i]!,
          stream.height[i]!,
        );
        if (!underLowerShelf(stream.x[i]!, stream.z[i]!, reach)) continue;
        checked += 1;
        expect(stream.y[i]! + stream.height[i]!).toBeLessThanOrEqual(
          UNDER_SHELF_GRASS_TIP_Y + 1e-6,
        );
      }
    }
    expect(checked).toBeGreaterThanOrEqual(500);
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

  it("drops the shadows of furniture that is not in the room", () => {
    // Screenshot mode keeps About's shelf and takes the other units and the
    // couch out; their baked contact shadows have to go with them, or the
    // lawn keeps a stain where a plank used to be.
    const header = { units: [0], couch: false } as const;
    expect(shadeScale(0, 0, header)).toBeLessThan(0.25); // About still casts
    expect(shadeScale(-3.41, 0, header)).toBe(1); // no couch, no shadow
    expect(shadeScale(unitPose(1).position[0], 0, header)).toBe(1); // Books
    expect(shadeScale(unitPose(3).position[0] + 1.98, -0.15, header)).toBe(1);
    expect(shadeScale(-3.41, 0, MEADOW_FURNITURE_ALL)).toBeLessThan(0.25);
    expect(shadeScale(-3.41, 0)).toBe(
      shadeScale(-3.41, 0, MEADOW_FURNITURE_ALL),
    );
    // The per-tuft recompute agrees with the baked channel for the full
    // room, and only ever lightens when furniture leaves.
    const grass = buildGrassInstances();
    const full = grassShade(grass.near, MEADOW_FURNITURE_ALL);
    const less = grassShade(grass.near, header);
    expect(Array.from(full)).toEqual(Array.from(grass.near.shade));
    let lightened = 0;
    for (let i = 0; i < grass.near.count; i++) {
      expect(less[i]!).toBeGreaterThanOrEqual(full[i]!);
      if (less[i]! > full[i]!) lightened += 1;
    }
    expect(lightened).toBeGreaterThan(0);
  });

  it("mows the apron of furniture that is not in the room, and grows the still's lawn", () => {
    const header = { units: [0], couch: false } as const;
    // The couch's unmown patch goes with the couch; About's own stays.
    expect(clearanceScale(-3.41, 0, header)).toBe(1);
    expect(clearanceScale(-3.41, 0)).toBeCloseTo(1.2, 5);
    expect(clearanceScale(0, 0, header)).toBeCloseTo(1.22, 5);
    expect(clearanceScale(unitPose(1).position[0], 0, header)).toBe(1);
    // The still's lift is zero on the About footprint and full clear of it;
    // its variation moves heights both ways; both ride under the shelf cap.
    expect(grassStillLiftWeight(0, 0)).toBe(0);
    expect(grassStillLiftWeight(1.4, 0.6)).toBe(0);
    expect(grassStillLiftWeight(3.2, 0)).toBe(1);
    expect(grassStillLiftWeight(0, -3)).toBe(1);
    // Both builds carry a still profile so they share the still's wider
    // envelope and land every tuft in the same place; only heights differ.
    const plain = buildGrassInstances(undefined, {
      furniture: header,
      still: { lift: 0, variation: 0 },
    });
    const still = buildGrassInstances(undefined, {
      furniture: header,
      still: { lift: 0.2, variation: 0 },
    });
    expect(still.near.count).toBe(plain.near.count);
    let taller = 0;
    let same = 0;
    for (let i = 0; i < plain.near.count; i++) {
      const x = plain.near.x[i]!;
      const z = plain.near.z[i]!;
      const ratio = still.near.height[i]! / plain.near.height[i]!;
      if (grassStillLiftWeight(x, z) === 0) {
        expect(ratio).toBeCloseTo(1, 5);
        same += 1;
      } else if (grassStillLiftWeight(x, z) === 1 && !underLowerShelf(x, z)) {
        expect(ratio).toBeCloseTo(1.2, 5);
        taller += 1;
      }
    }
    expect(same).toBeGreaterThan(20);
    expect(taller).toBeGreaterThan(500);
    const uneven = buildGrassInstances(undefined, {
      furniture: header,
      still: { lift: 0, variation: 0.1 },
    });
    let up = 0;
    let down = 0;
    for (let i = 0; i < plain.near.count; i++) {
      if (underLowerShelf(plain.near.x[i]!, plain.near.z[i]!)) continue;
      const ratio = uneven.near.height[i]! / plain.near.height[i]!;
      expect(ratio).toBeGreaterThanOrEqual(0.9 - 1e-6);
      expect(ratio).toBeLessThanOrEqual(1.1 + 1e-6);
      if (ratio > 1.001) up += 1;
      if (ratio < 0.999) down += 1;
    }
    expect(up).toBeGreaterThan(100);
    expect(down).toBeGreaterThan(100);
  });

  it("reaches the still's lawn west of the room's, back to the dollied frame bottom", () => {
    const room = buildGrassInstances();
    const still = buildGrassInstances(undefined, {
      furniture: { units: [0], couch: false },
      still: { lift: 0, variation: 0 },
    });
    // Near-band tufts west of `limit` on the shelf line (z within a unit of
    // it), where the room's trapezoid ends at x −8.6 and the still's runs
    // on past where a 4:1 frame dollied eight units back reaches (−16).
    const westOf = (stream: GrassInstances, limit: number, band: number) => {
      let count = 0;
      for (let i = 0; i < stream.count; i++)
        if (
          stream.band[i] === band &&
          stream.x[i]! < limit &&
          Math.abs(stream.z[i]!) <= 1
        )
          count += 1;
      return count;
    };
    expect(westOf(room.near, -9, 0)).toBe(0);
    expect(westOf(still.near, -12, 0)).toBeGreaterThan(60);
    expect(westOf(still.near, -18, 0)).toBeGreaterThan(5);
    // And nothing lands west of the extended edge, feather included.
    for (let i = 0; i < still.near.count; i++) {
      if (still.near.band[i] !== 0) continue;
      expect(still.near.x[i]!).toBeGreaterThanOrEqual(
        unionWestX(still.near.z[i]!, GRASS_STILL_ENVELOPE.west) - 1e-3,
      );
    }
    // The apron follows the camera back.
    const behind = (stream: GrassInstances, z: number) => {
      let count = 0;
      for (let i = 0; i < stream.count; i++)
        if (stream.band[i] === 4 && stream.z[i]! > z) count += 1;
      return count;
    };
    expect(behind(room.near, FLING_GRASS_APRON.maxZ + 0.01)).toBe(0);
    expect(behind(still.near, 9)).toBeGreaterThan(300);
    expect(still.near.count + still.far.count).toBeGreaterThan(
      (room.near.count + room.far.count) * 1.3,
    );
    // The feather sits at the new edge, not the old one.
    expect(westFeatherScale(-12, 0, GRASS_STILL_ENVELOPE.west)).toBeCloseTo(
      1,
      5,
    );
    expect(westFeatherScale(-12, 0)).toBeCloseTo(0.12, 5);
    // Flowers grow into the same field.
    const roomFlowers = buildFlowerPositions();
    const flatStillFlowers = buildFlowerPositions(undefined, {
      still: { lift: 0, variation: 0 },
    });
    const stillFlowers = buildFlowerPositions(undefined, {
      still: { lift: 0.2, variation: 0.1 },
    });
    expect(Array.from(stillFlowers.x)).toEqual(Array.from(flatStillFlowers.x));
    expect(Array.from(stillFlowers.z)).toEqual(Array.from(flatStillFlowers.z));
    let roomWest = 0;
    let stillWest = 0;
    let raisedFlowers = 0;
    for (let i = 0; i < roomFlowers.count; i++)
      if (roomFlowers.x[i]! < -12) roomWest += 1;
    for (let i = 0; i < stillFlowers.count; i++) {
      if (stillFlowers.x[i]! < -12) stillWest += 1;
      expect(stillFlowers.y[i]!).toBeGreaterThanOrEqual(flatStillFlowers.y[i]!);
      if (stillFlowers.y[i]! > flatStillFlowers.y[i]! + 1e-4)
        raisedFlowers += 1;
    }
    expect(stillWest).toBeGreaterThan(roomWest + 40);
    expect(raisedFlowers).toBeGreaterThan(500);
    expect(stillFlowers.count).toBeGreaterThan(roomFlowers.count * 2);
    // The dollied still exposes the grass apron past the ordinary room's
    // front edge. Flower clumps must follow it instead of leaving the newly
    // visible foreground as a flowerless strip.
    let stillForeground = 0;
    for (let i = 0; i < stillFlowers.count; i++)
      if (stillFlowers.apron[i] === 1 && stillFlowers.z[i]! > 9)
        stillForeground += 1;
    expect(stillForeground).toBeGreaterThan(300);
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
    // And the traverse trapezoid's own east flank, which the pointer's head
    // turn brings inside wide frames from the last stop.
    for (let z = 4; z >= -20; z -= 3) {
      const d = 5.8 - z;
      const east = TRAVEL_X + LATERAL_REACH * d + TRAVERSE_BAND_SLACK;
      expect(eastFeatherScale(east, z)).toBeLessThanOrEqual(0.13);
      expect(eastFeatherScale(east - EAST_FEATHER.span, z)).toBeCloseTo(1, 5);
      expect(inEastFeather(east, z)).toBe(true);
      expect(inEastFeather(east - EAST_FEATHER.span - 1, z)).toBe(false);
    }
    // The far line (the ridge band's tail since round 3) thins the same way.
    expect(farFeatherScale(5.8 - GRASS_BANDS.ridge.d1)).toBeLessThanOrEqual(
      0.13,
    );
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
      for (
        let z = MEADOW_TERRAIN.minZ;
        z <= MEADOW_TERRAIN.maxZ - step;
        z += step
      ) {
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
    for (
      let x = HORIZON_RIDGE.holdMinX;
      x <= HORIZON_RIDGE.holdMaxX;
      x += 0.1
    ) {
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
    for (
      let x = MEADOW_TERRAIN.minX;
      x <= MEADOW_TERRAIN.maxX - 0.2;
      x += 0.2
    ) {
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

  it("raises the middle background without reaching the grass canopy", () => {
    for (const depth of [10, 14, 18, 20]) {
      const z = TRAVERSE_EYE.z - depth;
      const lift = flowerCanopyLift(-8, z, 0.5);
      const canopy = Math.max(
        nearGrassHeight(depth, 0.5),
        midGrassHeight(depth, 0.5),
      );
      expect(lift).toBeGreaterThan(FLOWER_LIFT);
      expect(lift).toBeLessThan(canopy);
      expect(lift).toBeLessThanOrEqual(FLOWER_BACKGROUND_LIFT.max);
    }
  });

  it("has no flower-height ring at the near-to-midfield handoff", () => {
    const before = flowerCanopyLift(
      -8,
      TRAVERSE_EYE.z - GRASS_BANDS.mid.d0 + 0.001,
      0.5,
    );
    const after = flowerCanopyLift(
      -8,
      TRAVERSE_EYE.z - GRASS_BANDS.mid.d0 - 0.001,
      0.5,
    );
    expect(Math.abs(after - before)).toBeLessThan(0.001);
  });

  it("keeps the first half metre behind every shelf planted low", () => {
    for (let unit = 0; unit <= Math.round(TRAVEL_X / UNIT_SPACING); unit += 1) {
      const pose = unitPose(unit);
      const yaw = pose.rotation[1];
      const localZ =
        SHELF_GEOMETRY.top.centerZ -
        SHELF_GEOMETRY.top.depth / 2 -
        FLOWER_BACKGROUND_LIFT.shelfBackDepth * 0.5;
      const x = pose.position[0] + localZ * Math.sin(yaw);
      const z = pose.position[2] + localZ * Math.cos(yaw);
      expect(flowerCanopyLift(x, z, 0.5)).toBe(FLOWER_LIFT);
    }
  });

  it("settles ridge flowers into the shorter hill grass", () => {
    let checked = 0;
    for (let i = 0; i < flowers.count; i += 1) {
      if (flowers.apron[i] === 1) continue;
      const depth = TRAVERSE_EYE.z - flowers.z[i]!;
      if (depth < 24) continue;
      const lift = flowers.y[i]! - meadowHeight(flowers.x[i]!, flowers.z[i]!);
      expect(lift).toBeCloseTo(
        flowerCanopyLift(flowers.x[i]!, flowers.z[i]!, flowers.variation[i]),
        5,
      );
      if (depth >= FLOWER_BACKGROUND_LIFT.settleDepth[1])
        expect(lift).toBeCloseTo(FLOWER_LIFT, 5);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(300);
  });

  it("halves the visible flower population across the lower hill", () => {
    let visible = 0;
    for (let i = 0; i < flowers.count; i += 1) {
      const depth = TRAVERSE_EYE.z - flowers.z[i]!;
      if (depth >= 18 && depth < 24 && flowers.scale[i]! > 0) visible += 1;
    }
    expect(visible).toBeGreaterThanOrEqual(95);
    expect(visible).toBeLessThanOrEqual(170);
  });

  it("reduces only the field behind the shelves by thirty percent", () => {
    const cutoff = FLOWER_BACKGROUND_DENSITY.startDepth;
    expect(flowerSurvivesBackgroundThinning(cutoff - 0.001, 0)).toBe(true);
    expect(flowerSurvivesBackgroundThinning(cutoff, 0.299)).toBe(false);
    expect(flowerSurvivesBackgroundThinning(cutoff, 0.3)).toBe(true);

    let eligible = 0;
    let visible = 0;
    for (let i = 0; i < flowers.count; i += 1) {
      const depth = TRAVERSE_EYE.z - flowers.z[i]!;
      if (depth < 12 || depth >= 18) continue;
      const golf = suppressGolfVegetation(
        flowers.x[i]!,
        flowers.z[i]!,
        flowers.variation[i]!,
      );
      if (!golf.flowers) continue;
      eligible += 1;
      if (flowers.scale[i]! > 0) visible += 1;
    }
    expect(visible / eligible).toBeGreaterThan(0.66);
    expect(visible / eligible).toBeLessThan(0.74);
  });

  it("keeps planted high hills dense after shared rear thinning", () => {
    let middleVisible = 0;
    let highVisible = 0;
    for (let i = 0; i < flowers.count; i += 1) {
      if (flowers.scale[i]! <= 0) continue;
      const depth = TRAVERSE_EYE.z - flowers.z[i]!;
      if (depth >= 12 && depth < 18) middleVisible += 1;
      if (depth >= 24 && depth < GRASS_BANDS.ridge.d1) highVisible += 1;
    }
    expect(highVisible).toBeGreaterThan(middleVisible * 1.35);
    expect(highVisible).toBeLessThan(middleVisible * 1.7);

    for (let unit = 0; unit <= Math.round(TRAVEL_X / UNIT_SPACING); unit += 1) {
      const viewX = unitPose(unit).position[0];
      let middleInView = 0;
      let highInView = 0;
      for (let i = 0; i < flowers.count; i += 1) {
        if (flowers.scale[i]! <= 0) continue;
        const depth = TRAVERSE_EYE.z - flowers.z[i]!;
        if (Math.abs(flowers.x[i]! - viewX) >= depth * 0.55) continue;
        if (depth >= 12 && depth < 18) middleInView += 1;
        if (depth >= 24 && depth < GRASS_BANDS.ridge.d1) highInView += 1;
      }
      expect(highInView).toBeGreaterThanOrEqual(middleInView);
    }
  });

  it("never leaves a visible flower inside the golf clearing", () => {
    let cleared = 0;
    for (let i = 0; i < flowers.count; i += 1) {
      const golf = suppressGolfVegetation(
        flowers.x[i]!,
        flowers.z[i]!,
        flowers.variation[i]!,
      );
      if (golf.flowers) continue;
      expect(flowers.scale[i]).toBe(0);
      cleared += 1;
    }
    expect(cleared).toBeGreaterThan(20);
  });

  it("gives individual heads enough variation for tilt, size, and color", () => {
    let minVariation = Number.POSITIVE_INFINITY;
    let maxVariation = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < flowers.count; i += 1) {
      minVariation = Math.min(minVariation, flowers.variation[i]!);
      maxVariation = Math.max(maxVariation, flowers.variation[i]!);
    }

    expect(minVariation).toBeLessThan(0.05);
    expect(maxVariation).toBeGreaterThan(0.95);
    expect(FLOWER_VARIATION.tiltRadians).toBeGreaterThan(0.35);
    expect(FLOWER_VARIATION.aspect[1]).toBeGreaterThan(
      FLOWER_VARIATION.aspect[0],
    );
    expect(FLOWER_VARIATION.pixelFloor[1]).toBeGreaterThan(
      FLOWER_VARIATION.pixelFloor[0] * 1.4,
    );
    expect(FLOWER_VARIATION.value[1]).toBeGreaterThan(
      FLOWER_VARIATION.value[0],
    );
    expect(FLOWER_VARIATION.fieldScale[1]).toBeGreaterThan(
      FLOWER_VARIATION.fieldScale[0] * 2,
    );
    expect(FLOWER_VARIATION.rareColorFraction).toBeGreaterThan(0);
    expect(FLOWER_VARIATION.rareColorFraction).toBeLessThan(0.05);
    expect(FLOWER_CLUSTER.headsMax - FLOWER_CLUSTER.headsMin).toBeGreaterThan(
      3,
    );
  });

  it("adds sparse clusters to the camera-side apron", () => {
    const apron: number[] = [];
    for (let i = 0; i < flowers.count; i++) {
      if (flowers.apron[i] === 1) apron.push(i);
    }

    expect(apron).toHaveLength(FLING_APRON_FLOWERS.count);
    for (const i of apron) {
      expect(flowers.x[i]!).toBeGreaterThanOrEqual(
        FLING_APRON_FLOWERS.minX - 1e-5,
      );
      expect(flowers.x[i]!).toBeLessThanOrEqual(
        FLING_APRON_FLOWERS.maxX + 1e-5,
      );
      expect(flowers.z[i]!).toBeGreaterThanOrEqual(
        FLING_APRON_FLOWERS.minZ - 1e-5,
      );
      expect(flowers.z[i]!).toBeLessThanOrEqual(
        FLING_APRON_FLOWERS.maxZ + 1e-5,
      );
    }
  });

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
    // vTint thresholds in Meadow.tsx: A < 0.55 ≤ B < 0.75 ≤ C. Clusters
    // stay lattice-uniform inside the flower-only tint range.
    let a = 0;
    for (let i = 0; i < flowers.count; i++) {
      if (flowers.tint[i]! < 0.55) a += 1;
    }
    expect(a / flowers.count).toBeGreaterThan(0.45);
    expect(a / flowers.count).toBeLessThan(0.65);
  });

  it("does not generate the pale seed-head species", () => {
    for (let i = 0; i < flowers.count; i++) {
      expect(flowers.tint[i]!).toBeLessThan(0.92);
    }
  });
});
