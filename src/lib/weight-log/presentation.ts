import { PHASE_COLORS, type WeightPoint, dayTime } from "./chart";
import type { WeightLog } from "./schema";

const DAY = 86_400_000;

export function bodyFatAxis(points: WeightPoint[], includeProjection: boolean) {
  let maximum = 4;
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
