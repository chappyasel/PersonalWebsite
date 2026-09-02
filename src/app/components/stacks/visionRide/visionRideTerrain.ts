export type VisionRideTerrainTier = "full" | "reduced" | "minimal";

export const VISION_RIDE_PERIOD_METRES = 120;
export const VISION_RIDE_ROAD_HALF_WIDTH = 4;

/**
 * Valley shape. The flanks spread this far beyond the road edge, and no
 * sample rises above the height ceiling. The reference is a broad, low
 * valley: mountains climb gently away from the grid and the tallest peaks
 * stop well short of the sky's midline, so the sun and the magenta band
 * own the upper frame. The previous 30 m spread and 24 m ceiling read as a
 * canyon wall on both sides.
 */
export const VISION_RIDE_VALLEY_SPREAD_METRES = 46;
/** Peak ceiling. Raised from 11.5 m once the broad valley was in place:
 * the reference's flanks climb to about a third of the frame, and the
 * lower ceiling left them as low dunes. Still under a third of the spread,
 * so the valley reads wide. */
export const VISION_RIDE_MOUNTAIN_HEIGHT_METRES = 30.6;
/** A few coarse ridge feet are allowed to cross the nominal road shoulder.
 * The incursion remains narrower than two grid cells, preserving a broad,
 * reliably flat centre lane while avoiding a ruler-straight valley edge. */
export const VISION_RIDE_TRACK_INCURSION_MAX_METRES = 1.35;

/** Stars sit on a shell inside the sky sphere, above the terrain horizon,
 * and render before the terrain without writing depth, so a star can never
 * appear in front of a ridge. The field only covers the sky the chase
 * camera can see: the forward 180° and elevations up to sin 0.7 (~44°),
 * which is past the portrait frame's top edge. Spending the budget higher
 * or behind the camera bought nothing on screen. */
export const VISION_RIDE_STAR_SHELL_RADIUS_METRES = 150;
export const VISION_RIDE_STAR_MIN_ELEVATION = 0.1;
export const VISION_RIDE_STAR_MAX_ELEVATION = 0.7;
export const VISION_RIDE_STAR_AZIMUTH_SPAN = Math.PI;

/** Star size classes in CSS pixels. A small hero fraction carries the
 * cross sparkle; the rest is dust and a mid class so the field varies. */
export const VISION_RIDE_STAR_SIZES = {
  dust: { min: 2.2, max: 3.8 },
  bright: { min: 6.5, max: 10.5 },
  hero: { min: 24, max: 34 },
  /** Fraction of the budget spent on each non-dust class. */
  brightFraction: 0.1,
  heroFraction: 0.022,
} as const;

/** Three shared landscape copies cover this far at every recycle phase. */
export const VISION_RIDE_MOUNTAIN_HORIZON_METRES = 220;

/** The shared mesh reaches behind every arrival camera, so its flat road
 * remains under the entire lower frame as the period recycles. */
export const VISION_RIDE_MOUNTAIN_NEAR_METRES = 14;

/**
 * Sun placement. Deeper than every recycled landscape copy so ordinary
 * depth testing keeps it background at all travel phases. The previous
 * z=-104 plane sat inside the mountain window and could
 * read in front of far ridges. The large disc is an intentional hero element
 * and remains behind every mountain copy.
 */
export const VISION_RIDE_SUN_DEPTH_METRES = 320;
export const VISION_RIDE_SUN_DIAMETER_METRES = 124;
export const VISION_RIDE_SUN_ELEVATION_METRES = 37;

const VISION_RIDE_LANDSCAPE_ROWS = VISION_RIDE_PERIOD_METRES;
const VISION_RIDE_LANDSCAPE_COLUMNS =
  (VISION_RIDE_ROAD_HALF_WIDTH + VISION_RIDE_VALLEY_SPREAD_METRES) * 2;

/** Coarse control lattice beneath the visible metre grid. Interpolating each
 * control quad as two triangles makes the mountains read as large planar
 * facets rather than a densely sampled rolling height field. */
export const VISION_RIDE_MOUNTAIN_FACET_COLUMNS = 8;
export const VISION_RIDE_MOUNTAIN_FACET_ROWS = 10;
export const VISION_RIDE_MOUNTAIN_FACET_WIDTH_METRES =
  VISION_RIDE_VALLEY_SPREAD_METRES / VISION_RIDE_MOUNTAIN_FACET_COLUMNS;
export const VISION_RIDE_MOUNTAIN_FACET_DEPTH_METRES =
  VISION_RIDE_PERIOD_METRES / VISION_RIDE_MOUNTAIN_FACET_ROWS;

export function visionRideTerrainSegments(tier: VisionRideTerrainTier) {
  // Road and mountains are one metre lattice in every quality tier. Changing
  // its topology by tier would move the seam and break the authored world;
  // only the independent star budget scales.
  const stars = tier === "full" ? 1_700 : tier === "reduced" ? 1_110 : 650;
  return {
    rows: VISION_RIDE_LANDSCAPE_ROWS,
    columns: VISION_RIDE_LANDSCAPE_COLUMNS,
    stars,
  };
}

function ridgeHash(column: number, row: number, side: -1 | 1) {
  let state =
    Math.imul(column + 17, 374_761_393) ^
    Math.imul(row + 31, 668_265_263) ^
    (side > 0 ? 0x6d2b_79f5 : 0x1b87_3593);
  state = Math.imul(state ^ (state >>> 13), 1_274_126_177);
  return ((state ^ (state >>> 16)) >>> 0) / 0x1_0000_0000;
}

function mountainIncursionControl(row: number, side: -1 | 1) {
  const wrappedRow =
    ((row % VISION_RIDE_MOUNTAIN_FACET_ROWS) +
      VISION_RIDE_MOUNTAIN_FACET_ROWS) %
    VISION_RIDE_MOUNTAIN_FACET_ROWS;
  const raw = Math.max(0, (ridgeHash(0, wrappedRow, side) - 0.72) / 0.28);
  return raw * raw * VISION_RIDE_TRACK_INCURSION_MAX_METRES;
}

/** Periodic road-edge displacement. Most rows stay on the nominal shoulder;
 * isolated coarse facets push slightly into it. */
export function mountainTrackIncursion(distance: number, side: -1 | 1) {
  const wrappedDistance =
    ((distance % VISION_RIDE_PERIOD_METRES) + VISION_RIDE_PERIOD_METRES) %
    VISION_RIDE_PERIOD_METRES;
  const position = wrappedDistance / VISION_RIDE_MOUNTAIN_FACET_DEPTH_METRES;
  const row = Math.floor(position);
  const blend = position - row;
  const start = mountainIncursionControl(row, side);
  const end = mountainIncursionControl(row + 1, side);
  return start + (end - start) * blend;
}

function mountainControlHeight(column: number, row: number, side: -1 | 1) {
  if (column === 0) return 0;
  const wrappedRow =
    ((row % VISION_RIDE_MOUNTAIN_FACET_ROWS) +
      VISION_RIDE_MOUNTAIN_FACET_ROWS) %
    VISION_RIDE_MOUNTAIN_FACET_ROWS;
  const across = column / VISION_RIDE_MOUNTAIN_FACET_COLUMNS;
  const shoulder = Math.pow(across, 0.56);
  const local = ridgeHash(column, wrappedRow, side);
  const longRidge = ridgeHash(
    Math.ceil(column / 2),
    Math.floor(wrappedRow / 2),
    side,
  );
  // High-contrast local spikes form the silhouette. The slower field only
  // props up a few connected saddles; averaging the two fields produced the
  // smooth, similarly sized hills the reference explicitly does not have.
  const ridge = Math.max(Math.pow(local, 1.45), longRidge * 0.48);
  return Math.min(
    VISION_RIDE_MOUNTAIN_HEIGHT_METRES,
    shoulder * (3.5 + ridge * 32),
  );
}

/** Height on the coarse triangular control surface. The visible one-metre
 * lattice samples this surface, so road and mountains remain one mesh while
 * every mountain patch stays perfectly planar between hard ridge edges. */
export function facetedMountainHeight(
  distance: number,
  outsideRoad: number,
  side: -1 | 1,
) {
  const acrossPosition = Math.min(
    VISION_RIDE_MOUNTAIN_FACET_COLUMNS,
    Math.max(0, outsideRoad / VISION_RIDE_MOUNTAIN_FACET_WIDTH_METRES),
  );
  const wrappedDistance =
    ((distance % VISION_RIDE_PERIOD_METRES) + VISION_RIDE_PERIOD_METRES) %
    VISION_RIDE_PERIOD_METRES;
  const depthPosition =
    wrappedDistance / VISION_RIDE_MOUNTAIN_FACET_DEPTH_METRES;
  const column = Math.min(
    VISION_RIDE_MOUNTAIN_FACET_COLUMNS - 1,
    Math.floor(acrossPosition),
  );
  const row = Math.floor(depthPosition);
  const across = acrossPosition - column;
  const depth = depthPosition - row;
  const h00 = mountainControlHeight(column, row, side);
  const h10 = mountainControlHeight(column + 1, row, side);
  const h01 = mountainControlHeight(column, row + 1, side);
  const h11 = mountainControlHeight(column + 1, row + 1, side);

  if (across + depth <= 1) {
    return h00 + across * (h10 - h00) + depth * (h01 - h00);
  }
  return h11 + (1 - depth) * (h10 - h11) + (1 - across) * (h01 - h11);
}

export type UnifiedLandscape = Readonly<{
  rows: number;
  columns: number;
  samples: Float32Array;
  surfaceIndices: Uint16Array;
}>;

function landscapeHeight(x: number, distance: number) {
  const side = Math.sign(x) as -1 | 1;
  const roadEdge =
    VISION_RIDE_ROAD_HALF_WIDTH - mountainTrackIncursion(distance, side);
  const outsideRoad = Math.abs(x) - roadEdge;
  if (outsideRoad <= 0) return 0;
  return facetedMountainHeight(distance, outsideRoad, side);
}

/**
 * One indexed metre lattice owns the road, both shoulders and both mountain
 * flanks. The centre columns stay flat; the same rows continue outward and
 * rise into the angular ridge field without a geometry or grid restart.
 */
export function generateUnifiedLandscape(): UnifiedLandscape {
  const rows = VISION_RIDE_LANDSCAPE_ROWS;
  const columns = VISION_RIDE_LANDSCAPE_COLUMNS;
  const halfWidth =
    VISION_RIDE_ROAD_HALF_WIDTH + VISION_RIDE_VALLEY_SPREAD_METRES;
  const samples = new Float32Array((rows + 1) * (columns + 1) * 3);
  for (let row = 0; row <= rows; row += 1) {
    const distance = row;
    for (let column = 0; column <= columns; column += 1) {
      const x = -halfWidth + column;
      const index = (row * (columns + 1) + column) * 3;
      samples[index] = x;
      samples[index + 1] = landscapeHeight(x, distance);
      samples[index + 2] = -distance;
    }
  }

  const surfaceIndices: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = row * (columns + 1) + column;
      const topRight = topLeft + 1;
      const bottomLeft = (row + 1) * (columns + 1) + column;
      const bottomRight = bottomLeft + 1;
      // Alternate the diagonal so the low-poly planes do not all lean in one
      // direction while the visible orthogonal lattice remains continuous.
      if ((row + column) % 2 === 0) {
        surfaceIndices.push(
          topLeft,
          bottomLeft,
          topRight,
          topRight,
          bottomLeft,
          bottomRight,
        );
      } else {
        surfaceIndices.push(
          topLeft,
          bottomLeft,
          bottomRight,
          topLeft,
          bottomRight,
          topRight,
        );
      }
    }
  }

  return {
    rows,
    columns,
    samples,
    surfaceIndices: new Uint16Array(surfaceIndices),
  };
}

/** Z offsets for three instances of the same unified 120 m landscape. */
export function mountainWindowOffsets(travel: number) {
  const wrapped =
    (((travel % VISION_RIDE_PERIOD_METRES) + VISION_RIDE_PERIOD_METRES) %
      VISION_RIDE_PERIOD_METRES) +
    VISION_RIDE_MOUNTAIN_NEAR_METRES;
  return [
    wrapped,
    wrapped - VISION_RIDE_PERIOD_METRES,
    wrapped - VISION_RIDE_PERIOD_METRES * 2,
  ] as const;
}

/** Nearest z the landscape always covers, at every travel phase. */
export const VISION_RIDE_MOUNTAIN_NEAR_COVERAGE_Z =
  VISION_RIDE_MOUNTAIN_NEAR_METRES;

/** True when every metre of forward range [0, -depth] lies inside a copy. */
export function mountainCoverageComplete(travel: number, depth: number) {
  const spans = mountainWindowOffsets(travel).map(
    (offset) => [offset - VISION_RIDE_PERIOD_METRES, offset] as const,
  );
  for (let z = 0; z >= -depth; z -= 0.5) {
    if (!spans.some(([min, max]) => z >= min && z <= max)) return false;
  }
  return true;
}

function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * Star positions on the forward upper shell. Elevation is uniform across
 * the visible band so the density the camera sees matches the budget; a
 * mild thinning toward the horizon glow comes from the shell geometry
 * itself (equal elevation steps cover more sky lower down).
 */
export function deterministicStars(count: number, seed = 404452) {
  const points = new Float32Array(count * 3);
  const next = lcg(seed);
  const radius = VISION_RIDE_STAR_SHELL_RADIUS_METRES;
  for (let index = 0; index < count; index += 1) {
    const angle = Math.PI / 2 + (next() - 0.5) * VISION_RIDE_STAR_AZIMUTH_SPAN;
    const elevation =
      VISION_RIDE_STAR_MIN_ELEVATION +
      next() *
        (VISION_RIDE_STAR_MAX_ELEVATION - VISION_RIDE_STAR_MIN_ELEVATION);
    const ring = radius * Math.sqrt(1 - elevation * elevation);
    points[index * 3] = Math.cos(angle) * ring;
    points[index * 3 + 1] = radius * elevation;
    points[index * 3 + 2] = -Math.sin(angle) * ring;
  }
  return points;
}

export type StarClass = "dust" | "bright" | "hero";

export function starClassForSize(size: number): StarClass {
  if (size >= VISION_RIDE_STAR_SIZES.hero.min) return "hero";
  if (size >= VISION_RIDE_STAR_SIZES.bright.min) return "bright";
  return "dust";
}

/** Sizes in CSS pixels. Two draws per star keep the class roll independent
 * of the within-class spread, so the hero fraction holds at every budget. */
export function deterministicStarSizes(count: number, seed = 404452) {
  const sizes = new Float32Array(count);
  const next = lcg(seed ^ 0x9e3779b9);
  const { dust, bright, hero, brightFraction, heroFraction } =
    VISION_RIDE_STAR_SIZES;
  for (let index = 0; index < count; index += 1) {
    const roll = next();
    const spread = next();
    const range =
      roll < heroFraction
        ? hero
        : roll < heroFraction + brightFraction
          ? bright
          : dust;
    sizes[index] = range.min + spread * (range.max - range.min);
  }
  return sizes;
}

/**
 * Twinkle envelope. The shader multiplies each star's alpha by
 * floor + depth * sin(time * rate + phase); the earlier 0.80 + 0.20 was
 * too shallow to register against the sky. Rates spread per star so the
 * field shimmers rather than pulses.
 */
export const VISION_RIDE_STAR_TWINKLE = {
  floor: 0.5,
  depth: 0.5,
  rateMin: 1.1,
  rateSpread: 1.6,
} as const;

/** Pure mirror of the shader's twinkle for one star. `motion` is 0 under
 * reduced motion, which pins the envelope at its floor plus the phase's
 * static offset, the same as the GPU. */
export function starTwinkle(time: number, phase: number, motion: number) {
  const { floor, depth, rateMin, rateSpread } = VISION_RIDE_STAR_TWINKLE;
  const rate = rateMin + ((phase * 0.618) % 1) * rateSpread;
  return floor + depth * Math.sin(time * rate * motion + phase);
}

/** Radial feather so a sprite's alpha is zero before gl_PointCoord's edge:
 * the hero cross arms otherwise ran to the square's border and clipped. */
export const VISION_RIDE_STAR_FEATHER = { start: 0.36, end: 0.49 } as const;

export function starSpriteFeather(radius: number) {
  const { start, end } = VISION_RIDE_STAR_FEATHER;
  const t = Math.max(0, Math.min(1, (radius - start) / (end - start)));
  return 1 - t * t * (3 - 2 * t);
}

/** Per-star twinkle phase in [0, 2π), so the field never pulses in unison. */
export function deterministicStarTwinkle(count: number, seed = 404452) {
  const phases = new Float32Array(count);
  const next = lcg(seed ^ 0x7f4a7c15);
  for (let index = 0; index < count; index += 1)
    phases[index] = next() * Math.PI * 2;
  return phases;
}
