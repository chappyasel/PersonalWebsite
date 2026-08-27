"use client";

import { WorkoutDetailModal } from "../components/WorkoutDetailModal";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  formatValueUnit,
  ordinalDate,
  shortenValue,
  slashDate,
  toBackgroundColor,
  toTextColor,
} from "../lib/wlaFormat";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useId, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import type { ExerciseInstance } from "~/server/queries/weightliftingExercise";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "~/components/ui/chart";

/**
 * Mirrors the app's ExerciseAnalyticsViewController section for section,
 * using the exact control shapes, titles, and formats extracted from the
 * app source: segmented sort picker (SetStyleUtil.sorts order), the
 * "All-Time Bests" podium bars (3rd–1st–2nd, height ratio 0.44/1/0.72),
 * an index-spaced graph shaped by Recent/Top/Average
 * (ADEDGraphTableViewCell), the Show More panel, the Recent/Top/Average +
 * time-span query controls, and the instance rows with per-set chips.
 */

type MetricKey = "oneRM" | "volume" | "maxWeight" | "reps" | "maxReps";
type QueryType = "recent" | "top" | "average";
type TimeSpanKey = "all" | "year" | "90d" | "30d";

// SetStyleUtil.sorts for reps_weight: [.oneRM, .volume, .maxWeight, .reps, .maxReps]
const METRICS: {
  key: MetricKey;
  pickerTitle: string;
  graphTitle: string;
  badgePrefix: string;
  unit: "lbs" | "reps";
  setValue: (set: ExerciseInstance["sets"][number]) => number;
}[] = [
  {
    key: "oneRM",
    pickerTitle: "One-Rep Max",
    graphTitle: "1RM Equivalents",
    badgePrefix: "1RMe: ",
    unit: "lbs",
    setValue: (s) => s.oneRM ?? 0,
  },
  {
    key: "volume",
    pickerTitle: "Volume",
    graphTitle: "Total Volumes",
    badgePrefix: "Tot: ",
    unit: "lbs",
    setValue: (s) => s.volume ?? 0,
  },
  {
    key: "maxWeight",
    pickerTitle: "Max Weight",
    graphTitle: "Max Weights",
    badgePrefix: "Max: ",
    unit: "lbs",
    setValue: (s) => s.weight ?? 0,
  },
  {
    key: "reps",
    pickerTitle: "Total Reps",
    graphTitle: "Total Reps",
    badgePrefix: "Tot: ",
    unit: "reps",
    setValue: (s) => s.reps ?? 0,
  },
  {
    key: "maxReps",
    pickerTitle: "Max Reps",
    graphTitle: "Max Reps",
    badgePrefix: "Max: ",
    unit: "reps",
    setValue: (s) => s.reps ?? 0,
  },
];

const QUERY_TYPES: { key: QueryType; label: string }[] = [
  { key: "recent", label: "Recent" },
  { key: "top", label: "Top" },
  { key: "average", label: "Average" },
];

// TimeSpan.swift titles
const TIME_SPANS: { key: TimeSpanKey; label: string; days: number | null }[] = [
  { key: "all", label: "All-Time", days: null },
  { key: "year", label: "12-Month", days: 365 },
  { key: "90d", label: "90-Day", days: 90 },
  { key: "30d", label: "30-Day", days: 30 },
];

type InstanceWithMetrics = ExerciseInstance & {
  values: Record<MetricKey, number>;
  /** maxOneRMSetDescription, "8 x 225" (the app uses spaces here) */
  bestSetDescription: string;
};

function computeInstanceMetrics(
  instance: ExerciseInstance,
): InstanceWithMetrics {
  let oneRM = 0;
  let maxWeight = 0;
  let maxReps = 0;
  let volume = 0;
  let reps = 0;
  let bestSetDescription = "";
  for (const set of instance.sets) {
    if (set.oneRM != null && set.oneRM > oneRM) {
      oneRM = set.oneRM;
      if (set.reps != null && set.weight != null) {
        bestSetDescription = `${set.reps} x ${Math.round(set.weight)}`;
      }
    }
    if (set.weight != null && set.weight > maxWeight) maxWeight = set.weight;
    if (set.reps != null && set.reps > maxReps) maxReps = set.reps;
    volume += set.volume ?? 0;
    reps += set.reps ?? 0;
  }
  return {
    ...instance,
    values: { oneRM, volume, maxWeight, reps, maxReps },
    bestSetDescription,
  };
}

/** ADEDUtil.podiumSubtitle */
function podiumSubtitle(
  instance: InstanceWithMetrics,
  metric: MetricKey,
): string {
  switch (metric) {
    case "oneRM":
      return instance.bestSetDescription;
    case "maxWeight": {
      const set = instance.sets.find(
        (s) => s.weight === instance.values.maxWeight,
      );
      return set?.reps != null ? formatValueUnit(set.reps, "reps") : "";
    }
    case "maxReps": {
      const set = instance.sets.find((s) => s.reps === instance.values.maxReps);
      return set?.weight != null ? formatValueUnit(set.weight, "lbs") : "";
    }
    case "volume":
    case "reps":
      return formatValueUnit(instance.sets.length, "sets");
  }
}

/** BTSet.description for reps_weight chips: "8x225" / "5x187.5" — no
 *  spaces, decimals kept (the app never rounds set weights) */
function chipText(set: ExerciseInstance["sets"][number]): string {
  if (set.reps != null && set.weight != null)
    return `${set.reps}x${set.weight}`;
  if (set.reps != null) return `${set.reps} reps`;
  return "—";
}

/**
 * BTSegmentedControl `.custom`: equal segments on a rounded track, the
 * selection a sliding box filled with the category color's pastel
 * (toBackgroundColor) carrying its darkened text (toTextColor).
 */
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  color,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  color: string;
}) {
  const layoutGroup = useId();
  const bg = toBackgroundColor(color);
  const text = toTextColor(color);

  return (
    <div
      className="flex w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800"
      style={
        {
          "--seg-bg": bg.light,
          "--seg-bg-d": bg.dark,
          "--seg-tx": text.light,
          "--seg-tx-d": text.dark,
        } as React.CSSProperties
      }
    >
      {options.map((option) => {
        const selected = value === option.key;
        return (
          <button
            key={option.key}
            onClick={() => onChange(option.key)}
            className="relative flex-1 px-1 py-2.5 text-[13px] font-semibold"
          >
            {selected && (
              <motion.span
                layoutId={layoutGroup}
                className="absolute inset-0 bg-[var(--seg-bg)] dark:bg-[var(--seg-bg-d)]"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span
              className={
                selected
                  ? "relative text-[var(--seg-tx)] dark:text-[var(--seg-tx-d)]"
                  : "relative text-neutral-500 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              }
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-center text-[17px] font-semibold text-neutral-500 dark:text-neutral-400">
      {children}
    </h2>
  );
}

function GraphTooltip({
  active,
  payload,
  metric,
  queryType,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
  metric: (typeof METRICS)[number];
  queryType: QueryType;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0]!.payload;
  const date = data.date as string | undefined;
  const rank = data.rank as number | undefined;
  const value = data.value as number | undefined;
  const setDescription = data.setDescription as string | undefined;

  // BTRoundMarker: pastel pill, darkened text; 1RM shows "8 x 225" above the
  // value. Elevated with a shadow + ring so it reads against the graph fill.
  return (
    <div className="rounded-lg bg-[var(--seg-bg)] px-2.5 py-1.5 text-center text-[10px] font-bold leading-tight text-[var(--seg-tx)] shadow-lg ring-1 ring-black/10 dark:bg-[var(--seg-bg-d)] dark:text-[var(--seg-tx-d)] dark:ring-white/15">
      {setDescription && <div>{setDescription}</div>}
      {value != null && <div>{formatValueUnit(value, metric.unit)}</div>}
      <div className="opacity-70">
        {queryType === "top" && rank != null ? `#${rank} · ` : ""}
        {date ? slashDate(date) : ""}
      </div>
    </div>
  );
}

export function ExerciseExplorer({
  instances,
  color,
}: {
  instances: ExerciseInstance[];
  color: string;
}) {
  const [metricKey, setMetricKey] = useState<MetricKey>("oneRM");
  const [queryType, setQueryType] = useState<QueryType>("recent");
  const [timeSpan, setTimeSpan] = useState<TimeSpanKey>("all");
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [previewWorkout, setPreviewWorkout] = useState<string | null>(null);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const gradientId = useId();
  const metric = METRICS.find((m) => m.key === metricKey)!;
  const segColors = {
    "--seg-bg": toBackgroundColor(color).light,
    "--seg-bg-d": toBackgroundColor(color).dark,
    "--seg-tx": toTextColor(color).light,
    "--seg-tx-d": toTextColor(color).dark,
  } as React.CSSProperties;

  const withMetrics: InstanceWithMetrics[] = useMemo(
    () => instances.map(computeInstanceMetrics),
    [instances],
  );

  const spanCutoff = useMemo(() => {
    const span = TIME_SPANS.find((s) => s.key === timeSpan)!;
    if (queryType !== "top" || span.days == null) return null;
    return new Date(Date.now() - span.days * 86400_000)
      .toISOString()
      .slice(0, 10);
  }, [queryType, timeSpan]);

  const spanFiltered = useMemo(
    () =>
      spanCutoff
        ? withMetrics.filter((i) => i.date >= spanCutoff)
        : withMetrics,
    [withMetrics, spanCutoff],
  );

  // Podium is all-time except the app's one carve-out: Top + 30-Day
  const podium = useMemo(() => {
    const source =
      queryType === "top" && timeSpan === "30d" ? spanFiltered : withMetrics;
    return [...source]
      .filter((i) => i.values[metricKey] > 0)
      .sort(
        (a, b) =>
          b.values[metricKey] - a.values[metricKey] || b.ts.localeCompare(a.ts),
      )
      .slice(0, 3);
  }, [withMetrics, spanFiltered, queryType, timeSpan, metricKey]);

  // ADEDGraphTableViewCell.dataForQuery: one point per instance, all
  // index-spaced (the app's default): Recent chronological, Top ranked,
  // Average a 3-instance rolling mean (bucketed for large histories).
  // Zero/set-less instances are excluded BEFORE any averaging.
  const graphData = useMemo(() => {
    const valid = spanFiltered.filter((i) => i.values[metricKey] > 0);
    const chronological = [...valid].sort((a, b) => a.ts.localeCompare(b.ts));

    if (queryType === "average") {
      const n = chronological.length;
      const rows: { _i: number; date: string; value: number }[] = [];
      if (n < 3) return rows;
      if (n < 36) {
        let sum =
          chronological[0]!.values[metricKey] +
          chronological[1]!.values[metricKey];
        for (let i = 2; i < n; i++) {
          sum += chronological[i]!.values[metricKey];
          rows.push({
            _i: rows.length,
            date: chronological[i]!.date,
            value: Math.round(sum / 3),
          });
          sum -= chronological[i - 2]!.values[metricKey];
        }
      } else {
        const num = Math.min(10, Math.floor(n / 12));
        for (let i = n % num; i < n; i += num) {
          let sum = 0;
          for (let j = i; j < i + num; j++)
            sum += chronological[j]!.values[metricKey];
          rows.push({
            _i: rows.length,
            date: chronological[i + num - 1]!.date,
            value: Math.round(sum / num),
          });
        }
      }
      return rows;
    }

    const source =
      queryType === "top"
        ? [...valid].sort(
            (a, b) =>
              b.values[metricKey] - a.values[metricKey] ||
              b.ts.localeCompare(a.ts),
          )
        : chronological;

    return source.map((instance, i) => ({
      _i: i,
      rank: i + 1,
      date: instance.date,
      value: Math.round(instance.values[metricKey]),
      setDescription:
        metricKey === "oneRM" ? instance.bestSetDescription : undefined,
    }));
  }, [spanFiltered, queryType, metricKey]);

  const graphTitle =
    queryType === "recent"
      ? `Recent ${metric.graphTitle}`
      : queryType === "top"
        ? `Top ${metric.graphTitle}`
        : `${metric.graphTitle}: Rolling Average`;

  const listed = useMemo(() => {
    if (queryType === "top") {
      return [...spanFiltered].sort(
        (a, b) =>
          b.values[metricKey] - a.values[metricKey] || b.ts.localeCompare(a.ts),
      );
    }
    return [...spanFiltered].sort((a, b) => b.ts.localeCompare(a.ts));
  }, [spanFiltered, queryType, metricKey]);

  // Show More data (ADEDViewMoreTableViewCell)
  const setProgressions = useMemo(() => {
    // Last 10 instances that actually have sets; latest drawn solid
    const recent = [...withMetrics]
      .filter((i) => i.sets.length > 0)
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, 10)
      .reverse();
    const maxSets = Math.max(0, ...recent.map((i) => i.sets.length));
    const rows: Record<string, number | undefined>[] = [];
    for (let setIndex = 0; setIndex < maxSets; setIndex++) {
      const row: Record<string, number | undefined> = { _set: setIndex + 1 };
      recent.forEach((instance, i) => {
        const set = instance.sets[setIndex];
        row[`line${i}`] = set ? Math.round(metric.setValue(set)) : undefined;
      });
      rows.push(row);
    }
    return { rows, lineCount: recent.length, maxSets };
  }, [withMetrics, metric]);

  const workoutSplit = useMemo(() => {
    const counts = new Map<string, number>();
    for (const instance of [...withMetrics]
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, 25)) {
      const name = instance.workoutName || "Unnamed";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(([name, count]) => ({ name, count }));
  }, [withMetrics]);

  const summaryStats = useMemo(() => {
    let totalVolume = 0;
    let totalSets = 0;
    let totalOneRM = 0;
    let oneRMCount = 0;
    for (const instance of withMetrics) {
      totalVolume += instance.values.volume;
      totalSets += instance.sets.length;
      if (instance.values.oneRM > 0) {
        totalOneRM += instance.values.oneRM;
        oneRMCount++;
      }
    }
    // Average over instances that HAVE a 1RM — set-less days don't drag it
    const averageOneRM = oneRMCount > 0 ? totalOneRM / oneRMCount : 0;
    return [
      {
        label: "Total Volume",
        value: shortenValue(Math.round(totalVolume)),
        unit: "lbs",
      },
      { label: "Total Sets", value: totalSets.toLocaleString(), unit: "" },
      {
        label: "Average 1RMe",
        value: shortenValue(Math.round(averageOneRM)),
        unit: "lbs",
      },
    ];
  }, [withMetrics]);

  const config: ChartConfig = { value: { label: graphTitle, color } };
  const podiumOrder = [2, 0, 1]; // render 3rd, 1st, 2nd left to right
  // PodiumView height ratios: 1st = 120, 2nd = 0.72, 3rd = 0.44
  const podiumHeights = ["h-[120px]", "h-[86px]", "h-[53px]"]; // indexed by rank
  // The app windows the graph to 8 visible points; showing the full history
  // at once means dots only stay legible on sparse series
  const showDots = graphData.length <= 60;
  const xTicks = useMemo(() => {
    const n = graphData.length;
    if (n <= 8) return graphData.map((r) => r._i);
    const step = (n - 1) / 7;
    return Array.from({ length: 8 }, (_, i) => Math.round(i * step));
  }, [graphData]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-5" style={segColors}>
        {/* Sort picker (ADEDSectionSelectSort) */}
        <SegmentedControl
          options={METRICS.map((m) => ({ key: m.key, label: m.pickerTitle }))}
          value={metricKey}
          onChange={setMetricKey}
          color={color}
        />

        {/* Podium (ADEDSectionPodium) */}
        {podium.length > 0 && (
          <section>
            <SectionTitle>All-Time Bests</SectionTitle>
            <div className="grid grid-cols-3 items-end gap-2.5">
              {podiumOrder.map((rankIndex) => {
                const instance = podium[rankIndex];
                return (
                  <div key={rankIndex} className="flex flex-col justify-end">
                    <div
                      className={`${podiumHeights[rankIndex]} flex flex-col items-center overflow-hidden rounded-2xl border border-neutral-200 bg-white px-2 pt-2 dark:border-neutral-700 dark:bg-neutral-800`}
                    >
                      {instance ? (
                        <>
                          <p className="text-center font-bold leading-tight text-neutral-700 dark:text-neutral-200">
                            <span className="text-base">
                              {shortenValue(
                                Math.round(instance.values[metricKey]),
                              )}
                            </span>{" "}
                            <span className="text-[13px] font-semibold">
                              {metric.unit}
                            </span>
                          </p>
                          <p className="text-center text-[10px] font-bold text-neutral-500 opacity-80 dark:text-neutral-400">
                            {podiumSubtitle(instance, metricKey)}
                          </p>
                        </>
                      ) : (
                        <p className="text-base font-bold text-neutral-400">
                          -
                        </p>
                      )}
                    </div>
                    <p className="mt-1 h-5 text-center text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">
                      {instance ? ordinalDate(instance.date) : "N/A"}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Graph (ADEDSectionGraph) */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <SectionTitle>{graphTitle}</SectionTitle>
          {graphData.length === 0 ? (
            <div className="flex h-[240px] items-center justify-center">
              <p className="text-[13px] font-black text-neutral-400">
                Not Enough Data
              </p>
            </div>
          ) : (
            <ChartContainer
              config={config}
              className="aspect-auto h-[240px] w-full"
            >
              <ComposedChart
                data={graphData}
                margin={{ top: 8, right: 28, left: 0, bottom: 8 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  className="stroke-neutral-300/60 dark:stroke-neutral-600/60"
                />
                <XAxis
                  dataKey="_i"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickLine={false}
                  axisLine={{
                    className: "stroke-neutral-300 dark:stroke-neutral-600",
                  }}
                  tickMargin={10}
                  angle={-20}
                  tickFormatter={(value: number) => {
                    const row = graphData[Math.round(value)];
                    if (!row) return "";
                    return queryType === "top"
                      ? `#${(row as { rank?: number }).rank ?? Math.round(value) + 1}`
                      : slashDate(row.date);
                  }}
                  ticks={xTicks}
                  interval={0}
                  className="fill-neutral-500 text-[9px] font-medium dark:fill-neutral-400"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  domain={["auto", "auto"]}
                  tickFormatter={(value: number) => shortenValue(value)}
                  className="fill-neutral-500 text-[9px] font-medium dark:fill-neutral-400"
                  width={40}
                />
                <ChartTooltip
                  cursor={{
                    stroke: color,
                    strokeOpacity: 0.35,
                    strokeWidth: 2,
                  }}
                  // pin to the top of the plot so the pill never sits on the
                  // line or fill; x still follows the hovered point
                  position={{ y: 4 }}
                  offset={16}
                  content={
                    <GraphTooltip metric={metric} queryType={queryType} />
                  }
                />
                <Area
                  type="linear"
                  dataKey="value"
                  stroke="none"
                  fill={`url(#${gradientId})`}
                  isAnimationActive={!reduceMotion}
                  animationDuration={600}
                  animationEasing="ease-in-out"
                />
                <Line
                  type="linear"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={3}
                  isAnimationActive={!reduceMotion}
                  animationDuration={600}
                  animationEasing="ease-in-out"
                  dot={
                    showDots
                      ? {
                          r: 4,
                          stroke: color,
                          strokeWidth: 2,
                          className: "fill-white dark:fill-neutral-800",
                        }
                      : false
                  }
                  activeDot={{ r: 5, fill: color }}
                />
              </ComposedChart>
            </ChartContainer>
          )}
        </section>

        {/* Show More (ADEDSectionMore) */}
        <section>
          <button
            onClick={() => setMoreExpanded(!moreExpanded)}
            className="w-full rounded-2xl border border-neutral-200 bg-white py-3 text-[17px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700/60"
          >
            {moreExpanded ? "Show Less" : "Show More"}
          </button>
          <AnimatePresence initial={false}>
            {moreExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                style={{ overflow: "hidden" }}
              >
                <div className="space-y-5 pt-5">
                  {/* Recent Set Progressions: multi-set only, no gradient,
                    unrotated set-number x labels, latest solid */}
                  {setProgressions.maxSets > 1 && (
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
                      <SectionTitle>Recent Set Progressions</SectionTitle>
                      <ChartContainer
                        config={{}}
                        className="aspect-auto h-[200px] w-full"
                      >
                        <LineChart
                          data={setProgressions.rows}
                          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            className="stroke-neutral-300/60 dark:stroke-neutral-600/60"
                          />
                          <XAxis
                            dataKey="_set"
                            tickLine={false}
                            axisLine={{
                              className:
                                "stroke-neutral-300 dark:stroke-neutral-600",
                            }}
                            tickMargin={8}
                            className="fill-neutral-500 text-[9px] font-medium dark:fill-neutral-400"
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            domain={["auto", "auto"]}
                            tickFormatter={(value: number) =>
                              shortenValue(value)
                            }
                            className="fill-neutral-500 text-[9px] font-medium dark:fill-neutral-400"
                            width={40}
                          />
                          {Array.from(
                            { length: setProgressions.lineCount },
                            (_, i) => (
                              <Line
                                key={i}
                                type="linear"
                                dataKey={`line${i}`}
                                stroke={color}
                                strokeOpacity={
                                  i === setProgressions.lineCount - 1 ? 1 : 0.25
                                }
                                strokeWidth={2.5}
                                dot={false}
                                isAnimationActive={false}
                              />
                            ),
                          )}
                        </LineChart>
                      </ChartContainer>
                    </div>
                  )}

                  {/* Recent Workouts: donut of the last 25 instances' workout
                    names, every slice the category color at 40% */}
                  {workoutSplit.length > 0 && (
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
                      <SectionTitle>Recent Workouts</SectionTitle>
                      <div className="flex flex-col items-center gap-4 md:flex-row">
                        <ChartContainer
                          config={{}}
                          className="aspect-square h-[185px]"
                        >
                          <PieChart>
                            <Pie
                              data={workoutSplit}
                              dataKey="count"
                              nameKey="name"
                              innerRadius="40%"
                              outerRadius="90%"
                              paddingAngle={2}
                              stroke="none"
                              isAnimationActive={false}
                              label={(props: {
                                value?: number;
                                cx?: number;
                                cy?: number;
                                midAngle?: number;
                                innerRadius?: number;
                                outerRadius?: number;
                              }) => {
                                // BTPieGraph keeps the value INSIDE the slice
                                const { cx = 0, cy = 0, midAngle = 0 } = props;
                                const r =
                                  ((props.innerRadius ?? 0) +
                                    (props.outerRadius ?? 0)) /
                                  2;
                                const rad = (-midAngle * Math.PI) / 180;
                                return (
                                  <text
                                    x={cx + r * Math.cos(rad)}
                                    y={cy + r * Math.sin(rad)}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    className="fill-neutral-600 text-[11px] font-bold dark:fill-neutral-200"
                                  >
                                    {props.value}
                                  </text>
                                );
                              }}
                              labelLine={false}
                            >
                              {workoutSplit.map((slice) => (
                                <Cell
                                  key={slice.name}
                                  fill={color}
                                  opacity={0.4}
                                />
                              ))}
                            </Pie>
                          </PieChart>
                        </ChartContainer>
                        <ul className="w-full flex-1 space-y-1 text-sm">
                          {workoutSplit.map((slice) => (
                            <li
                              key={slice.name}
                              className="flex items-baseline gap-2"
                            >
                              <span
                                className="h-2.5 w-2.5 shrink-0 self-center rounded-full"
                                style={{ backgroundColor: color, opacity: 0.4 }}
                              />
                              <span className="min-w-0 flex-1 break-words text-neutral-700 dark:text-neutral-300">
                                {slice.name}
                              </span>
                              <span className="shrink-0 text-xs tabular-nums text-neutral-400 dark:text-neutral-500">
                                {slice.count}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Exercise stats: SF-rounded numbers, Average 1RMe */}
                  <div className="grid grid-cols-3 gap-2.5 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
                    {summaryStats.map((stat) => (
                      <div key={stat.label} className="text-center">
                        <p className="font-rounded text-2xl font-bold text-neutral-500 dark:text-neutral-300">
                          {stat.value}
                          {stat.unit && (
                            <span className="text-base font-semibold">
                              {" "}
                              {stat.unit}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                          {stat.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Query controls (ADEDSectionSelectQuery) */}
        <section className="space-y-2.5">
          <SegmentedControl
            options={QUERY_TYPES.map((q) => ({ key: q.key, label: q.label }))}
            value={queryType}
            onChange={setQueryType}
            color={color}
          />
          <AnimatePresence initial={false}>
            {queryType === "top" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                style={{ overflow: "hidden" }}
              >
                <SegmentedControl
                  options={TIME_SPANS.map((s) => ({
                    key: s.key,
                    label: s.label,
                  }))}
                  value={timeSpan}
                  onChange={setTimeSpan}
                  color={color}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Instance rows (ADEDSectionExercises) */}
        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
          {listed.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-400">
              No instances in this time span
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-700/60">
              {listed.map((instance, i) => (
                <li key={`${instance.ts}-${i}`}>
                  <button
                    onClick={() => setPreviewWorkout(instance.workoutUuid)}
                    className="w-full px-3.5 py-2 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-400 dark:hover:bg-neutral-700/40 dark:focus-visible:ring-neutral-500"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-700 dark:text-neutral-200">
                        {ordinalDate(instance.date)}
                        {instance.workoutName
                          ? `: ${instance.workoutName}`
                          : ""}
                      </p>
                      <p className="shrink-0 text-[10px] font-semibold tabular-nums text-neutral-700 dark:text-neutral-200">
                        {metric.badgePrefix}
                        {formatValueUnit(
                          instance.values[metricKey],
                          metric.unit,
                        )}
                      </p>
                    </div>
                    {instance.sets.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {instance.sets.map((set, setIndex) => (
                          <span
                            key={setIndex}
                            className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300"
                          >
                            {chipText(set)}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <WorkoutDetailModal
          target={
            previewWorkout !== null ? { workoutUuid: previewWorkout } : null
          }
          onClose={() => setPreviewWorkout(null)}
        />
      </div>
    </MotionConfig>
  );
}
