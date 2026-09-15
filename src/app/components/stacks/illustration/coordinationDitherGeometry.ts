import { COORDINATION_HORIZON_SCALE } from "../scene/coordinationGlobeGeometry";
import { COORDINATION_CORE_RADIUS } from "../scene/coordinationNetwork";

export const COORDINATION_DITHER_CELL = 0.0064;
export const COORDINATION_DITHER_FRAMES = 8;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const radius =
  (COORDINATION_CORE_RADIUS * COORDINATION_HORIZON_SCALE) /
  COORDINATION_DITHER_CELL;
const extent = Math.ceil(radius * 1.06);
const paths = new Map<number, string>();

/** Integer cells keep SSR small and deterministic. Merge adjacent pixels into
 * row runs; calculate each frame only on its first use, never during animation. */
export function coordinationDitherPath(frame = 0): string {
  const cached = paths.get(frame);
  if (cached !== undefined) return cached;
  const phase = (frame / COORDINATION_DITHER_FRAMES) * Math.PI * 2;
  const runs: string[] = [];
  for (let y = -extent; y <= extent; y++) {
    let start: number | null = null;
    for (let x = -extent; x <= extent + 1; x++) {
      const distance = Math.hypot(x, y) / radius;
      const coverage = (1.06 - distance) / 0.24;
      const angle = Math.atan2(y, x);
      // Travelling lobes vary the fringe while keeping its inner seam solid.
      const current = Math.sin(angle * 3 + phase) * Math.sin(phase / 2) * 0.24;
      const threshold =
        (BAYER[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)]! + 0.5) / 16;
      const filled =
        x <= extent &&
        distance <= 1.06 &&
        coverage +
          current * Math.sin(Math.max(0, Math.min(1, coverage)) * Math.PI) >=
          threshold;
      if (filled && start === null) start = x;
      if (!filled && start !== null) {
        runs.push(`M${start},${y}h${x - start}v1h${start - x}z`);
        start = null;
      }
    }
  }
  const path = runs.join("");
  paths.set(frame, path);
  return path;
}
