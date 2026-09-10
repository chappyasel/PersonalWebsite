import { PHASE_COLORS, type WeightPoint, dayTime } from "./chart";
import type { WeightLog } from "./schema";

const DAY = 86_400_000;

export function weightAxis(values: (number | null)[]) {
  const measured = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  const min = measured.length ? Math.min(...measured) : 0;
  const max = measured.length ? Math.max(...measured) : 5;
  const floor = Math.floor((min - 0.25) / 5) * 5;
  const ceiling = Math.ceil((max + 0.25) / 5) * 5;
  return {
    domain: [floor, ceiling] as [number, number],
    ticks: Array.from(
      { length: ceiling - floor + 1 },
      (_, index) => floor + index,
    ),
  };
}

export function calendarAxis([start, end]: [number, number]) {
  const span = (end - start) / DAY;
  const mode =
    span >= 730 ? "year" : span >= 120 ? "month" : span >= 28 ? "week" : "day";
  const first = new Date(start);
  const ticks: number[] = [];
  if (mode === "year" || mode === "month") {
    const step = mode === "year" ? 12 : span >= 450 ? 3 : 1;
    let year = first.getUTCFullYear();
    let month =
      mode === "year" ? 0 : Math.floor(first.getUTCMonth() / step) * step;
    for (
      let time = Date.UTC(year, month, 1);
      time <= end;
      time = Date.UTC(year, month, 1)
    ) {
      if (time >= start) ticks.push(time);
      month += step;
      if (month >= 12) {
        year++;
        month -= 12;
      }
    }
  } else {
    const step = mode === "week" ? 7 : span > 14 ? 2 : 1;
    let time =
      mode === "week" ? start + ((8 - first.getUTCDay()) % 7) * DAY : start;
    for (; time <= end; time += step * DAY) ticks.push(time);
  }
  return {
    ticks,
    mode,
    format: (time: number) =>
      new Date(time).toLocaleDateString("en-US", {
        timeZone: "UTC",
        ...(mode === "year"
          ? { year: "numeric" as const }
          : mode === "month"
            ? { month: "short" as const, year: "2-digit" as const }
            : { month: "short" as const, day: "numeric" as const }),
      }),
  };
}

export function bodyFatAxis(
  points: WeightPoint[],
  includeProjection: boolean,
  historicalRanges: [number, number][] = [],
) {
  let maximum = 4;
  for (const [, upper] of historicalRanges) {
    if (Number.isFinite(upper)) maximum = Math.max(maximum, upper);
  }
  for (const point of points) {
    const values = [
      point.bodyFatMeasured,
      point.bodyFatInterpolated,
      point.bodyFatExtrapolated,
    ];
    if (includeProjection) values.push(point.bodyFatProjected);
    for (const value of values) {
      if (value !== null && Number.isFinite(value))
        maximum = Math.max(maximum, value);
    }
  }
  const ceiling = Math.min(100, Math.max(5, Math.ceil(maximum + 0.25)));
  return {
    domain: [4, ceiling] as [number, number],
    ticks: Array.from({ length: ceiling - 3 }, (_, index) => index + 4),
  };
}

export function phaseColorAt(time: number, phases: WeightLog["phases"]) {
  // When dated templates overlap, the most recently started phase takes over.
  const phase = phases.reduce<WeightLog["phases"][number] | undefined>(
    (current, candidate) =>
      dayTime(candidate.start) <= time &&
      time < dayTime(candidate.end) + DAY &&
      (!current || candidate.start > current.start)
        ? candidate
        : current,
    undefined,
  );
  return PHASE_COLORS[phase?.kind ?? "other"];
}

export function phaseColorStops(
  phases: WeightLog["phases"],
  [start, end]: readonly [number, number],
) {
  const boundaries = [
    ...new Set(
      phases.flatMap((phase) => [
        dayTime(phase.start),
        dayTime(phase.end) + DAY,
      ]),
    ),
  ]
    .filter((time) => time > start && time < end)
    .sort((a, b) => a - b);
  let color = phaseColorAt(start, phases);
  const stops = [{ offset: 0, color }];
  for (const time of boundaries) {
    const next = phaseColorAt(time, phases);
    if (next === color) continue;
    const offset = (time - start) / (end - start);
    stops.push({ offset, color }, { offset, color: next });
    color = next;
  }
  stops.push({ offset: 1, color });
  return stops;
}

export const WEIGHT_SCALE_COLORS = ["#2563eb", "#f8fafc", "#dc2626"] as const;

export function weightCellStyle(weight: number, min: number, max: number) {
  const position =
    max === min ? 0.5 : Math.max(0, Math.min(1, (weight - min) / (max - min)));
  const from = position <= 0.5 ? [37, 99, 235] : [248, 250, 252];
  const to = position <= 0.5 ? [248, 250, 252] : [220, 38, 38];
  const fraction = position <= 0.5 ? position * 2 : (position - 0.5) * 2;
  const rgb = from.map((channel, index) =>
    Math.round(channel + (to[index]! - channel) * fraction),
  );
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  return {
    backgroundColor: `rgb(${rgb.join(", ")})`,
    color: luminance > 0.179 ? "#000000" : "#ffffff",
  };
}

export function calendarMonth(year: number, month: number) {
  const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return {
    offset,
    dates: Array.from(
      { length: count },
      (_, day) =>
        `${year}-${String(month + 1).padStart(2, "0")}-${String(day + 1).padStart(2, "0")}`,
    ),
  };
}
