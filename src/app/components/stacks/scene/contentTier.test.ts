// The content axis, checked where it is decidable without a GPU: the tier
// table, the meadow's reading of it, the terrain build cache and its
// scheduling gate. The parts that only exist as JSX bindings are pinned
// against Meadow.tsx's own source, the same way Lift and Butterflies pin
// theirs — a binding that silently moves back into constructor args or into
// the `[]`-dep'd memo is exactly the regression these guard.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  IDLE_TERRAIN_BUILD_GATE,
  MEADOW_FAR_TUFT_LOD,
  MEADOW_RUNG_GRASS,
  MEADOW_TERRAIN,
  TERRAIN_BUILD_MAX_WAIT_MS,
  TERRAIN_BUILD_SETTLED_FRAMES,
  buildGrassInstances,
  buildMeadowTiles,
  createTerrainGeometryCache,
  meadowContentPlan,
  meadowHeight,
  meadowTileDrawCount,
  nextTerrainBuildGate,
} from "./meadowField";
import {
  SCENE_CONTENT_DEFINITIONS,
  SCENE_CONTENT_TIERS,
  SCENE_FRAME_BUDGET_MS,
  type SceneContentTier,
} from "./quality";

const meadowSource = readFileSync(
  new URL("./Meadow.tsx", import.meta.url),
  "utf8",
);

/** Meadow.tsx's `useTerrainGeometry` body, isolated so the assertions below
 * cannot be satisfied by unrelated code elsewhere in the file. */
const terrainHookSource = (() => {
  const start = meadowSource.indexOf("function useTerrainGeometry");
  expect(start).toBeGreaterThan(-1);
  const end = meadowSource.indexOf("\n}\n", start);
  expect(end).toBeGreaterThan(start);
  return meadowSource.slice(start, end);
})();

describe("content tier table", () => {
  it("steps the near lawn down the tuft LODs and leaves the far lawn alone", () => {
    expect(meadowContentPlan("full").nearTuftLod).toBe(0);
    expect(meadowContentPlan("reduced").nearTuftLod).toBe(1);
    expect(meadowContentPlan("minimal").nearTuftLod).toBe(2);
    for (const tier of SCENE_CONTENT_TIERS) {
      expect(meadowContentPlan(tier).farTuftLod).toBe(MEADOW_FAR_TUFT_LOD);
    }
    // 66 / 32 / 16 triangles: the near lawn may never climb back up a tier.
    const lods = SCENE_CONTENT_TIERS.map(
      (tier) => meadowContentPlan(tier).nearTuftLod,
    );
    expect(lods).toEqual([2, 1, 0]); // SCENE_CONTENT_TIERS runs cheapest first
  });

  it("tessellates the terrain per tier, from the authored ceiling down", () => {
    expect(meadowContentPlan("full")).toMatchObject({
      terrainSegmentsX: 240,
      terrainSegmentsZ: 132,
    });
    expect(meadowContentPlan("reduced")).toMatchObject({
      terrainSegmentsX: 160,
      terrainSegmentsZ: 88,
    });
    expect(meadowContentPlan("minimal")).toMatchObject({
      terrainSegmentsX: 120,
      terrainSegmentsZ: 66,
    });
    // The full tier IS the authored terrain. If MEADOW_TERRAIN is retuned and
    // the table is not, the top tier silently stops being the authored one.
    expect(meadowContentPlan("full").terrainSegmentsX).toBe(
      MEADOW_TERRAIN.segmentsX,
    );
    expect(meadowContentPlan("full").terrainSegmentsZ).toBe(
      MEADOW_TERRAIN.segmentsZ,
    );
    // Cells stay square-ish at every tier, so no tier bands fog along one axis.
    const authored = MEADOW_TERRAIN.segmentsX / MEADOW_TERRAIN.segmentsZ;
    for (const tier of SCENE_CONTENT_TIERS) {
      const plan = meadowContentPlan(tier);
      expect(plan.terrainSegmentsX / plan.terrainSegmentsZ).toBeCloseTo(
        authored,
        2,
      );
    }
  });

  it("simplifies the near lawn's wind only at the bottom tier", () => {
    expect(meadowContentPlan("full").nearGrassSimplified).toBe(false);
    expect(meadowContentPlan("reduced").nearGrassSimplified).toBe(false);
    expect(meadowContentPlan("minimal").nearGrassSimplified).toBe(true);
  });

  it("suspends offscreen wildlife below the top tier", () => {
    expect(SCENE_CONTENT_DEFINITIONS.full.suspendOffscreenWildlife).toBe(false);
    expect(SCENE_CONTENT_DEFINITIONS.reduced.suspendOffscreenWildlife).toBe(
      true,
    );
    expect(SCENE_CONTENT_DEFINITIONS.minimal.suspendOffscreenWildlife).toBe(
      true,
    );
  });
});

describe("density is not a content-tier dial", () => {
  const grass = buildGrassInstances();
  const tiles = {
    near: buildMeadowTiles(grass.near),
    far: buildMeadowTiles(grass.far),
  };
  const drawn = (rung: 0 | 1 | 2 | 3, density: number | null) =>
    [...tiles.near, ...tiles.far].reduce(
      (total, tile) =>
        total + meadowTileDrawCount(tile.rungCounts, rung, density),
      0,
    );

  it("draws the full rung-3 field in every content tier", () => {
    for (const tier of SCENE_CONTENT_TIERS) {
      // Resolving the tier is what proves it is applied at all; the count is
      // then read with the tier deliberately absent from the call.
      const plan = meadowContentPlan(tier);
      expect(plan.terrainSegmentsX).toBeGreaterThan(0);
      expect(drawn(3, null)).toBe(MEADOW_RUNG_GRASS[3]);
    }
  });

  it("keeps every count lever out of the content plan", () => {
    for (const tier of SCENE_CONTENT_TIERS) {
      expect(Object.keys(meadowContentPlan(tier)).sort()).toEqual([
        "farTuftLod",
        "nearGrassSimplified",
        "nearTuftLod",
        "terrainSegmentsX",
        "terrainSegmentsZ",
      ]);
      expect(Object.keys(SCENE_CONTENT_DEFINITIONS[tier])).not.toContain(
        "meadowDensity",
      );
    }
  });

  it("leaves the rung dial and the dev density override working", () => {
    expect(drawn(0, null)).toBe(MEADOW_RUNG_GRASS[0]);
    expect(meadowTileDrawCount([2, 4, 6, 8], 1, null)).toBe(4);
    expect(meadowTileDrawCount([2, 4, 6, 8], 1, 0.5)).toBe(4);
    expect(meadowTileDrawCount([2, 4, 6, 8], 3, 0)).toBe(0);
    expect(meadowTileDrawCount([2, 4, 6, 8], 0, 2)).toBe(8);
  });
});

describe("what a coarser terrain does to the hills", () => {
  /** The height the RENDERED mesh has at (x, z) for a given tessellation:
   * vertices sampled on the PlaneGeometry grid, then interpolated across the
   * two triangles Three emits per quad (diagonal (ix, iy+1)→(ix+1, iy)).
   * `stacks-meadow-check.ts` reads `meadowHeight` analytically, so it cannot
   * see a terrain LOD at all — this is the part of its contract that a
   * content tier can actually move. */
  const tessellatedHeight = (segmentsX: number, segmentsZ: number) => {
    const dx = (MEADOW_TERRAIN.maxX - MEADOW_TERRAIN.minX) / segmentsX;
    const dz = (MEADOW_TERRAIN.maxZ - MEADOW_TERRAIN.minZ) / segmentsZ;
    const cols = segmentsX + 1;
    const rows = segmentsZ + 1;
    const grid = new Float64Array(rows * cols);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        grid[j * cols + i] = meadowHeight(
          MEADOW_TERRAIN.minX + i * dx,
          MEADOW_TERRAIN.minZ + j * dz,
        );
      }
    }
    return (x: number, z: number) => {
      const fx = (x - MEADOW_TERRAIN.minX) / dx;
      const fz = (z - MEADOW_TERRAIN.minZ) / dz;
      const i = Math.min(cols - 2, Math.max(0, Math.floor(fx)));
      const j = Math.min(rows - 2, Math.max(0, Math.floor(fz)));
      const u = Math.min(1, Math.max(0, fx - i));
      const v = Math.min(1, Math.max(0, fz - j));
      const h00 = grid[j * cols + i]!;
      const h10 = grid[j * cols + i + 1]!;
      const h01 = grid[(j + 1) * cols + i]!;
      const h11 = grid[(j + 1) * cols + i + 1]!;
      return u + v <= 1
        ? h00 + (h10 - h00) * u + (h01 - h00) * v
        : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
    };
  };

  /** A fence, not a proof. The full silhouette contract is decided by
   * `yarn check:meadow` against every pose; this bounds how far any tier's
   * mesh may drift from the authored height field, so a future tier cannot
   * quietly coarsen past the point where that check's own margins
   * (max column e 0.033 against a 0.036 cap) would still hold. Measured
   * worst case today: 0.058 full, 0.118 reduced, 0.104 minimal. */
  const MAX_TESSELLATION_DRIFT = 0.15;

  it("keeps every tier's mesh on the authored height field", () => {
    for (const tier of SCENE_CONTENT_TIERS) {
      const plan = meadowContentPlan(tier);
      const sample = tessellatedHeight(
        plan.terrainSegmentsX,
        plan.terrainSegmentsZ,
      );
      const dx =
        (MEADOW_TERRAIN.maxX - MEADOW_TERRAIN.minX) / plan.terrainSegmentsX;
      const dz =
        (MEADOW_TERRAIN.maxZ - MEADOW_TERRAIN.minZ) / plan.terrainSegmentsZ;
      let worst = 0;
      // Cell centres and edge midpoints: linear interpolation is exact at the
      // vertices, so its error only shows up between them.
      for (let j = 0; j < plan.terrainSegmentsZ; j++) {
        for (let i = 0; i < plan.terrainSegmentsX; i++) {
          for (const [ou, ov] of [
            [0.5, 0.5],
            [0.5, 0],
            [0, 0.5],
            [0.25, 0.25],
            [0.75, 0.75],
          ] as const) {
            const x = MEADOW_TERRAIN.minX + (i + ou) * dx;
            const z = MEADOW_TERRAIN.minZ + (j + ov) * dz;
            worst = Math.max(
              worst,
              Math.abs(sample(x, z) - meadowHeight(x, z)),
            );
          }
        }
      }
      expect(worst, `${tier} terrain drift`).toBeLessThan(
        MAX_TESSELLATION_DRIFT,
      );
    }
  });
});

describe("terrain geometry cache", () => {
  it("builds each tier at most once per mount", () => {
    const build = vi.fn((x: number, z: number) => ({ x, z }));
    const cache = createTerrainGeometryCache(build);

    const first = cache.get("full");
    expect(build).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenLastCalledWith(240, 132);

    cache.get("reduced");
    expect(build).toHaveBeenCalledTimes(2);
    expect(build).toHaveBeenLastCalledWith(160, 88);

    // Returning to a tier is a pointer swap, not a second 30k-vertex loop.
    for (let i = 0; i < 5; i++) {
      expect(cache.get("full")).toBe(first);
      expect(cache.get("reduced")).toBeDefined();
    }
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("answers has/peek without building anything", () => {
    const build = vi.fn((x: number, z: number) => ({ x, z }));
    const cache = createTerrainGeometryCache(build);
    expect(cache.has("minimal")).toBe(false);
    expect(cache.peek("minimal")).toBeUndefined();
    expect(build).not.toHaveBeenCalled();
    const built = cache.get("minimal");
    expect(cache.has("minimal")).toBe(true);
    expect(cache.peek("minimal")).toBe(built);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("disposes each cached mesh exactly once", () => {
    const cache = createTerrainGeometryCache((x: number, z: number) => ({
      x,
      z,
    }));
    const kept = SCENE_CONTENT_TIERS.map((tier) => cache.get(tier));
    const dispose = vi.fn();
    cache.clear(dispose);
    expect(dispose).toHaveBeenCalledTimes(kept.length);
    for (const geometry of kept) expect(dispose).toHaveBeenCalledWith(geometry);
    expect(cache.has("full")).toBe(false);
  });
});

describe("terrain build gate", () => {
  const good = SCENE_FRAME_BUDGET_MS;
  const bad = SCENE_FRAME_BUDGET_MS * 3;
  const step = (
    gate = IDLE_TERRAIN_BUILD_GATE,
    frames: readonly number[],
    { travelling = false, pending = true, start = 1_000, dt = 16 } = {},
  ) => {
    let current = gate;
    for (let index = 0; index < frames.length; index++) {
      const next = nextTerrainBuildGate(current, {
        pending,
        travelling,
        frameMs: frames[index]!,
        now: start + index * dt,
      });
      current = next.gate;
      // The caller stops asking once it has built, so the driver does too.
      if (next.build) return { gate: current, build: true, frames: index + 1 };
    }
    return { gate: current, build: false, frames: frames.length };
  };

  it("waits for three consecutive settled frames inside budget", () => {
    expect(step(IDLE_TERRAIN_BUILD_GATE, [good, good]).build).toBe(false);
    expect(step(IDLE_TERRAIN_BUILD_GATE, [good, good, good]).build).toBe(true);
    expect(TERRAIN_BUILD_SETTLED_FRAMES).toBe(3);
  });

  it("restarts the run on any frame over budget", () => {
    expect(
      step(IDLE_TERRAIN_BUILD_GATE, [good, good, bad, good, good]).build,
    ).toBe(false);
    expect(
      step(IDLE_TERRAIN_BUILD_GATE, [good, good, bad, good, good, good]).build,
    ).toBe(true);
  });

  it("never builds while travelling, however good the frames are", () => {
    expect(
      step(IDLE_TERRAIN_BUILD_GATE, Array(30).fill(good), { travelling: true })
        .build,
    ).toBe(false);
    // …including after five seconds of travel: the deadline is rest time.
    expect(
      step(IDLE_TERRAIN_BUILD_GATE, Array(60).fill(good), {
        travelling: true,
        dt: 200,
      }).build,
    ).toBe(false);
  });

  it("restarts the rest clock when a travel interrupts the wait", () => {
    // Four seconds of unbroken slow frames, then a travel, then four more.
    const before = step(IDLE_TERRAIN_BUILD_GATE, Array(20).fill(bad), {
      dt: 200,
      start: 0,
    });
    expect(before.build).toBe(false);
    const during = nextTerrainBuildGate(before.gate, {
      pending: true,
      travelling: true,
      frameMs: bad,
      now: 4_000,
    });
    expect(during.gate).toEqual(IDLE_TERRAIN_BUILD_GATE);
    const after = step(during.gate, Array(20).fill(bad), {
      dt: 200,
      start: 4_016,
    });
    expect(after.build).toBe(false);
  });

  it("builds anyway after five seconds at rest without a good run", () => {
    const { build, frames } = step(
      IDLE_TERRAIN_BUILD_GATE,
      Array(40).fill(bad),
      {
        dt: 200,
        start: 0,
      },
    );
    expect(build).toBe(true);
    // 5,000 ms in at 200 ms a frame — not one frame earlier.
    expect((frames - 1) * 200).toBe(TERRAIN_BUILD_MAX_WAIT_MS);
    expect(TERRAIN_BUILD_MAX_WAIT_MS).toBe(5_000);
    // The escape hatch has not silently become the only path: a device that
    // does offer three good frames still gets them first.
    const early = step(IDLE_TERRAIN_BUILD_GATE, [good, good, good], {
      dt: 200,
      start: 0,
    });
    expect(early.build).toBe(true);
  });

  it("idles with nothing pending", () => {
    const pendingGate = step(IDLE_TERRAIN_BUILD_GATE, [good, good]).gate;
    expect(pendingGate.goodFrames).toBe(2);
    const idle = nextTerrainBuildGate(pendingGate, {
      pending: false,
      travelling: false,
      frameMs: good,
      now: 9_999,
    });
    expect(idle.build).toBe(false);
    expect(idle.gate).toEqual(IDLE_TERRAIN_BUILD_GATE);
  });
});

describe("Meadow.tsx wiring", () => {
  it("schedules every terrain build through the gate and the cache", () => {
    expect(terrainHookSource).toContain("travelling: isSceneTraveling()");
    expect(terrainHookSource).toContain("frameMs: delta * 1000");
    // The only construction sites are the synchronous first bind and `swap`,
    // and `swap` is reachable only from an already-cached tier or a gate that
    // returned build:true.
    expect(terrainHookSource.match(/cache\.get\(/g)).toHaveLength(2);
    expect(terrainHookSource.match(/swap\(\);/g)).toHaveLength(2);
    expect(terrainHookSource).toContain("if (step.build) swap();");
    expect(terrainHookSource).toContain("if (cache.has(tier)) {");
    // Held until ready: the bound geometry is replaced in the same statement
    // that produces the new one, never cleared first.
    expect(terrainHookSource).not.toMatch(/setBound\(\s*null/);
  });

  it("keeps terrain LOD out of the theme-stable memo", () => {
    // The `built` memo stays `[]`-dep'd so a theme change eases through uDark
    // instead of remounting — a rebuilt meadow on every toggle is the exact
    // regression this pins.
    const built = meadowSource.slice(
      meadowSource.indexOf("const built = useMemo(() => {"),
    );
    const memoEnd = built.indexOf("}, []);");
    expect(memoEnd).toBeGreaterThan(-1);
    const memoBody = built.slice(0, memoEnd);
    expect(memoBody).not.toContain("makeTerrainGeometry");
    expect(memoBody).not.toContain("contentTier");
    expect(memoBody).not.toContain("content.");
    // `dark` reaches the shaders as a uniform, and only as a uniform.
    expect(memoBody).toContain("uDark: { value: dark ? 1 : 0 }");

    // Nothing else may build terrain, and no geometry memo may depend on the
    // theme: the tuft LODs key on the GLB, the terrain on the tier cache.
    expect(meadowSource.match(/makeTerrainGeometry/g)).toHaveLength(2);
    expect(meadowSource).toContain(
      "createTerrainGeometryCache(makeTerrainGeometry)",
    );
    expect(meadowSource).toContain("const tuftLods = useMemo(() => {");
    expect(meadowSource).toMatch(/return sources\.map[\s\S]*?\}, \[gltf\]\);/);
  });

  it("loads all three tuft LODs and binds them as swappable props", () => {
    for (const name of ["LOD00", "LOD01", "LOD02"]) {
      expect(meadowSource).toContain(`o.name.includes("${name}")`);
    }
    expect(meadowSource).toContain("tuftLods[content.nearTuftLod]!");
    expect(meadowSource).toContain("tuftLods[content.farTuftLod]!");
    // A tier swap must not remount the near tiles: their geometry and
    // material are props, and `args` carries only the instance count.
    const nearMesh = meadowSource.slice(
      meadowSource.indexOf("key={`near:${tile.key}`}"),
      meadowSource.indexOf("key={`far:${tile.key}`}"),
    );
    expect(nearMesh).toContain("geometry={nearTuftGeometry}");
    expect(nearMesh).toContain(
      "args={[undefined, undefined, tile.indices.length]}",
    );
    expect(nearMesh).toContain("content.nearGrassSimplified");
    expect(nearMesh).toContain("built.farGrassMaterial");
  });

  it("defaults the content tier so existing call sites keep their scene", () => {
    expect(meadowSource).toContain('contentTier = "full",');
    expect(meadowSource).toContain("contentTier?: SceneContentTier;");
  });
});

/** Type-level guard: a new tier must be given a meadow reading, not defaulted. */
const _exhaustive: Record<SceneContentTier, number> = {
  full: meadowContentPlan("full").nearTuftLod,
  reduced: meadowContentPlan("reduced").nearTuftLod,
  minimal: meadowContentPlan("minimal").nearTuftLod,
};
void _exhaustive;
