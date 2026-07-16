import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

// Lives here (not in the chart component) so the server page can import it
export const DEFAULT_EXERCISES = [
  "Flat Barbell Bench Press",
  "Incline Barbell Bench Press",
  "Close-grip Bench Press",
  "70 Degree Incline Press",
  "Barbell Overhead Press",
  "Back Squats",
  "Sumo Deadlifts",
  "Conventional Deadlifts",
  "Normal Lat Pulldowns",
  "Incline bench Bent Rows",
  "Barbell Conventional Curls",
  "Barbell Preacher Curls",
  "One-arm Overhead Extensions",
];

export const CHART_MODE_VALUES = ["all", "pr", "aggregate"] as const;
export type ChartMode = (typeof CHART_MODE_VALUES)[number];

export const wlSearchParams = {
  exercises: parseAsArrayOf(parseAsString).withDefault(DEFAULT_EXERCISES),
  // No default: null = device auto (pr on mobile, aggregate on desktop)
  mode: parseAsStringLiteral(CHART_MODE_VALUES),
  range: parseAsInteger.withDefault(0),
  year: parseAsInteger.withDefault(new Date().getFullYear()),
};

export const wlSearchParamsCache = createSearchParamsCache(wlSearchParams);
