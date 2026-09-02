import { describe, expect, it } from "vitest";

import { VISION_RIDE_GRID_CELL_METRES } from "./visionRideCamera";
import {
  VISION_RIDE_MOUNTAIN_FACET_DEPTH_METRES,
  VISION_RIDE_MOUNTAIN_FACET_WIDTH_METRES,
  VISION_RIDE_MOUNTAIN_HEIGHT_METRES,
  VISION_RIDE_MOUNTAIN_HORIZON_METRES,
  VISION_RIDE_MOUNTAIN_NEAR_METRES,
  VISION_RIDE_PERIOD_METRES,
  VISION_RIDE_ROAD_HALF_WIDTH,
  VISION_RIDE_STAR_FEATHER,
  VISION_RIDE_STAR_MAX_ELEVATION,
  VISION_RIDE_STAR_MIN_ELEVATION,
  VISION_RIDE_STAR_SHELL_RADIUS_METRES,
  VISION_RIDE_STAR_SIZES,
  VISION_RIDE_STAR_TWINKLE,
  VISION_RIDE_SUN_DEPTH_METRES,
  VISION_RIDE_SUN_DIAMETER_METRES,
  VISION_RIDE_SUN_ELEVATION_METRES,
  VISION_RIDE_TRACK_INCURSION_MAX_METRES,
  VISION_RIDE_VALLEY_SPREAD_METRES,
  deterministicStarSizes,
  deterministicStarTwinkle,
  deterministicStars,
  facetedMountainHeight,
  generateUnifiedLandscape,
  mountainCoverageComplete,
  mountainTrackIncursion,
  mountainWindowOffsets,
  starClassForSize,
  starSpriteFeather,
  starTwinkle,
  visionRideTerrainSegments,
} from "./visionRideTerrain";

describe("Vision ride terrain", () => {
  it("builds one deterministic, periodic landscape for road and mountains", () => {
    const a = generateUnifiedLandscape();
    const b = generateUnifiedLandscape();
    expect(a.samples).toEqual(b.samples);
    for (let column = 0; column <= a.columns; column += 1) {
      const near = column * 3;
      const far = (a.rows * (a.columns + 1) + column) * 3;
      expect(a.samples[far]).toBe(a.samples[near]);
      expect(a.samples[far + 1]).toBeCloseTo(a.samples[near + 1]!, 6);
      expect(a.samples[far + 2]! - a.samples[near + 2]!).toBeCloseTo(
        -VISION_RIDE_PERIOD_METRES,
        6,
      );
    }
    expect(a.surfaceIndices).toHaveLength(a.rows * a.columns * 6);
  });

  it("uses one metre cells across the flat road and both mountain flanks", () => {
    const mesh = generateUnifiedLandscape();
    expect(VISION_RIDE_GRID_CELL_METRES).toBe(1);
    expect(mesh.rows).toBe(VISION_RIDE_PERIOD_METRES);
    expect(mesh.columns).toBe(
      (VISION_RIDE_ROAD_HALF_WIDTH + VISION_RIDE_VALLEY_SPREAD_METRES) * 2,
    );
    for (let row = 0; row <= mesh.rows; row += 1) {
      for (let column = 0; column <= mesh.columns; column += 1) {
        const index = (row * (mesh.columns + 1) + column) * 3;
        const x = mesh.samples[index]!;
        const y = mesh.samples[index + 1]!;
        const z = mesh.samples[index + 2]!;
        expect(x).toBeCloseTo(-50 + column * VISION_RIDE_GRID_CELL_METRES, 6);
        expect(z).toBeCloseTo(-row * VISION_RIDE_GRID_CELL_METRES, 6);
        if (
          Math.abs(x) <=
          VISION_RIDE_ROAD_HALF_WIDTH - VISION_RIDE_TRACK_INCURSION_MAX_METRES
        )
          expect(y).toBe(0);
      }
    }
  });

  it("keeps quality tiers out of the shared landscape topology", () => {
    const full = visionRideTerrainSegments("full");
    const reduced = visionRideTerrainSegments("reduced");
    const minimal = visionRideTerrainSegments("minimal");
    expect(full.rows).toBe(reduced.rows);
    expect(reduced.rows).toBe(minimal.rows);
    expect(full.columns).toBe(reduced.columns);
    expect(reduced.columns).toBe(minimal.columns);
    expect(full.stars).toBe(1_700);
    expect(reduced.stars / full.stars).toBeCloseTo(0.65, 1);
    expect(minimal.stars / full.stars).toBeCloseTo(0.38, 1);
    expect(deterministicStars(full.stars)).toHaveLength(full.stars * 3);
    expect(deterministicStarSizes(full.stars)).toHaveLength(full.stars);
    expect(deterministicStarTwinkle(full.stars)).toHaveLength(full.stars);
    expect(Math.max(...deterministicStarSizes(full.stars))).toBeGreaterThan(5);
  });

  it("uses periodic triangular facets instead of a smooth rolling field", () => {
    for (const side of [-1, 1] as const) {
      expect(facetedMountainHeight(17, 31, side)).toBeCloseTo(
        facetedMountainHeight(137, 31, side),
        7,
      );
    }
    // Samples inside one control triangle are coplanar. The fine metre grid
    // follows the face without smoothing it into a rolling height field.
    const depth = VISION_RIDE_MOUNTAIN_FACET_DEPTH_METRES * 0.2;
    const start = VISION_RIDE_MOUNTAIN_FACET_WIDTH_METRES * 2;
    const a = facetedMountainHeight(depth, start + 0.4, 1);
    const b = facetedMountainHeight(depth, start + 1.4, 1);
    const midpoint = facetedMountainHeight(depth, start + 0.9, 1);
    expect(midpoint).toBeCloseTo((a + b) / 2, 6);

    const mesh = generateUnifiedLandscape();
    const outerColumn = mesh.columns;
    const heights = Array.from({ length: mesh.rows + 1 }, (_, row) => {
      const index = (row * (mesh.columns + 1) + outerColumn) * 3;
      return mesh.samples[index + 1]!;
    });
    let sharpestTurn = 0;
    for (let row = 1; row < heights.length - 1; row += 1) {
      sharpestTurn = Math.max(
        sharpestTurn,
        Math.abs(heights[row - 1]! - 2 * heights[row]! + heights[row + 1]!),
      );
    }
    expect(sharpestTurn).toBeGreaterThan(2.5);
  });

  it("aligns the road edges to exact grid columns", () => {
    expect(VISION_RIDE_ROAD_HALF_WIDTH % VISION_RIDE_GRID_CELL_METRES).toBe(0);
  });

  it("occasionally lets a bounded mountain foot break into the road edge", () => {
    const mesh = generateUnifiedLandscape();
    const edgeColumns = [
      50 - VISION_RIDE_ROAD_HALF_WIDTH,
      50 + VISION_RIDE_ROAD_HALF_WIDTH,
    ];
    const edgeHeights = edgeColumns.flatMap((column) =>
      Array.from({ length: mesh.rows + 1 }, (_, row) => {
        const index = (row * (mesh.columns + 1) + column) * 3;
        return mesh.samples[index + 1]!;
      }),
    );
    expect(Math.max(...edgeHeights)).toBeGreaterThan(0.5);
    const nearTrackColumn = 50 + VISION_RIDE_ROAD_HALF_WIDTH + 1;
    const nearTrackHeights = Array.from(
      { length: mesh.rows + 1 },
      (_, row) =>
        mesh.samples[(row * (mesh.columns + 1) + nearTrackColumn) * 3 + 1]!,
    );
    expect(Math.max(...nearTrackHeights)).toBeGreaterThan(2.5);
    for (const side of [-1, 1] as const) {
      for (
        let distance = 0;
        distance <= VISION_RIDE_PERIOD_METRES;
        distance += 1
      ) {
        const incursion = mountainTrackIncursion(distance, side);
        expect(incursion).toBeGreaterThanOrEqual(0);
        expect(incursion).toBeLessThanOrEqual(
          VISION_RIDE_TRACK_INCURSION_MAX_METRES,
        );
      }
    }
  });

  it("varies star sizes with a small hero fraction at every budget", () => {
    const { dust, bright, hero, heroFraction, brightFraction } =
      VISION_RIDE_STAR_SIZES;
    expect(hero.min).toBeGreaterThanOrEqual(24);
    expect(hero.max).toBeLessThanOrEqual(34);
    expect(heroFraction).toBeGreaterThanOrEqual(0.02);
    expect(heroFraction).toBeLessThanOrEqual(0.025);
    for (const tier of ["full", "reduced", "minimal"] as const) {
      const count = visionRideTerrainSegments(tier).stars;
      const sizes = Array.from(deterministicStarSizes(count));
      const heroes = sizes.filter((size) => size >= hero.min).length;
      const brights = sizes.filter(
        (size) => size >= bright.min && size < hero.min,
      ).length;
      // Around 1.6 % heroes: a handful of sparkles, never a field of them.
      expect(heroes / count).toBeGreaterThan(heroFraction * 0.4);
      expect(heroes / count).toBeLessThan(heroFraction * 2.2);
      expect(brights / count).toBeGreaterThan(brightFraction * 0.6);
      expect(brights / count).toBeLessThan(brightFraction * 1.5);
      for (const size of sizes) {
        expect(size).toBeGreaterThanOrEqual(dust.min);
        expect(size).toBeLessThanOrEqual(hero.max);
      }
      // Genuinely varied, not three fixed steps.
      expect(
        new Set(sizes.map((size) => size.toFixed(2))).size,
      ).toBeGreaterThan(40);
    }
    expect(starClassForSize(hero.min)).toBe("hero");
    expect(starClassForSize(bright.min)).toBe("bright");
    expect(starClassForSize(dust.max)).toBe("dust");
  });

  it("twinkles visibly, per star, and holds still under reduced motion", () => {
    const { floor, depth } = VISION_RIDE_STAR_TWINKLE;
    // Half the brightness swings: readable against the sky, never black.
    expect(depth).toBeGreaterThanOrEqual(0.4);
    expect(floor - depth).toBeGreaterThanOrEqual(0);
    expect(floor + depth).toBeLessThanOrEqual(1);
    const phases = Array.from(deterministicStarTwinkle(40));
    for (const phase of phases) {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (let t = 0; t < 12; t += 0.05) {
        const value = starTwinkle(t, phase, 1);
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      expect(max - min).toBeGreaterThan(2 * depth * 0.95);
      // Reduced motion: constant over time.
      expect(starTwinkle(7.3, phase, 0)).toBeCloseTo(
        starTwinkle(0, phase, 0),
        9,
      );
    }
    // Stars do not pulse in unison: at one instant the field is spread.
    const snapshot = phases.map((phase) => starTwinkle(3.1, phase, 1));
    expect(Math.max(...snapshot) - Math.min(...snapshot)).toBeGreaterThan(
      depth,
    );
  });

  it("feathers every sprite to zero before the point's square edge", () => {
    const { start, end } = VISION_RIDE_STAR_FEATHER;
    expect(end).toBeLessThan(0.5);
    expect(start).toBeLessThan(end);
    expect(starSpriteFeather(0)).toBe(1);
    expect(starSpriteFeather(start)).toBe(1);
    expect(starSpriteFeather(end)).toBe(0);
    // On the axes the sprite edge is r=0.5; a hero arm there is fully gone.
    expect(starSpriteFeather(0.5)).toBe(0);
    let previous = 1;
    for (let r = 0; r <= 0.71; r += 0.01) {
      const value = starSpriteFeather(r);
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
  });

  it("is deterministic across star generators", () => {
    expect(deterministicStarSizes(300)).toEqual(deterministicStarSizes(300));
    expect(deterministicStarTwinkle(300)).toEqual(
      deterministicStarTwinkle(300),
    );
    expect(deterministicStars(300)).toEqual(deterministicStars(300));
  });

  it("places every star on the forward upper shell", () => {
    const points = deterministicStars(visionRideTerrainSegments("full").stars);
    // Stars may geometrically overlap the newly taller ridges; normal terrain
    // depth occludes them. Keeping the low shell band populated matches the
    // reference instead of cutting a starless strip above the mountains.
    for (let index = 0; index < points.length; index += 3) {
      const x = points[index]!;
      const y = points[index + 1]!;
      const z = points[index + 2]!;
      const radius = Math.hypot(x, y, z);
      expect(radius).toBeCloseTo(VISION_RIDE_STAR_SHELL_RADIUS_METRES, 3);
      expect(y / radius).toBeGreaterThanOrEqual(
        VISION_RIDE_STAR_MIN_ELEVATION - 0.000_001,
      );
      // The budget is spent where the chase camera looks: the forward
      // hemisphere, below the portrait frame's top edge.
      expect(y / radius).toBeLessThanOrEqual(
        VISION_RIDE_STAR_MAX_ELEVATION + 0.000_001,
      );
      expect(z).toBeLessThanOrEqual(0.001);
    }
    expect(VISION_RIDE_STAR_MAX_ELEVATION).toBeLessThanOrEqual(0.75);
    // The shell sits deeper than any mountain but inside the sun's depth
    // only matters for ordering, which the world handles by draw order.
    expect(VISION_RIDE_STAR_SHELL_RADIUS_METRES).toBeGreaterThan(
      VISION_RIDE_PERIOD_METRES,
    );
  });

  it("shapes a broad, low valley rather than a canyon", () => {
    const mesh = generateUnifiedLandscape();
    let tallest = 0;
    for (let index = 0; index < mesh.samples.length; index += 3) {
      tallest = Math.max(tallest, mesh.samples[index + 1]!);
    }
    expect(tallest).toBeLessThanOrEqual(VISION_RIDE_MOUNTAIN_HEIGHT_METRES);
    expect(tallest).toBeGreaterThan(27);
    expect(VISION_RIDE_MOUNTAIN_HEIGHT_METRES).toBeCloseTo(30.6, 6);
    // The landscape remains wider than its maximum height, preserving a
    // readable valley while allowing the reference's much taller peaks.
    const halfWidth =
      VISION_RIDE_ROAD_HALF_WIDTH + VISION_RIDE_VALLEY_SPREAD_METRES;
    expect(halfWidth / tallest).toBeGreaterThan(1.6);
  });

  it("keeps continuous forward mountain coverage at every travel phase", () => {
    // Both flanks must stay filled from the camera through the fill's
    // dissolve end; phases bracket every 40 m chunk edge and the 120 m
    // recycle on both sides.
    const phases = [
      0, 0.1, 12.5, 39.9, 40, 40.1, 62.2, 79.9, 80, 80.1, 100, 119.9, 120,
      120.1, 245.7, 359.95, 360.05,
    ];
    for (const travel of phases) {
      expect(
        mountainCoverageComplete(travel, VISION_RIDE_MOUNTAIN_HORIZON_METRES),
      ).toBe(true);
    }
    expect(mountainWindowOffsets(0)).toHaveLength(3);
  });

  it("advances three copies of the landscape continuously across the recycle", () => {
    const [nearOffset, farOffset, horizonOffset] = mountainWindowOffsets(50);
    expect(nearOffset - farOffset).toBe(VISION_RIDE_PERIOD_METRES);
    expect(farOffset - horizonOffset).toBe(VISION_RIDE_PERIOD_METRES);
    // The wrap is a relabeling, not a jump: the near window just after the
    // recycle is the far window from just before, advanced by the same
    // travel delta.
    const before = mountainWindowOffsets(119.95);
    const after = mountainWindowOffsets(120.05);
    expect(after[0]).toBeCloseTo(before[1] + 0.1, 6);
    expect(after[0]).toBeCloseTo(0.05 + VISION_RIDE_MOUNTAIN_NEAR_METRES, 6);
    expect(after[1]).toBeCloseTo(
      0.05 + VISION_RIDE_MOUNTAIN_NEAR_METRES - VISION_RIDE_PERIOD_METRES,
      6,
    );
  });

  it("keeps the sun behind every recycled mountain layer", () => {
    // Depth-tested background: deeper than the three-copy landscape at
    // every travel phase. Apparent framing is calibrated as a 40 m disc at
    // the old 104 m reference distance; elevation keeps the 12 m @ 104 m
    // horizon seat.
    expect(VISION_RIDE_SUN_DEPTH_METRES).toBeGreaterThan(
      VISION_RIDE_MOUNTAIN_HORIZON_METRES,
    );
    expect(
      VISION_RIDE_SUN_DIAMETER_METRES / VISION_RIDE_SUN_DEPTH_METRES,
    ).toBeCloseTo(40 / 104, 1);
    expect(
      VISION_RIDE_SUN_ELEVATION_METRES / VISION_RIDE_SUN_DEPTH_METRES,
    ).toBeCloseTo(12 / 104, 2);
  });

  it("contains road and mountain vertices in every indexed surface draw", () => {
    const mesh = generateUnifiedLandscape();
    expect(mesh.surfaceIndices).toHaveLength(mesh.rows * mesh.columns * 6);
    const heights = Array.from(mesh.samples).filter(
      (_, index) => index % 3 === 1,
    );
    expect(heights).toContain(0);
    expect(Math.max(...heights)).toBeGreaterThan(17);
  });
});
