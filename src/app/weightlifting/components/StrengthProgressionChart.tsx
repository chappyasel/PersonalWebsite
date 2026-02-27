"use client";

import { CaretDownIcon, PlusIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "~/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import { api } from "~/trpc/react";
import { categoryColor } from "../lib/utils";

const DEFAULT_EXERCISES = [
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

const TIME_RANGES = [
  { label: "All", months: 0 },
  { label: "5Y", months: 60 },
  { label: "2Y", months: 24 },
  { label: "1Y", months: 12 },
  { label: "6M", months: 6 },
] as const;

type ChartMode = "all" | "pr" | "aggregate";

const CHART_MODES = [
  { label: "All", value: "all" as ChartMode },
  { label: "PR", value: "pr" as ChartMode },
  { label: "Aggregate", value: "aggregate" as ChartMode },
] as const;

// Shorten display names for pills
function shortenName(name: string) {
  return name
    .replace(/^Flat Barbell /, "")
    .replace(/^Barbell /, "")
    .replace(/ Press$/, "")
    .replace(/^Back /, "")
    .replace(/^Sumo /, "");
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${monthNames[parseInt(m!) - 1]} ${parseInt(d!)} '${y!.slice(2)}`;
}

function formatDateFull(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${monthNames[parseInt(m!) - 1]} ${parseInt(d!)}, ${y}`;
}

/** Nelder-Mead simplex optimization for 3 parameters with bounds */
function fitAsymptotic(
  xs: number[],
  ys: number[],
): { a: number; b: number; c: number } | null {
  if (xs.length < 3) return null;

  const maxY = Math.max(...ys);
  const minY = Math.min(...ys);
  const range = maxY - minY;

  // Residual sum of squares
  function ssr(params: [number, number, number]) {
    const [a, b, c] = params;
    let sum = 0;
    for (let i = 0; i < xs.length; i++) {
      const pred = a - b * Math.exp(-c * xs[i]!);
      const diff = pred - ys[i]!;
      sum += diff * diff;
    }
    return sum;
  }

  // Clamp parameters to bounds
  function clamp(params: [number, number, number]): [number, number, number] {
    return [
      Math.max(maxY, Math.min(maxY * 1.5, params[0])),
      Math.max(0, Math.min(3000, params[1])),
      Math.max(1e-6, Math.min(0.01, params[2])),
    ];
  }

  // Initial simplex
  const initial: [number, number, number] = [
    maxY * 1.1,
    range > 0 ? range * 1.5 : 1500,
    0.001,
  ];

  const simplex: [number, number, number][] = [
    clamp(initial),
    clamp([initial[0] * 1.05, initial[1], initial[2]]),
    clamp([initial[0], initial[1] * 1.1, initial[2]]),
    clamp([initial[0], initial[1], initial[2] * 1.5]),
  ];

  const alpha = 1,
    gamma = 2,
    rho = 0.5,
    sigma = 0.5;

  for (let iter = 0; iter < 500; iter++) {
    // Sort by objective value
    simplex.sort((a, b) => ssr(a) - ssr(b));

    const best = simplex[0]!;
    const worst = simplex[3]!;
    const secondWorst = simplex[2]!;

    // Check convergence
    if (ssr(best) < 1 || Math.abs(ssr(worst) - ssr(best)) < 0.01) break;

    // Centroid of all but worst
    const centroid: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      centroid[0] += simplex[i]![0];
      centroid[1] += simplex[i]![1];
      centroid[2] += simplex[i]![2];
    }
    centroid[0] /= 3;
    centroid[1] /= 3;
    centroid[2] /= 3;

    // Reflection
    const reflected = clamp([
      centroid[0] + alpha * (centroid[0] - worst[0]),
      centroid[1] + alpha * (centroid[1] - worst[1]),
      centroid[2] + alpha * (centroid[2] - worst[2]),
    ]);

    if (ssr(reflected) < ssr(secondWorst) && ssr(reflected) >= ssr(best)) {
      simplex[3] = reflected;
      continue;
    }

    if (ssr(reflected) < ssr(best)) {
      // Expansion
      const expanded = clamp([
        centroid[0] + gamma * (reflected[0] - centroid[0]),
        centroid[1] + gamma * (reflected[1] - centroid[1]),
        centroid[2] + gamma * (reflected[2] - centroid[2]),
      ]);
      simplex[3] = ssr(expanded) < ssr(reflected) ? expanded : reflected;
      continue;
    }

    // Contraction
    const contracted = clamp([
      centroid[0] + rho * (worst[0] - centroid[0]),
      centroid[1] + rho * (worst[1] - centroid[1]),
      centroid[2] + rho * (worst[2] - centroid[2]),
    ]);

    if (ssr(contracted) < ssr(worst)) {
      simplex[3] = contracted;
      continue;
    }

    // Shrink
    for (let i = 1; i < 4; i++) {
      simplex[i] = clamp([
        best[0] + sigma * (simplex[i]![0] - best[0]),
        best[1] + sigma * (simplex[i]![1] - best[1]),
        best[2] + sigma * (simplex[i]![2] - best[2]),
      ]);
    }
  }

  simplex.sort((a, b) => ssr(a) - ssr(b));
  const [a, b, c] = simplex[0]!;
  return { a, b, c };
}

/** Days between two date strings */
function daysBetween(d1: string, d2: string) {
  return (
    (new Date(d2).getTime() - new Date(d1).getTime()) / (1000 * 60 * 60 * 24)
  );
}

interface TrendlineResult {
  params: { a: number; b: number; c: number };
  julyPoints: { date: string; total: number; _ts: number }[];
  targetPoint: { date: string; total: number; _ts: number } | null;
  currentTotal: number;
  ratePerYear: number;
  firstDate: string;
}

function AggregateTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0]!.payload;
  const date = data.date as string;
  const total = data.total as number | undefined;
  const prCount = data.prCount as number | undefined;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-md dark:border-neutral-700 dark:bg-neutral-800">
      <p className="mb-1 font-medium text-neutral-700 dark:text-neutral-200">
        {formatDateFull(date)}
      </p>
      {total != null && (
        <p className="text-neutral-600 dark:text-neutral-300">
          Total 1RM:{" "}
          <span className="font-medium">{total.toLocaleString()} lbs</span>
        </p>
      )}
      {prCount != null && prCount > 0 && (
        <p className="text-neutral-500 dark:text-neutral-400">
          PRs this month:{" "}
          <span className="font-medium">{prCount}</span>
        </p>
      )}
    </div>
  );
}

export function StrengthProgressionChart() {
  const [selectedExercises, setSelectedExercises] =
    useState<string[]>(DEFAULT_EXERCISES);
  const [timeRange, setTimeRange] = useState(0); // months, 0 = all
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const [chartMode, setChartMode] = useState<ChartMode>(isMobile ? "pr" : "aggregate");
  const [pillsExpanded, setPillsExpanded] = useState(!isMobile);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: topExercises, isLoading: loadingExercises } =
    api.weightlifting.getTopExercises.useQuery({ minSets: 10 });

  const { data: progressionData, isLoading: loadingProgression } =
    api.weightlifting.getStrengthProgression.useQuery(
      { exercises: selectedExercises },
      { enabled: selectedExercises.length > 0 },
    );

  // Build chart data based on mode
  const { chartData, chartConfig, dataKeys, trendline } = useMemo(() => {
    if (!progressionData || progressionData.length === 0) {
      return {
        chartData: [],
        chartConfig: {} as ChartConfig,
        dataKeys: [] as string[],
        trendline: null as TrendlineResult | null,
      };
    }

    // Compute time range cutoff string
    let cutoffStr = "";
    if (timeRange > 0) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - timeRange);
      cutoffStr = cutoff.toISOString().slice(0, 10);
    }

    // Filter by time range (used for all/pr modes)
    const filtered =
      timeRange > 0
        ? progressionData.filter((d) => d.date >= cutoffStr)
        : progressionData;

    if (chartMode === "aggregate") {
      // Build aggregate over ALL data so the running total is correct,
      // then slice output points to the time range
      const sorted = [...progressionData].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      const currentBest: Record<string, number> = {};
      const prDates: string[] = [];
      const allPoints: { date: string; total: number }[] = [];

      for (const row of sorted) {
        const prev = currentBest[row.exercise] ?? 0;
        if (row.bestOneRM > prev) {
          currentBest[row.exercise] = row.bestOneRM;
          const total = Object.values(currentBest).reduce((s, v) => s + v, 0);
          allPoints.push({ date: row.date, total: Math.round(total) });
          prDates.push(row.date);
        }
      }

      // Count PRs per month
      const prCountByMonth: Record<string, number> = {};
      for (const date of prDates) {
        const month = date.slice(0, 7); // YYYY-MM
        prCountByMonth[month] = (prCountByMonth[month] ?? 0) + 1;
      }

      // Filter to time range
      const points =
        timeRange > 0
          ? allPoints.filter((p) => p.date >= cutoffStr)
          : allPoints;

      // Consolidate to one point per month: last total value + PR count
      const monthlyData: {
        date: string;
        total: number;
        prCount: number;
        trendTotal?: number;
      }[] = [];

      const monthMap = new Map<
        string,
        { date: string; total: number; prCount: number }
      >();
      for (const p of points) {
        const month = p.date.slice(0, 7);
        monthMap.set(month, {
          date: `${month}-15`,
          total: p.total,
          prCount: prCountByMonth[month] ?? 0,
        });
      }
      for (const entry of monthMap.values()) {
        monthlyData.push(entry);
      }
      monthlyData.sort((a, b) => a.date.localeCompare(b.date));

      // Add today's point if last entry isn't this month
      const today = new Date().toISOString().slice(0, 10);
      const thisMonth = today.slice(0, 7);
      if (
        monthlyData.length > 0 &&
        monthlyData[monthlyData.length - 1]!.date.slice(0, 7) !== thisMonth
      ) {
        monthlyData.push({
          date: today,
          total: monthlyData[monthlyData.length - 1]!.total,
          prCount: 0,
        });
      }

      // --- Trendline fitting on July 1st anchor points ---
      let trendResult: TrendlineResult | null = null;

      if (allPoints.length > 0) {
        const firstDate = allPoints[0]!.date;
        const currentTotal = allPoints[allPoints.length - 1]!.total;
        const now = new Date();
        const currentYear = now.getFullYear();

        // Extract July 1st anchor points
        const julyPoints: { date: string; total: number; _ts: number }[] = [];
        const firstYear = parseInt(firstDate.slice(0, 4));

        for (let year = firstYear; year <= currentYear; year++) {
          const julyDate = `${year}-07-01`;
          // Only include if July 1st has passed (or is today)
          if (julyDate > today) continue;
          // Find last aggregate total on or before July 1st
          let lastTotal: number | null = null;
          for (const p of allPoints) {
            if (p.date <= julyDate) {
              lastTotal = p.total;
            } else {
              break;
            }
          }
          if (lastTotal != null) {
            julyPoints.push({
              date: julyDate,
              total: lastTotal,
              _ts: new Date(julyDate).getTime(),
            });
          }
        }

        // Fit curve to July 1st points
        if (julyPoints.length >= 3) {
          const xs = julyPoints.map((p) => daysBetween(firstDate, p.date));
          const ys = julyPoints.map((p) => p.total);
          const params = fitAsymptotic(xs, ys);

          if (params) {
            // Next July 1st
            const nextJulyYear =
              now.getMonth() >= 6 ? currentYear + 1 : currentYear;
            const nextJulyDate = `${nextJulyYear}-07-01`;
            const nextJulyX = daysBetween(firstDate, nextJulyDate);
            const nextJulyTotal = Math.round(
              params.a - params.b * Math.exp(-params.c * nextJulyX),
            );

            const targetPoint = {
              date: nextJulyDate,
              total: nextJulyTotal,
              _ts: new Date(nextJulyDate).getTime(),
            };

            // Current rate (lbs/year): derivative is b*c*exp(-cx), multiply by 365
            const currentX = daysBetween(firstDate, today);
            const ratePerYear =
              params.b * params.c * Math.exp(-params.c * currentX) * 365;

            trendResult = {
              params,
              julyPoints,
              targetPoint,
              currentTotal,
              ratePerYear,
              firstDate,
            };

            // Add trendTotal to existing monthly points
            for (const entry of monthlyData) {
              const x = daysBetween(firstDate, entry.date);
              entry.trendTotal = Math.round(
                params.a - params.b * Math.exp(-params.c * x),
              );
            }

            // Add single target point at next July 1st for trendline endpoint
            const lastDate =
              monthlyData[monthlyData.length - 1]?.date ?? today;
            if (nextJulyDate > lastDate) {
              const x = daysBetween(firstDate, nextJulyDate);
              monthlyData.push({
                date: nextJulyDate,
                total: undefined as unknown as number,
                prCount: 0,
                trendTotal: Math.round(
                  params.a - params.b * Math.exp(-params.c * x),
                ),
              });
            }
          }
        }
      }

      const config: ChartConfig = {
        total: {
          label: "Total 1RM",
          color: "#3b82f6",
        },
        prCount: {
          label: "PRs this month",
          color: "hsl(var(--chart-2))",
        },
        trendTotal: {
          label: "Trendline",
          color: "#ef4444",
        },
      };

      return {
        chartData: monthlyData,
        chartConfig: config,
        dataKeys: ["total"],
        trendline: trendResult,
      };
    }

    if (chartMode === "pr") {
      // Filter to only ascending values per exercise
      const prData: typeof filtered = [];
      const bestSoFar: Record<string, number> = {};

      const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
      for (const row of sorted) {
        const prev = bestSoFar[row.exercise] ?? 0;
        if (row.bestOneRM > prev) {
          bestSoFar[row.exercise] = row.bestOneRM;
          prData.push(row);
        }
      }

      // Pivot PR data
      const dates = [...new Set(prData.map((d) => d.date))].sort();
      const data = dates.map((date) => {
        const row: Record<string, string | number> = { date };
        for (const exercise of selectedExercises) {
          const entry = prData.find(
            (d) => d.date === date && d.exercise === exercise,
          );
          if (entry) {
            row[exercise] = Math.round(entry.bestOneRM);
          }
        }
        return row;
      });

      // Extend to today carrying forward each exercise's last PR
      const today = new Date().toISOString().slice(0, 10);
      if (data.length > 0 && (data[data.length - 1]!.date as string) < today) {
        const todayRow: Record<string, string | number> = { date: today };
        for (const exercise of selectedExercises) {
          if (bestSoFar[exercise]) {
            todayRow[exercise] = Math.round(bestSoFar[exercise]);
          }
        }
        data.push(todayRow);
      }

      const config: ChartConfig = {};
      for (const exercise of selectedExercises) {
        const exerciseInfo = topExercises?.find(
          (e) => e.displayName === exercise,
        );
        config[exercise] = {
          label: shortenName(exercise),
          color: categoryColor(exerciseInfo?.category ?? "Other"),
        };
      }

      return {
        chartData: data,
        chartConfig: config,
        dataKeys: selectedExercises,
        trendline: null,
      };
    }

    // "all" mode — every data point
    const dates = [...new Set(filtered.map((d) => d.date))].sort();

    const data = dates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const exercise of selectedExercises) {
        const entry = filtered.find(
          (d) => d.date === date && d.exercise === exercise,
        );
        if (entry) {
          row[exercise] = Math.round(entry.bestOneRM);
        }
      }
      return row;
    });

    // Extend to today with last known value per exercise
    const today = new Date().toISOString().slice(0, 10);
    if (data.length > 0 && (data[data.length - 1]!.date as string) < today) {
      const todayRow: Record<string, string | number> = { date: today };
      for (const exercise of selectedExercises) {
        // Find last data point for this exercise
        for (let i = data.length - 1; i >= 0; i--) {
          if (data[i]![exercise] != null) {
            todayRow[exercise] = data[i]![exercise]!;
            break;
          }
        }
      }
      data.push(todayRow);
    }

    const config: ChartConfig = {};
    for (const exercise of selectedExercises) {
      const exerciseInfo = topExercises?.find(
        (e) => e.displayName === exercise,
      );
      config[exercise] = {
        label: shortenName(exercise),
        color: categoryColor(exerciseInfo?.category ?? "Other"),
      };
    }

    return {
      chartData: data,
      chartConfig: config,
      dataKeys: selectedExercises,
      trendline: null,
    };
  }, [progressionData, selectedExercises, timeRange, topExercises, chartMode]);

  const toggleExercise = (name: string) => {
    setSelectedExercises((prev) =>
      prev.includes(name) ? prev.filter((e) => e !== name) : [...prev, name],
    );
  };

  const availableToAdd = useMemo(() => {
    if (!topExercises) return [];
    return topExercises
      .filter((e) => !selectedExercises.includes(e.displayName))
      .filter((e) =>
        search
          ? e.displayName.toLowerCase().includes(search.toLowerCase())
          : true,
      )
      .slice(0, 20);
  }, [topExercises, selectedExercises, search]);

  // Jan 1st vertical line timestamps
  const jan1Timestamps = useMemo(() => {
    if (chartData.length === 0) return [];
    const dates = chartData.map((d) => d.date as string).sort();
    const firstYear = parseInt(dates[0]!.slice(0, 4));
    const lastYear = parseInt(dates[dates.length - 1]!.slice(0, 4));
    const timestamps: number[] = [];
    for (let y = firstYear + 1; y <= lastYear + 1; y++) {
      timestamps.push(new Date(`${y}-01-01`).getTime());
    }
    return timestamps;
  }, [chartData]);

  const isLoading = loadingExercises || loadingProgression;

  if (isLoading && selectedExercises.length > 0) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-[350px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Time range + mode toggle + exercise pills */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Time range pills */}
        <div className="flex gap-1 rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-700">
          {TIME_RANGES.map((range) => (
            <button
              key={range.label}
              onClick={() => setTimeRange(range.months)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                timeRange === range.months
                  ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>

        {/* Chart mode toggle */}
        <div className="flex gap-1 rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-700">
          {CHART_MODES.map((mode) => (
            <button
              key={mode.value}
              onClick={() => setChartMode(mode.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                chartMode === mode.value
                  ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />

        {/* Exercises toggle button (mobile) */}
        <button
          onClick={() => setPillsExpanded(!pillsExpanded)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-700 md:hidden dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          {selectedExercises.length} exercises
          <CaretDownIcon
            className={`h-3 w-3 transition-transform ${pillsExpanded ? "rotate-180" : ""}`}
            weight="bold"
          />
        </button>

        {/* Exercise toggle pills - always visible on desktop */}
        <div className="hidden flex-wrap gap-1.5 md:flex">
          {selectedExercises.map((exercise) => {
            const exerciseInfo = topExercises?.find(
              (e) => e.displayName === exercise,
            );
            return (
              <button
                key={exercise}
                onClick={() => toggleExercise(exercise)}
                className="group flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-500"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: categoryColor(
                      exerciseInfo?.category ?? "Other",
                    ),
                  }}
                />
                {shortenName(exercise)}
                <XIcon className="h-3 w-3 text-neutral-400 transition-colors group-hover:text-neutral-600 dark:group-hover:text-neutral-200" />
              </button>
            );
          })}

          {/* Add exercise dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => {
                setDropdownOpen(!dropdownOpen);
                setSearch("");
              }}
              className="flex items-center gap-1 rounded-full border border-dashed border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
            >
              <PlusIcon className="h-3 w-3" weight="bold" />
              Add
            </button>

            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
                  <div className="border-b border-neutral-100 p-2 dark:border-neutral-700">
                    <input
                      type="text"
                      placeholder="Search exercises..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-none dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder:text-neutral-500"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {availableToAdd.length === 0 ? (
                      <p className="px-2 py-3 text-center text-xs text-neutral-400">
                        No exercises found
                      </p>
                    ) : (
                      availableToAdd.map((exercise) => (
                        <button
                          key={exercise.displayName}
                          onClick={() => {
                            toggleExercise(exercise.displayName);
                            setDropdownOpen(false);
                            setSearch("");
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor: categoryColor(exercise.category),
                            }}
                          />
                          <span className="truncate">
                            {exercise.displayName}
                          </span>
                          <span className="ml-auto shrink-0 text-neutral-400">
                            {Math.round(exercise.bestOneRM)} lbs
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Exercise toggle pills - mobile animated */}
      <AnimatePresence initial={false}>
        {pillsExpanded && (
          <motion.div
            className="flex flex-wrap gap-1.5 md:hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            {selectedExercises.map((exercise) => {
              const exerciseInfo = topExercises?.find(
                (e) => e.displayName === exercise,
              );
              return (
                <button
                  key={exercise}
                  onClick={() => toggleExercise(exercise)}
                  className="group flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-500"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: categoryColor(
                        exerciseInfo?.category ?? "Other",
                      ),
                    }}
                  />
                  {shortenName(exercise)}
                  <XIcon className="h-3 w-3 text-neutral-400 transition-colors group-hover:text-neutral-600 dark:group-hover:text-neutral-200" />
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Aggregate stats bar */}
      {chartMode === "aggregate" && trendline && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
          <span>
            Current:{" "}
            <span className="font-medium text-neutral-700 dark:text-neutral-200">
              {trendline.currentTotal.toLocaleString()} lbs
            </span>
          </span>
          <span>
            Projected max:{" "}
            <span className="font-medium text-neutral-700 dark:text-neutral-200">
              {Math.round(trendline.params.a).toLocaleString()} lbs
            </span>
          </span>
          <span>
            Progress:{" "}
            <span className="font-medium text-neutral-700 dark:text-neutral-200">
              {((trendline.currentTotal / trendline.params.a) * 100).toFixed(1)}
              %
            </span>
          </span>
          <span>
            Rate:{" "}
            <span className="font-medium text-neutral-700 dark:text-neutral-200">
              {Math.round(trendline.ratePerYear)} lbs/year
            </span>
          </span>
        </div>
      )}

      {/* Chart */}
      {selectedExercises.length === 0 ? (
        <div className="flex h-[350px] items-center justify-center rounded-xl border border-dashed border-neutral-200 dark:border-neutral-700">
          <p className="text-sm text-neutral-400">
            Select exercises to view progression
          </p>
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex h-[350px] items-center justify-center rounded-xl border border-dashed border-neutral-200 dark:border-neutral-700">
          <p className="text-sm text-neutral-400">
            No data for selected exercises
          </p>
        </div>
      ) : (
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[350px] w-full md:h-[350px]"
        >
          <ComposedChart
            data={chartData.map((d) => ({
              ...d,
              _ts: new Date(d.date as string).getTime(),
            }))}
            margin={{
              top: 5,
              right: chartMode === "aggregate" ? 40 : 10,
              left: 10,
              bottom: 5,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={true}
              horizontal={true}
              className="stroke-neutral-300/60 dark:stroke-neutral-600/60"
            />
            {/* Jan 1st vertical lines */}
            {jan1Timestamps.map((ts) => (
              <ReferenceLine
                key={ts}
                yAxisId="left"
                x={ts}
                stroke="hsl(var(--muted-foreground) / 0.4)"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{
                  value: new Date(ts).getFullYear().toString(),
                  position: "top",
                  fill: "hsl(var(--muted-foreground) / 0.4)",
                  fontSize: 9,
                }}
              />
            ))}
            <XAxis
              dataKey="_ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickLine={false}
              axisLine={{
                className: "stroke-neutral-300 dark:stroke-neutral-600",
              }}
              tickMargin={8}
              tickFormatter={(value: number) =>
                formatDate(new Date(value).toISOString().slice(0, 10))
              }
              minTickGap={40}
              className="text-[10px] fill-neutral-500 dark:fill-neutral-400"
            />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={{
                className: "stroke-neutral-300 dark:stroke-neutral-600",
              }}
              tickMargin={8}
              domain={["auto", "auto"]}
              tickFormatter={(value: number) => `${value}`}
              className="text-[10px] fill-neutral-500 dark:fill-neutral-400"
              label={{
                value:
                  chartMode === "aggregate"
                    ? "Total Est. 1RM (lbs)"
                    : "Est. 1RM (lbs)",
                angle: -90,
                position: "insideLeft",
                offset: 0,
                className:
                  "text-[10px] fill-neutral-400 dark:fill-neutral-500",
              }}
            />
            {chartMode === "aggregate" && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tickLine={false}
                axisLine={{
                  className: "stroke-neutral-300 dark:stroke-neutral-600",
                }}
                tickMargin={8}
                allowDecimals={false}
                className="text-[10px] fill-neutral-500 dark:fill-neutral-400"
                label={{
                  value: "PRs / month",
                  angle: 90,
                  position: "insideRight",
                  offset: 0,
                  className:
                    "text-[10px] fill-neutral-400 dark:fill-neutral-500",
                }}
              />
            )}
            <ChartTooltip
              content={
                chartMode === "aggregate" ? (
                  <AggregateTooltip />
                ) : (
                  <ChartTooltipContent
                    labelFormatter={(
                      _label,
                      payload,
                    ) => {
                      const item = (
                        payload as Record<string, unknown>[]
                      )?.[0]?.payload as
                        | Record<string, unknown>
                        | undefined;
                      return formatDateFull(
                        (item?.date as string) ?? "",
                      );
                    }}
                  />
                )
              }
            />
            {chartMode === "aggregate" && (
              <Bar
                yAxisId="right"
                dataKey="prCount"
                name="PRs this month"
                fill="hsl(var(--chart-2))"
                opacity={0.25}
                activeBar={{ opacity: 0.6 }}
                barSize={20}
              />
            )}
            {/* Trendline (dashed red) */}
            {chartMode === "aggregate" && trendline && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="trendTotal"
                name="Trendline"
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
            {/* Asymptote line (green dashed) */}
            {chartMode === "aggregate" && trendline && (
              <ReferenceLine
                yAxisId="left"
                y={Math.round(trendline.params.a)}
                stroke="#22c55e"
                strokeDasharray="6 3"
                strokeWidth={1.5}
                label={{
                  value: `${Math.round(trendline.params.a).toLocaleString()} lbs`,
                  position: "right",
                  fill: "#22c55e",
                  fontSize: 10,
                }}
              />
            )}
            {/* July 1st anchor points (red stars) */}
            {chartMode === "aggregate" &&
              trendline?.julyPoints.map((jp) => (
                <ReferenceDot
                  key={jp.date}
                  yAxisId="left"
                  x={jp._ts}
                  y={jp.total}
                  r={5}
                  fill="#ef4444"
                  stroke="#ef4444"

                  label={{
                    value: jp.total.toLocaleString(),
                    position: "top",
                    fill: "#ef4444",
                    fontSize: 9,
                    offset: 8,
                  }}
                />
              ))}
            {/* Next July 1st target (green star) */}
            {chartMode === "aggregate" && trendline?.targetPoint && (
              <ReferenceDot
                yAxisId="left"
                x={trendline.targetPoint._ts}
                y={trendline.targetPoint.total}
                r={6}
                fill="#22c55e"
                stroke="#22c55e"
                label={{
                  value: `${trendline.targetPoint.total.toLocaleString()} lbs`,
                  position: "top",
                  fill: "#22c55e",
                  fontSize: 10,
                  offset: 10,
                }}
              />
            )}
            {dataKeys.map((key) => (
              <Line
                key={key}
                yAxisId="left"
                type="monotone"
                dataKey={key}
                name={key}
                stroke={chartConfig[key]?.color}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </ComposedChart>
        </ChartContainer>
      )}
    </div>
  );
}
