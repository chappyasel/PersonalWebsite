import type { ParetoPoint } from "./analysis";

export type ParetoAxis = {
  domain: [number, number];
  majorStep: number;
  majorTicks: number[];
  minorTicks: number[];
};

function ticks(min: number, max: number, step: number) {
  const start = Math.ceil(min / step) * step;
  return Array.from(
    { length: Math.floor((max - start) / step) + 1 },
    (_, i) => start + i * step,
  );
}

function axis(
  min: number,
  max: number,
  majorStep: number,
  minorStep: number,
): ParetoAxis {
  return {
    domain: [min, max],
    majorStep,
    majorTicks: ticks(min, max, majorStep),
    minorTicks: ticks(min, max, minorStep).filter(
      (value) => value % majorStep !== 0,
    ),
  };
}

/** Bodyweight fits the visible cloud; strength bounds depend only on its frontier. */
export function paretoAxes(
  points: readonly Pick<ParetoPoint, "bodyweight" | "oneRM" | "frontier">[],
  floor: number,
) {
  if (!points.length)
    throw new Error("Axis bounds need at least one visible attempt");
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.bodyweight);
    maxX = Math.max(maxX, point.bodyweight);
    if (point.frontier) {
      minY = Math.min(minY, point.oneRM);
      maxY = Math.max(maxY, point.oneRM);
    }
  }
  if (!Number.isFinite(minY))
    throw new Error("Axis bounds need a frontier attempt");
  const xPadding = Math.max(1, (maxX - minX) * 0.025);
  const x = axis(
    Math.floor((minX - xPadding) / 5) * 5,
    Math.ceil((maxX + xPadding) / 5) * 5,
    5,
    1,
  );
  const ySpan = maxY - minY;
  // Roughly eight labeled strength intervals, all multiples of five pounds.
  const yStep =
    [5, 10, 25, 50, 100, 200, 500].find((step) => step >= ySpan / 8) ??
    Math.ceil(ySpan / 40) * 5;
  const yPadding = Math.max(1, ySpan * 0.08);
  const y = axis(
    Math.max(floor, Math.floor((minY - yPadding) / yStep) * yStep),
    Math.ceil((maxY + yPadding) / yStep) * yStep,
    yStep,
    yStep === 5 ? 1 : 5,
  );
  return { x, y, minWidth: Math.max(360, x.majorTicks.length * 44 + 64) };
}
