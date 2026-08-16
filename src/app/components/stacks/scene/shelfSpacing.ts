export type ShelfSpan = { left: number; right: number };

export type ShelfSpacingReport = {
  occupied: ShelfSpan[];
  gaps: ShelfSpan[];
  largestGap: number;
  coverage: number;
};

/**
 * Measures what is physically present on a shelf. Callers pass mesh bounds,
 * not authored object centres, so GLBs, rotated covers, and later prop swaps
 * all use the same seam. Overlapping mesh fragments are merged before empty
 * spans are reported.
 */
export function auditShelfSpacing(
  spans: ShelfSpan[],
  bounds: ShelfSpan,
): ShelfSpacingReport {
  const occupied = spans
    .map((span) => ({
      left: Math.max(bounds.left, Math.min(span.left, span.right)),
      right: Math.min(bounds.right, Math.max(span.left, span.right)),
    }))
    .filter((span) => span.right > span.left)
    .sort((a, b) => a.left - b.left)
    .reduce<ShelfSpan[]>((merged, span) => {
      const tail = merged.at(-1);
      if (!tail || span.left > tail.right) merged.push({ ...span });
      else tail.right = Math.max(tail.right, span.right);
      return merged;
    }, []);

  const gaps: ShelfSpan[] = [];
  let cursor = bounds.left;
  for (const span of occupied) {
    if (span.left > cursor) gaps.push({ left: cursor, right: span.left });
    cursor = Math.max(cursor, span.right);
  }
  if (cursor < bounds.right) gaps.push({ left: cursor, right: bounds.right });

  const width = Math.max(0, bounds.right - bounds.left);
  const empty = gaps.reduce((sum, gap) => sum + gap.right - gap.left, 0);
  return {
    occupied,
    gaps,
    largestGap: gaps.reduce(
      (largest, gap) => Math.max(largest, gap.right - gap.left),
      0,
    ),
    coverage: width === 0 ? 1 : 1 - empty / width,
  };
}

export type ShelfLayoutItem<T> = T & { halfWidth: number };

/**
 * Places an ordered row with a hard non-overlap invariant. Extra room is
 * divided by gap weights, which keeps an authored rhythm without allowing an
 * aesthetic "compression" pass to push one object through another.
 */
export function layoutShelfRow<T>(
  items: ShelfLayoutItem<T>[],
  bounds: ShelfSpan,
  options: {
    minGap: number;
    minGaps?: number[];
    gapWeights?: number[];
  },
): Array<T & { x: number }> {
  if (items.length === 0) return [];
  const contentWidth = items.reduce((sum, item) => sum + item.halfWidth * 2, 0);
  const gapCount = items.length - 1;
  const minimumGaps = Array.from({ length: gapCount }, (_, index) =>
    Math.max(0, options.minGaps?.[index] ?? options.minGap),
  );
  const required =
    contentWidth + minimumGaps.reduce((sum, gap) => sum + gap, 0);
  const available = bounds.right - bounds.left;
  if (required > available + 1e-9) {
    throw new RangeError(
      `Shelf row needs ${required.toFixed(3)}u but only ${available.toFixed(3)}u is available`,
    );
  }
  const weights = Array.from({ length: gapCount }, (_, index) =>
    Math.max(0.01, options.gapWeights?.[index] ?? 1),
  );
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const spare = available - required;
  let edge = bounds.left;
  return items.map(({ halfWidth, ...item }, index) => {
    const x = edge + halfWidth;
    edge = x + halfWidth;
    if (index < gapCount) {
      edge += minimumGaps[index]! + spare * (weights[index]! / weightTotal);
    }
    return { ...(item as T), x };
  });
}

/** Keep authored front ranks bounded even when a source-of-truth checkbox
 * list grows. Newest items win; overflow remains available to the DOM/library
 * without turning a content edit into a canvas exception. */
export function splitShelfRows<T>(items: T[], rowCapacity: number) {
  const capacity = Math.max(1, Math.floor(rowCapacity));
  const visible = items.slice(0, capacity * 2);
  const topCount = Math.min(capacity, Math.ceil(visible.length / 2));
  return {
    top: visible.slice(0, topCount),
    lower: visible.slice(topCount),
    overflow: items.slice(visible.length),
  };
}
