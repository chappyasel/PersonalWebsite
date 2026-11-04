import type { BookingDay, Span } from "./page";

/**
 * Where a booking may start. Daybreak's rule, mirrored here so the page
 * never offers a time the server would refuse: a start sits on the quarter
 * hour, and the whole length fits inside one open stretch.
 */

export const MINUTE = 60_000;

/** Bookings start on the quarter hour. */
export const GRID = 15 * MINUTE;

const floorGrid = (ms: number) => Math.floor(ms / GRID) * GRID;
const ceilGrid = (ms: number) => Math.ceil(ms / GRID) * GRID;

/** The nearest quarter hour to `ms`, later on a tie. */
export function snapToGrid(ms: number): number {
  return Math.round(ms / GRID) * GRID;
}

/** Whether `length` minutes from `start` is bookable in `open`. */
export function fits(open: Span[], start: number, length: number): boolean {
  if (!Number.isFinite(start) || start % GRID !== 0) return false;
  const end = start + length * MINUTE;
  return open.some((stretch) => stretch.start <= start && end <= stretch.end);
}

/** The first and last start a stretch allows at `length`, or null if it's too short. */
function bounds(stretch: Span, length: number): [number, number] | null {
  const lo = ceilGrid(stretch.start);
  const hi = floorGrid(stretch.end - length * MINUTE);
  return hi < lo ? null : [lo, hi];
}

/** Every bookable start in `open` at `length`, in order. */
export function startsIn(open: Span[], length: number): number[] {
  const starts: number[] = [];
  for (const stretch of open) {
    const range = bounds(stretch, length);
    if (!range) continue;
    for (let start = range[0]; start <= range[1]; start += GRID) {
      starts.push(start);
    }
  }
  return starts.sort((a, b) => a - b);
}

/**
 * The bookable start nearest `desired`: snapped to the quarter hour and
 * pulled into whichever stretch that fits the length is closest. Earlier
 * wins a tie. Null when nothing in `open` fits.
 */
export function nearestStart(
  open: Span[],
  desired: number,
  length: number,
): number | null {
  const snapped = snapToGrid(desired);
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
 * there. One that no longer fits is dropped.
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
    let moved = start;
    if (length !== defaultLength) {
      const endsFlush =
        start !== ceilGrid(stretch.start) &&
        floorGrid(stretch.end - defaultLength * MINUTE) === start;
      moved = endsFlush ? floorGrid(stretch.end - length * MINUTE) : start;
    }
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
