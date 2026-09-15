import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  MEADOW_FAR_TUFT_LOD,
  MEADOW_RUNG_GRASS_FAR,
  MEADOW_RUNG_GRASS_NEAR,
  buildFlowerPositions,
  buildGrassInstances,
  buildMeadowTiles,
  meadowContentPlan,
} from "./meadowField";
import {
  DEFAULT_SCENE_PERFORMANCE_SETTINGS,
  meadowTilePopulationLimit,
} from "./scenePerformance";

/**
 * What the meadow submits, in the units a GPU charges for.
 *
 * A census of one production frame put the meadow at 1,409k of the room
 * pass's 1,909k vertices — 74% of the scene's vertex work in 7% of its draws.
 * None of that is visible from the rung tables alone, because the expensive
 * half lives in the GLB: the near tuft is 66 triangles carried on 132
 * vertices, since it is 33 independent quads and nothing can be welded.
 *
 * So this reads the real model rather than restating a constant. Swapping the
 * tuft for a denser mesh, or raising a rung, changes a number here and says by
 * how much. The point is not that these values are optimal — it is that a
 * change to them should be a decision rather than a surprise.
 */
const TUFT_GLB = path.resolve(
  __dirname,
  "../../../../../public/models/grass-tuft.glb",
);

/** Vertex count of each LOD mesh in the tuft GLB, in LOD00..LOD02 order. */
function tuftLodVertexCounts(): number[] {
  const bytes = fs.readFileSync(TUFT_GLB);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString("utf8"),
  ) as {
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    accessors: { count: number }[];
  };
  return gltf.meshes.map(
    (mesh) => gltf.accessors[mesh.primitives[0]!.attributes.POSITION]!.count,
  );
}

describe("meadow submission budget", () => {
  const lods = tuftLodVertexCounts();

  it("carries the near tuft on 132 vertices for 66 triangles", () => {
    // 33 independent quads: two vertices per triangle, nothing shared. The
    // ratio is why per-instance work evaluated per vertex costs 132x here.
    expect(lods).toEqual([132, 64, 32]);
  });

  it("submits the vertices a full-quality frame is worth", () => {
    const plan = meadowContentPlan("full");
    expect(plan.nearTuftLod).toBe(0);
    expect(plan.farTuftLod).toBe(MEADOW_FAR_TUFT_LOD);
    const near = MEADOW_RUNG_GRASS_NEAR[3] * lods[plan.nearTuftLod]!;
    const far = MEADOW_RUNG_GRASS_FAR[3] * lods[plan.farTuftLod]!;
    expect(near).toBe(1_452_000);
    expect(far).toBe(384_000);
    // Before frustum culling, which removes about half of it in practice.
    expect(near + far).toBe(1_836_000);
  });

  it("spends its cheapest tier on the near lawn, never on the far one", () => {
    // Fog eats most of what the far band draws, so every tier leaves it on
    // the light LOD and buys its saving from the near tufts instead.
    for (const tier of ["full", "reduced", "minimal"] as const)
      expect(meadowContentPlan(tier).farTuftLod).toBe(MEADOW_FAR_TUFT_LOD);
    expect(meadowContentPlan("reduced").nearTuftLod).toBe(1);
    expect(meadowContentPlan("minimal").nearTuftLod).toBe(2);
  });

  it("holds the meadow to a bounded number of draws", () => {
    const streams = buildGrassInstances();
    const flowers = buildFlowerPositions();
    const maxPopulation = meadowTilePopulationLimit(
      DEFAULT_SCENE_PERFORMANCE_SETTINGS,
    );
    expect(maxPopulation).toBe(800);
    const options = { maxPopulation: maxPopulation! };
    const draws = {
      near: buildMeadowTiles(streams.near, options).length,
      far: buildMeadowTiles(streams.far, options).length,
      flowers: buildMeadowTiles(flowers, options).length,
    };
    expect(draws).toEqual({ near: 30, far: 25, flowers: 25 });
    // Plus the single terrain mesh. Tiles exist so the frustum can reject
    // most of these; more of them is better culling and worse submission
    // cost, and 80 is where that trade currently sits.
    expect(draws.near + draws.far + draws.flowers + 1).toBe(81);
  });

  it("keeps the population balancer from changing what is drawn", () => {
    // Splitting a dense cell must move instances between draws and nowhere
    // else: the same tufts, in the same rung order, in a different number of
    // buckets. A balancer that dropped one would show up here and nowhere
    // else in this suite.
    const streams = buildGrassInstances();
    const legacy = buildMeadowTiles(streams.near);
    const balanced = buildMeadowTiles(streams.near, { maxPopulation: 800 });
    const total = (tiles: ReturnType<typeof buildMeadowTiles>) =>
      tiles.reduce((sum, tile) => sum + tile.indices.length, 0);
    expect(total(balanced)).toBe(total(legacy));
    expect(total(balanced)).toBe(MEADOW_RUNG_GRASS_NEAR[3]);
    expect(balanced.length).toBeGreaterThan(legacy.length);
    const seen = new Set<number>();
    for (const tile of balanced)
      for (const index of tile.indices) seen.add(index);
    expect(seen.size).toBe(MEADOW_RUNG_GRASS_NEAR[3]);
  });
});
