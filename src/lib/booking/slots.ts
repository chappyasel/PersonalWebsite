import type { BookingDay, Span } from "./page";

/**
 * Where a booking may start. Daybreak takes any start on the quarter hour
 * whose whole length fits inside one open stretch. The page offers fewer:
 * a meeting of half an hour or more starts on the half hour, so 30 minutes
 * books 2:00 or 2:30 and never 2:15. A 15-minute one keeps the quarter hour.
 */

export const MINUTE = 60_000;

/** Daybreak's grid: no booking starts off the quarter hour. */
export const GRID = 15 * MINUTE;

/** The step between the starts the page offers at `length` minutes. */
export function gridFor(length: number): number {
  return length >= 30 ? 30 * MINUTE : GRID;
}

const floorGrid = (ms: number, grid = GRID) => Math.floor(ms / grid) * grid;
const ceilGrid = (ms: number, grid = GRID) => Math.ceil(ms / grid) * grid;

/** The nearest start on `grid` to `ms`, later on a tie. */
export function snapToGrid(ms: number, grid = GRID): number {
  return Math.round(ms / grid) * grid;
}

/** Whether `length` minutes from `start` is bookable in `open`. */
export function fits(open: Span[], start: number, length: number): boolean {
  if (!Number.isFinite(start) || start % gridFor(length) !== 0) return false;
  const end = start + length * MINUTE;
  return open.some((stretch) => stretch.start <= start && end <= stretch.end);
}

/** The first and last start a stretch allows at `length`, or null if it's too short. */
function bounds(stretch: Span, length: number): [number, number] | null {
  const grid = gridFor(length);
  const lo = ceilGrid(stretch.start, grid);
  const hi = floorGrid(stretch.end - length * MINUTE, grid);
  return hi < lo ? null : [lo, hi];
}

/**
 * The stretches drawn as open at `length`: each from its first start to its
 * last start's end. A 15-minute edge that no half-hour start can use, and a
 * stretch too short to hold the length, aren't drawn.
 */
export function bookableSpans(open: Span[], length: number): Span[] {
  return open.flatMap((stretch) => {
    const range = bounds(stretch, length);
    return range ? [{ start: range[0], end: range[1] + length * MINUTE }] : [];
  });
}

/** Every bookable start in `open` at `length`, in order. */
export function startsIn(open: Span[], length: number): number[] {
  const starts: number[] = [];
  for (const stretch of open) {
    const range = bounds(stretch, length);
    if (!range) continue;
    for (let start = range[0]; start <= range[1]; start += gridFor(length)) {
      starts.push(start);
    }
  }
  return starts.sort((a, b) => a - b);
}

/**
 * The bookable start nearest `desired`: snapped to the length's grid and
 * pulled into whichever stretch that fits the length is closest. Earlier
 * wins a tie. Null when nothing in `open` fits.
 */
export function nearestStart(
  open: Span[],
  desired: number,
  length: number,
): number | null {
  const snapped = snapToGrid(desired, gridFor(length));
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const stretch of open) {
    const range = bounds(stretch, length);
    if (!range) continue;
    const candidate = Math.min(range[1], Math.max(range[0], snapped));
    const distance = Math.abs(candidate - desired);
    if (
      distance < bestDistance ||
      (distance === bestDistance && best !== null && candidate < best)
    ) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Where a drag puts the selection: the pointer's time less where on the
 * block it was grabbed, snapped to the grid and kept inside an open stretch
 * that fits. Dragging past a stretch's end holds the block at its last
 * start; dragging across busy time jumps it to the next stretch once that's
 * nearer.
 */
export function dragStart(
  open: Span[],
  pointer: number,
  grabOffset: number,
  length: number,
): number | null {
  return nearestStart(open, pointer - grabOffset, length);
}

/**
 * The selection after picking another length. It keeps its start when the
 * new length still fits there, else moves to the nearest start that does,
 * so a longer meeting slides up rather than spilling into busy time.
 */
export function resize(
  open: Span[],
  start: number,
  length: number,
): number | null {
  return fits(open, start, length) ? start : nearestStart(open, start, length);
}

/** The next bookable start after `start` (`direction` 1) or before it (-1). */
export function stepStart(
  open: Span[],
  start: number,
  length: number,
  direction: 1 | -1,
): number | null {
  const starts = startsIn(open, length);
  if (direction === 1) return starts.find((s) => s > start) ?? null;
  for (let i = starts.length - 1; i >= 0; i--) {
    if (starts[i]! < start) return starts[i]!;
  }
  return null;
}

/** The Day whose open time holds `start`, if any. */
export function dayHolding(
  days: BookingDay[],
  start: number,
): BookingDay | undefined {
  return days.find((day) =>
    day.open.some((stretch) => stretch.start <= start && start < stretch.end),
  );
}

/**
 * The best starts for the host at `length`.
 *
 * Daybreak scores slots only at the link's default length: each suggestion
 * sits flush against one end of an open stretch, next to busy time or the
 * edge of the hours, so Meetings stack and open stretches stay whole. For
 * another length this keeps the same idea without guessing at the
 * calendar: a suggestion flush with its stretch's start keeps its start,
 * and one flush with its stretch's end moves so the new length still ends
 * there. Either comes onto the length's grid inside its stretch, so a
 * flush 10:15 is 10:30 at half-hour starts. One that no longer fits is
 * dropped.
 */
export function suggestedFor(
  days: BookingDay[],
  suggested: number[],
  defaultLength: number,
  length: number,
): number[] {
  const picked = new Set<number>();
  for (const start of suggested) {
    const day = dayHolding(days, start);
    const stretch = day?.open.find(
      (s) => s.start <= start && start + defaultLength * MINUTE <= s.end,
    );
    if (!day || !stretch) continue;
    const grid = gridFor(length);
    const endsFlush =
      start !== ceilGrid(stretch.start) &&
      floorGrid(stretch.end - defaultLength * MINUTE) === start;
    const moved = endsFlush
      ? floorGrid(stretch.end - length * MINUTE, grid)
      : ceilGrid(start, grid);
    if (fits(day.open, moved, length)) picked.add(moved);
  }
  return [...picked].sort((a, b) => a - b);
}

/** The first suggestion on or after `from`, else the first open start, for a starting selection. */
export function firstPick(
  days: BookingDay[],
  suggestions: number[],
  length: number,
): number | null {
  if (suggestions.length > 0) return suggestions[0]!;
  for (const day of days) {
    const [first] = startsIn(day.open, length);
    if (first !== undefined) return first;
  }
  return null;
}
