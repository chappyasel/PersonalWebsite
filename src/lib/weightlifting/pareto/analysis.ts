import type { WeightLog } from "~/lib/weight-log/schema";

const DAY = 86_400_000;
export function calendarDay(date: string): number {
  const time = Date.parse(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== date
  )
    throw new Error("Invalid calendar date");
  return time / DAY;
}
export const dateAtDay = (day: number) =>
  new Date(day * DAY).toISOString().slice(0, 10);
export type WeighIn = { date: string; weight: number };
export type BodyweightEstimate = {
  bodyweight: number;
  method: "measured" | "interpolated" | "carried";
  smoothing: "centered" | "leading" | "trailing" | "boundary";
  distanceDays: number;
  confidence: "high" | "medium" | "low";
};

/** Use every actual daily reading, including days excluded from weekly trimmed averages. */
export function dailyWeighIns(log: Pick<WeightLog, "weeks">): WeighIn[] {
  const result = new Map<string, number>();
  for (const week of log.weeks) {
    const start = calendarDay(week.date);
    week.weights.forEach((weight, offset) => {
      if (weight === null) return;
      if (!Number.isFinite(weight) || weight <= 0)
        throw new Error("Invalid weigh-in");
      const date = dateAtDay(start + offset);
      if (result.has(date) && result.get(date) !== weight)
        throw new Error("Conflicting daily weigh-ins");
      result.set(date, weight);
    });
  }
  return [...result]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, weight]) => ({ date, weight }));
}

/** Calendar interpolation precedes smoothing. Queries never change the fitted line. */
export function createBodyweightEstimator(readings: readonly WeighIn[]) {
  const byDay = new Map<number, number>();
  for (const reading of readings) {
    const day = calendarDay(reading.date);
    if (!Number.isFinite(reading.weight) || reading.weight <= 0)
      throw new Error("Invalid weigh-in");
    if (byDay.has(day) && byDay.get(day) !== reading.weight)
      throw new Error("Conflicting daily weigh-ins");
    byDay.set(day, reading.weight);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  if (!days.length)
    throw new Error("No actual weigh-ins; refusing to omit lifting attempts");
  const first = days[0]!,
    last = days[days.length - 1]!;
  if (last - first > 100_000) throw new Error("Bodyweight range too large");
  const line: number[] = [];
  let right = 0;
  for (let day = first; day <= last; day++) {
    while (days[right]! < day) right++;
    const r = days[right]!,
      l = days[Math.max(0, right - 1)]!;
    line.push(
      byDay.get(day) ??
        byDay.get(l)! + ((byDay.get(r)! - byDay.get(l)!) * (day - l)) / (r - l),
    );
  }
  return (date: string): BodyweightEstimate => {
    const day = calendarDay(date);
    let lo = 0,
      hi = days.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (days[mid]! < day) lo = mid + 1;
      else hi = mid;
    }
    const distanceDays = Math.min(
      Math.abs(day - days[Math.min(lo, days.length - 1)]!),
      Math.abs(day - days[Math.max(0, lo - 1)]!),
    );
    if (day < first || day > last)
      return {
        bodyweight: byDay.get(day < first ? first : last)!,
        method: "carried",
        smoothing: "boundary",
        distanceDays,
        confidence: "low",
      };
    // A leading window at the beginning matches the reference's historical edge.
    // At the live edge, only days through the requested date participate.
    const smoothing =
      day > last - 3 ? "trailing" : day < first + 3 ? "leading" : "centered";
    const start = Math.max(
      first,
      day - (smoothing === "trailing" ? 6 : smoothing === "centered" ? 3 : 0),
    );
    const end = Math.min(
      last,
      day + (smoothing === "leading" ? 6 : smoothing === "centered" ? 3 : 0),
    );
    let sum = 0;
    for (let d = start; d <= end; d++) sum += line[d - first]!;
    return {
      bodyweight: sum / (end - start + 1),
      method: byDay.has(day) ? "measured" : "interpolated",
      smoothing,
      distanceDays,
      confidence:
        distanceDays <= 7 ? "high" : distanceDays <= 21 ? "medium" : "low",
    };
  };
}

export type Attempt = {
  date: string;
  weight: number | null;
  reps: number | null;
  oneRM: number;
};
export type ParetoPoint = Attempt & BodyweightEstimate & { frontier: boolean };
export function dominates(
  a: Pick<ParetoPoint, "bodyweight" | "oneRM">,
  b: Pick<ParetoPoint, "bodyweight" | "oneRM">,
) {
  return (
    a.bodyweight <= b.bodyweight &&
    a.oneRM >= b.oneRM &&
    (a.bodyweight < b.bodyweight || a.oneRM > b.oneRM)
  );
}

/** O(n log n), retaining every duplicate coordinate as a separate attempt. */
export function evaluateAttempts(
  attempts: readonly Attempt[],
  estimate: ReturnType<typeof createBodyweightEstimator>,
): ParetoPoint[] {
  const points = attempts.map((attempt) => {
    if (!Number.isFinite(attempt.oneRM) || attempt.oneRM <= 0)
      throw new Error("Invalid 1RMe");
    // Explicit projection prevents workout identifiers or private input fields leaking.
    return {
      date: attempt.date,
      weight: attempt.weight,
      reps: attempt.reps,
      oneRM: attempt.oneRM,
      ...estimate(attempt.date),
      frontier: false,
    };
  });
  const sorted = [...points].sort(
    (a, b) => a.bodyweight - b.bodyweight || b.oneRM - a.oneRM,
  );
  let best = -Infinity;
  let frontierCoordinate: ParetoPoint | undefined;
  for (const point of sorted) {
    if (point.oneRM > best) {
      point.frontier = true;
      best = point.oneRM;
      frontierCoordinate = point;
    } else if (
      frontierCoordinate?.bodyweight === point.bodyweight &&
      frontierCoordinate.oneRM === point.oneRM
    )
      point.frontier = true;
  }
  return points;
}

export type ParetoPayload = {
  version: 1;
  displayName: string;
  displayFloor: number;
  refreshedAt: string;
  liftingSyncedAt: string | null;
  bodyweightImportedAt: string;
  lastWeighIn: string;
  evaluatedCount: number;
  unestimatedCount: number;
  confidenceCounts: Record<BodyweightEstimate["confidence"], number>;
  points: ParetoPoint[];
  latest: ParetoPoint | null;
  dominator: ParetoPoint | null;
};

export function buildParetoPayload(
  attempts: readonly Attempt[],
  log: WeightLog,
  config: { displayName: string; floor: number },
  liftingSyncedAt: string | null,
  refreshedAt: string,
): ParetoPayload {
  const readings = dailyWeighIns(log);
  const points = evaluateAttempts(
    attempts,
    createBodyweightEstimator(readings),
  );
  // Highlight the strongest set on the latest calendar day, as in the reference card.
  const latest = points.reduce<ParetoPoint | null>(
    (best, point) =>
      !best ||
      point.date > best.date ||
      (point.date === best.date && point.oneRM > best.oneRM)
        ? point
        : best,
    null,
  );
  const dominator = latest
    ? ([...points]
        .filter((point) => dominates(point, latest))
        .sort(
          (a, b) =>
            a.bodyweight - b.bodyweight ||
            b.oneRM - a.oneRM ||
            b.date.localeCompare(a.date),
        )[0] ?? null)
    : null;
  const confidenceCounts = { high: 0, medium: 0, low: 0 };
  for (const point of points) confidenceCounts[point.confidence]++;
  const payload: ParetoPayload = {
    version: 1,
    displayName: config.displayName,
    displayFloor: config.floor,
    refreshedAt,
    liftingSyncedAt,
    bodyweightImportedAt: log.importedAt,
    lastWeighIn: readings.at(-1)!.date,
    evaluatedCount: points.length,
    unestimatedCount: points.filter(
      (point) => !Number.isFinite(point.bodyweight),
    ).length,
    confidenceCounts,
    points,
    latest,
    dominator,
  };
  verifyParetoPayload(payload);
  return payload;
}

export function verifyParetoPayload(payload: ParetoPayload) {
  if (
    payload.unestimatedCount !== 0 ||
    payload.points.length !== payload.evaluatedCount ||
    payload.points.some(
      (point) =>
        !Number.isFinite(point.bodyweight) ||
        point.bodyweight <= 0 ||
        !Number.isFinite(point.oneRM) ||
        point.oneRM <= 0,
    )
  )
    throw new Error("Pareto payload has unestimated or invalid attempts");
  if (
    Object.values(payload.confidenceCounts).reduce((a, b) => a + b, 0) !==
    payload.evaluatedCount
  )
    throw new Error("Confidence counts do not cover all attempts");
  // Independent quadratic oracle belongs in refresh verification, not request processing.
}
