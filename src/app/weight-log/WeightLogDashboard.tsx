"use client";

import { useId, useMemo, useState } from "react";
import {
  ComposedChart,
  Customized,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  PHASE_COLORS,
  buildWeightChart,
  dayString,
  dayTime,
} from "~/lib/weight-log/chart";
import { fitPartition } from "~/lib/weight-log/estimates";
import {
  bodyFatAxis,
  calendarAxis,
  phaseColorAt,
  weightAxis,
} from "~/lib/weight-log/presentation";
import type { WeightLog } from "~/lib/weight-log/schema";

import { DexaChart } from "./DexaChart";
import { PhaseGradient } from "./PhaseGradient";
import { WeightHistoryCalendar } from "./WeightHistoryCalendar";

const referenceColor = "#64748b";
const lineStyles = {
  weight: "",
  weekly: "",
  target: "4 4",
  originalTarget: "1 4",
  trailing: "9 3",
  annual: "2 4",
  setPoints: "6 5",
  projections: "14 5",
  bodyFat: "8 3 2 3",
};
function LineSwatch({ dash, dot = false }: { dash: string; dot?: boolean }) {
  return (
    <svg width="30" height="12" aria-hidden="true">
      {dot ? (
        <circle cx="15" cy="6" r="2.5" fill="currentColor" />
      ) : (
        <line
          x1="0"
          x2="30"
          y1="6"
          y2="6"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={dash}
        />
      )}
    </svg>
  );
}
const labels = {
  weight: "Weigh-ins",
  weekly: "Weekly average",
  target: "Target",
  originalTarget: "Original target",
  trailing: "7-day trend",
  annual: "12-month average",
  setPoints: "Set points",
  projections: "Future plan",
  bodyFat: "Body fat %",
};
const formatDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const lb = (value: number | null | undefined) =>
  value == null ? "—" : `${value.toFixed(1)} lb`;
const control =
  "rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm dark:border-neutral-700";

function PhaseDot({
  cx,
  cy,
  payload,
  radius,
  outlined = false,
  phases,
}: {
  cx?: number;
  cy?: number;
  payload?: { time?: number };
  radius: number;
  outlined?: boolean;
  phases: WeightLog["phases"];
}) {
  if (cx == null || cy == null || !Number.isFinite(cx) || !Number.isFinite(cy))
    return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill={phaseColorAt(payload?.time ?? NaN, phases)}
      stroke={outlined ? "white" : "none"}
      strokeWidth={outlined ? 1 : 0}
    />
  );
}

function BodyFatTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: number };
}) {
  if (!payload) return null;
  const major = payload.value % 4 === 0;
  return (
    <text
      className="recharts-cartesian-axis-tick-value"
      x={x}
      y={y}
      dy={3}
      textAnchor="start"
      fill="currentColor"
      opacity={major ? 0.8 : 0.45}
      fontSize={10}
      fontWeight={major ? 600 : 400}
    >
      {payload.value}%
    </text>
  );
}

export function WeightLogDashboard({ log }: { log: WeightLog }) {
  const full = useMemo(() => buildWeightChart(log), [log]);
  const first = full[0]?.date ?? "";
  const last = full.at(-1)?.date ?? "";
  const [start, setStart] = useState(first);
  const [end, setEnd] = useState(last);
  const [phase, setPhase] = useState("all");
  const [visible, setVisible] = useState({
    weight: false,
    weekly: false,
    target: false,
    originalTarget: false,
    trailing: true,
    annual: false,
    setPoints: false,
    projections: false,
    bodyFat: false,
  });
  const [layersOpen, setLayersOpen] = useState(false);
  const chartId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const phaseGradientId = `${chartId}-phase`;
  const phaseStroke = `url(#${phaseGradientId})`;
  const phaseDot = (radius: number, outlined = false) => (
    <PhaseDot radius={radius} outlined={outlined} phases={log.phases} />
  );
  const rangeValid = start !== "" && end !== "" && start <= end;
  // Filters change the view, not the model's calibration or smoothing context.
  const selected = useMemo(
    () =>
      phase === "all"
        ? full
        : full.map((point) => ({
            ...point,
            weight: point.phaseId === phase ? point.weight : null,
            weekly: point.phaseSeries[phase]?.weekly ?? null,
            target: point.phaseSeries[phase]?.target ?? null,
          })),
    [phase, full],
  );
  const partition = useMemo(() => fitPartition(log.scans), [log.scans]);
  const chartPhases = log.phases.filter(
    (item) => phase === "all" || item.id === phase,
  );
  const data = selected.filter(
    (point) => rangeValid && point.date >= start && point.date <= end,
  );
  const readings = data.filter((point) => point.weight !== null);
  const latest = readings.at(-1);
  const firstReading = readings[0];
  const allReadings = full.filter((point) => point.weight !== null);
  const lastObserved = allReadings.at(-1)?.date ?? last;
  const chartData = data.map((point) => ({
    ...point,
    phaseSeries: Object.fromEntries(
      Object.entries(point.phaseSeries).map(([id, series]) => [
        id,
        { ...series, target: point.date > lastObserved ? null : series.target },
      ]),
    ),
  }));
  const scans = log.scans
    .filter((scan) => rangeValid && scan.date >= start && scan.date <= end)
    .map((scan) => ({ ...scan, time: dayTime(scan.date) }));
  const bounds: [number, number] = [data[0]?.time ?? 0, data.at(-1)?.time ?? 1];
  const bodyFatScale = bodyFatAxis(chartData, visible.projections);
  const weightAxisVisible =
    visible.weight ||
    visible.weekly ||
    visible.target ||
    visible.originalTarget ||
    visible.trailing ||
    visible.annual ||
    visible.projections ||
    (visible.setPoints && log.setPoints.length > 0);
  const timeScale = calendarAxis(bounds);
  const weightScale = weightAxis(
    chartData
      .flatMap((point) => [
        visible.weight ? point.weight : null,
        visible.trailing ? point.trailing : null,
        visible.annual ? point.annual : null,
        ...chartPhases.flatMap((item) => {
          const series = point.phaseSeries[item.id];
          return [
            visible.weekly ? (series?.weekly ?? null) : null,
            visible.target ? (series?.target ?? null) : null,
            visible.originalTarget ? (series?.originalTarget ?? null) : null,
            visible.projections ? (series?.projection ?? null) : null,
          ];
        }),
      ])
      .concat(
        visible.setPoints ? log.setPoints.map((point) => point.weight) : [],
      ),
  );
  const hasOverlappingPhases =
    new Set(log.weeks.map((week) => week.date)).size < log.weeks.length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <a
            href={
              process.env.NODE_ENV === "production"
                ? "https://weightlifting.chappyasel.com"
                : "/weightlifting"
            }
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Weightlifting
          </a>
          <h1 className="mt-5 font-rounded text-3xl font-semibold sm:text-4xl">
            Weight Log
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {allReadings.length.toLocaleString()} weigh-ins
            {allReadings[0] && allReadings.at(-1)
              ? ` · ${formatDate(allReadings[0].date)} to ${formatDate(allReadings.at(-1)!.date)}`
              : ""}
          </p>
        </div>
        <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-muted-foreground dark:border-neutral-700">
          Private · Read only
        </span>
      </header>

      <section
        aria-label="Chart filters"
        className="flex flex-wrap items-end gap-3"
      >
        <label className="space-y-1 text-xs text-muted-foreground">
          Phase
          <select
            value={phase}
            className={`block ${control}`}
            onChange={(event) => {
              const selected = log.phases.find(
                (item) => item.id === event.target.value,
              );
              setPhase(event.target.value);
              setStart(selected?.start ?? first);
              setEnd(selected?.end ?? last);
            }}
          >
            <option value="all">All phases</option>
            {log.phases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.kind === "other"
                  ? ""
                  : `${item.kind === "bulk" ? "Bulk" : item.kind === "maintenance" ? "Maintain" : "Cut"} · `}
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={start}
            min={first}
            max={end || last}
            className={`block ${control}`}
            onChange={(event) => {
              setStart(event.target.value);
            }}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={end}
            min={start || first}
            max={last}
            className={`block ${control}`}
            onChange={(event) => {
              setEnd(event.target.value);
            }}
          />
        </label>
        <button
          className={control}
          onClick={() => {
            setPhase("all");
            setStart(first);
            setEnd(last);
          }}
        >
          Full history
        </button>
        <button
          className={control}
          onClick={() => {
            setPhase("all");
            setEnd(lastObserved);
            setStart(
              dayString(
                Math.max(
                  dayTime(first),
                  dayTime(lastObserved) - 365 * 86_400_000,
                ),
              ),
            );
          }}
        >
          Last year
        </button>
        <button
          className={control}
          onClick={() => {
            setPhase("all");
            setStart(
              dayString(
                Math.max(
                  dayTime(first),
                  dayTime(lastObserved) - 90 * 86_400_000,
                ),
              ),
            );
            setEnd(last);
          }}
        >
          Recent + plan
        </button>
      </section>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Latest in view", lb(latest?.weight)],
          [
            "Change in view",
            latest && firstReading
              ? `${(latest.weight! - firstReading.weight!).toFixed(1)} lb`
              : "—",
          ],
          ["Weigh-ins in view", String(readings.length)],
          ["Latest weekly average", lb(latest?.weekly)],
        ].map(([title, value]) => (
          <div
            key={title}
            className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <dt className="text-xs text-muted-foreground">{title}</dt>
            <dd className="mt-2 font-rounded text-xl font-semibold tabular-nums sm:text-2xl">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <section
        aria-labelledby="weight-chart-title"
        className="rounded-2xl border border-neutral-200 px-2 py-5 dark:border-neutral-800 sm:px-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-3">
          <h2
            id="weight-chart-title"
            className="font-rounded text-lg font-medium"
          >
            Bodyweight over time
          </h2>
          <button
            type="button"
            className={control}
            aria-expanded={layersOpen}
            aria-controls={`${chartId}-layers`}
            onClick={() => setLayersOpen(!layersOpen)}
          >
            Layers · {Object.values(visible).filter(Boolean).length}
          </button>
        </div>
        {layersOpen && (
          <fieldset
            id={`${chartId}-layers`}
            className="mx-3 mb-4 mt-3 grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:grid-cols-3"
          >
            <legend className="sr-only">Visible chart series</legend>
            {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={visible[key]}
                  onChange={() =>
                    setVisible((previous) => ({
                      ...previous,
                      [key]: !previous[key],
                    }))
                  }
                  className="accent-neutral-600"
                />
                <LineSwatch dash={lineStyles[key]} dot={key === "weight"} />
                {labels[key]}
              </label>
            ))}
          </fieldset>
        )}
        <div
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 text-xs"
          aria-label="Active layers"
        >
          {(Object.keys(labels) as (keyof typeof labels)[])
            .filter((key) => visible[key])
            .map((key) => (
              <span key={key} className="flex items-center gap-2">
                <LineSwatch dash={lineStyles[key]} dot={key === "weight"} />
                {labels[key]}
              </span>
            ))}
          {!Object.values(visible).some(Boolean) && (
            <span className="text-muted-foreground">
              Choose a layer to plot.
            </span>
          )}
        </div>
        <div
          className="mb-4 mt-3 flex flex-wrap gap-x-5 gap-y-2 px-3 text-xs text-muted-foreground"
          aria-label="Phase colors"
        >
          {(
            [
              ["bulk", "Bulking"],
              ["cut", "Cutting"],
              ["maintenance", "Maintaining"],
              ["other", "Unassigned"],
            ] as const
          ).map(([kind, label]) => (
            <span key={kind} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: PHASE_COLORS[kind] }}
              />
              {label}
            </span>
          ))}
        </div>
        {visible.setPoints && log.setPoints.length > 0 && (
          <p className="mb-3 px-3 text-xs text-muted-foreground">
            Workbook set points:{" "}
            {log.setPoints.map((point) => lb(point.weight)).join(" and ")}.
          </p>
        )}
        {!rangeValid ? (
          <p role="status" className="p-10 text-center text-muted-foreground">
            Choose a valid date range.
          </p>
        ) : data.length === 0 ? (
          <p role="status" className="p-10 text-center text-muted-foreground">
            No data in this range.
          </p>
        ) : (
          <div
            className="h-[420px] w-full sm:h-[540px]"
            role="img"
            aria-label="Weight history with daily readings, weekly averages, and planned targets. Exact readings are available in the full-history calendar below."
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 12, right: 16, bottom: 8, left: 0 }}
                accessibilityLayer
              >
                <Customized
                  component={
                    <PhaseGradient
                      id={phaseGradientId}
                      phases={log.phases}
                      bounds={bounds}
                    />
                  }
                />
                {weightAxisVisible &&
                  weightScale.ticks.map((value) => (
                    <ReferenceLine
                      key={`weight-grid-${value}`}
                      y={value}
                      className={
                        value % 5 === 0
                          ? "weight-grid-major"
                          : "weight-grid-minor"
                      }
                      stroke="currentColor"
                      strokeOpacity={value % 5 === 0 ? 0.22 : 0.07}
                      strokeWidth={value % 5 === 0 ? 1 : 0.5}
                    />
                  ))}
                {visible.bodyFat &&
                  !weightAxisVisible &&
                  bodyFatScale.ticks.map((value) => (
                    <ReferenceLine
                      key={`body-fat-grid-${value}`}
                      yAxisId="bodyFat"
                      y={value}
                      className={
                        value % 4 === 0
                          ? "body-fat-grid-major"
                          : "body-fat-grid-minor"
                      }
                      stroke="currentColor"
                      strokeOpacity={value % 4 === 0 ? 0.22 : 0.08}
                      strokeWidth={value % 4 === 0 ? 1 : 0.5}
                    />
                  ))}
                {timeScale.ticks.map((time) => (
                  <ReferenceLine
                    key={`date-grid-${time}`}
                    x={time}
                    yAxisId={
                      weightAxisVisible ? 0 : visible.bodyFat ? "bodyFat" : 0
                    }
                    className="date-grid"
                    stroke="currentColor"
                    strokeOpacity={0.12}
                  />
                ))}
                <XAxis
                  dataKey="time"
                  type="number"
                  scale="time"
                  domain={bounds}
                  ticks={timeScale.ticks}
                  tickFormatter={timeScale.format}
                  interval="preserveStartEnd"
                  minTickGap={18}
                  tick={{
                    fontSize: timeScale.mode === "year" ? 12 : 10,
                    fontWeight: timeScale.mode === "year" ? 600 : 400,
                    fill: "#888",
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  hide={!weightAxisVisible}
                  domain={weightScale.domain}
                  ticks={weightScale.ticks.filter((value) => value % 5 === 0)}
                  interval={0}
                  width={58}
                  unit=" lb"
                  tick={{ fontSize: 11, fill: "#888" }}
                  axisLine={false}
                  tickLine={false}
                />
                {visible.bodyFat && (
                  <YAxis
                    yAxisId="bodyFat"
                    orientation="right"
                    unit="%"
                    width={46}
                    domain={bodyFatScale.domain}
                    ticks={bodyFatScale.ticks}
                    interval={0}
                    allowDataOverflow
                    tick={<BodyFatTick />}
                    axisLine={false}
                    tickLine={false}
                  />
                )}
                <Tooltip
                  labelFormatter={(value) =>
                    formatDate(dayString(Number(value)))
                  }
                  formatter={(value: number, name: string) => [
                    name.toLowerCase().includes("body fat")
                      ? `${value.toFixed(1)}%`
                      : lb(value),
                    name,
                  ]}
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid #8885",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                {log.phases
                  .filter(
                    (item) =>
                      dayTime(item.end) >= bounds[0] &&
                      dayTime(item.start) <= bounds[1] &&
                      (phase === "all" || item.id === phase),
                  )
                  .map((item) => (
                    <ReferenceArea
                      key={item.id}
                      x1={Math.max(bounds[0], dayTime(item.start))}
                      x2={Math.min(bounds[1], dayTime(item.end))}
                      fill={PHASE_COLORS[item.kind]}
                      fillOpacity={0.045}
                      strokeOpacity={0}
                    />
                  ))}
                {visible.setPoints &&
                  log.setPoints.map((point) => (
                    <ReferenceLine
                      key={point.label}
                      y={point.weight}
                      stroke={referenceColor}
                      strokeDasharray="6 5"
                      ifOverflow="extendDomain"
                      label={{
                        value: `${point.label} · ${point.weight} lb`,
                        position: "insideTopLeft",
                        fontSize: 11,
                        fill: referenceColor,
                      }}
                    />
                  ))}
                {visible.projections && bounds[1] > dayTime(lastObserved) && (
                  <ReferenceLine
                    x={dayTime(lastObserved)}
                    stroke="#8888"
                    strokeDasharray="3 3"
                    label={{
                      value: "Last weigh-in",
                      position: "insideTopRight",
                      fontSize: 11,
                      fill: "#888",
                    }}
                  />
                )}
                {visible.projections &&
                  chartPhases.map((item) => (
                    <Line
                      key={`projection-${item.id}`}
                      name={`Planned weight · ${item.label}`}
                      dataKey={`phaseSeries.${item.id}.projection`}
                      stroke={PHASE_COLORS[item.kind]}
                      strokeWidth={2}
                      strokeDasharray={lineStyles.projections}
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  ))}
                {visible.target &&
                  chartPhases.map((item) => (
                    <Line
                      key={`target-${item.id}`}
                      name={`${labels.target} · ${item.label}`}
                      dataKey={`phaseSeries.${item.id}.target`}
                      stroke={PHASE_COLORS[item.kind]}
                      strokeWidth={1.5}
                      strokeDasharray={lineStyles.target}
                      type="stepAfter"
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  ))}
                {visible.originalTarget &&
                  chartPhases.map((item) => (
                    <Line
                      key={`originalTarget-${item.id}`}
                      name={`${labels.originalTarget} · ${item.label}`}
                      dataKey={`phaseSeries.${item.id}.originalTarget`}
                      stroke={PHASE_COLORS[item.kind]}
                      strokeDasharray={lineStyles.originalTarget}
                      type="stepAfter"
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  ))}
                {visible.weight && (
                  <Line
                    name={labels.weight}
                    dataKey="weight"
                    stroke="none"
                    dot={phaseDot(2)}
                    activeDot={phaseDot(4)}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
                {visible.weekly &&
                  chartPhases.map((item) => (
                    <Line
                      key={`weekly-${item.id}`}
                      name={`${labels.weekly} · ${item.label}`}
                      dataKey={`phaseSeries.${item.id}.weekly`}
                      stroke={PHASE_COLORS[item.kind]}
                      strokeWidth={2}
                      type="stepAfter"
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  ))}
                {visible.annual && (
                  <Line
                    name={labels.annual}
                    dataKey="annual"
                    stroke={phaseStroke}
                    strokeDasharray={lineStyles.annual}
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
                {visible.trailing && (
                  <Line
                    name={labels.trailing}
                    dataKey="trailing"
                    stroke={phaseStroke}
                    strokeDasharray={lineStyles.trailing}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
                {visible.trailing && latest?.trailing != null && (
                  <ReferenceDot
                    x={latest.time}
                    y={latest.trailing}
                    r={3}
                    fill={phaseColorAt(latest.time, log.phases)}
                    stroke="none"
                  />
                )}
                {visible.bodyFat && latest?.bodyFatExtrapolated != null && (
                  <ReferenceDot
                    yAxisId="bodyFat"
                    x={latest.time}
                    y={latest.bodyFatExtrapolated}
                    r={3}
                    fill={phaseColorAt(latest.time, log.phases)}
                    stroke="none"
                  />
                )}
                {visible.bodyFat && (
                  <Line
                    yAxisId="bodyFat"
                    name="Body fat · between scans"
                    dataKey="bodyFatInterpolated"
                    strokeDasharray={lineStyles.bodyFat}
                    stroke={phaseStroke}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
                {visible.bodyFat && (
                  <Line
                    yAxisId="bodyFat"
                    name="Body fat · after latest scan (estimated)"
                    dataKey="bodyFatExtrapolated"
                    stroke={phaseStroke}
                    strokeWidth={2}
                    strokeDasharray="2 3"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
                {visible.bodyFat && visible.projections && (
                  <Line
                    yAxisId="bodyFat"
                    name="Body fat · future plan (estimated)"
                    dataKey="bodyFatProjected"
                    stroke={phaseStroke}
                    strokeWidth={2}
                    strokeDasharray="14 3 2 3"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
                {visible.bodyFat && (
                  <Line
                    yAxisId="bodyFat"
                    name="DEXA body fat · measured"
                    dataKey="bodyFatMeasured"
                    stroke="none"
                    dot={phaseDot(4, true)}
                    activeDot={phaseDot(6, true)}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <details className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <summary className="cursor-pointer px-3 text-xs font-medium text-muted-foreground">
            About this chart
          </summary>
          {hasOverlappingPhases && (
            <p className="mt-3 px-3 text-xs leading-relaxed text-muted-foreground">
              Some phase dates overlap in the workbook. Each phase’s averages
              and targets are drawn separately. Select a phase to inspect its
              recorded dates.
            </p>
          )}
          <p className="mt-3 px-3 text-xs leading-relaxed text-muted-foreground">
            Weight gridlines mark every pound, with stronger lines every 5 lb.
            The body-fat-only view uses 1% steps with stronger lines every 4%.
            Date markers follow calendar years, months, weeks, or days according
            to the range.
          </p>
          <p className="mt-3 px-3 text-xs leading-relaxed text-muted-foreground">
            The 12-month average uses recorded weigh-ins from the preceding 12
            calendar months, with equal weight per reading. It uses available
            history at the beginning, skips missing readings, and stops at the
            last weigh-in. Changing the displayed dates does not reset either
            rolling average.
          </p>
          <p className="mt-3 px-3 text-xs leading-relaxed text-muted-foreground">
            Red marks bulking, blue marks cutting, and yellow marks maintenance.
            Weekly averages cover Monday through Sunday and omit one highest and
            one lowest reading when there are at least three. Workbook-specific
            exclusions are preserved. Empty weeks remain gaps. Targets show the
            plan recorded in the workbook.
          </p>
          {visible.trailing && (
            <p className="mt-2 px-3 text-xs leading-relaxed text-muted-foreground">
              The 7-day trend uses available readings in each trailing week,
              trimming one highest and one lowest when there are at least three.
              It bridges gaps up to 14 days and stops at the last weigh-in.
              Longer gaps remain empty.
            </p>
          )}
          {visible.projections && (
            <p className="mt-2 px-3 text-xs leading-relaxed text-muted-foreground">
              Dashed future lines follow the dated weight targets in the
              workbook. They show the plan, not a prediction that it will
              happen.
            </p>
          )}
          {visible.bodyFat && (
            <section className="mt-4 px-3 text-xs leading-relaxed text-muted-foreground">
              <h3 className="font-medium">How the body-fat estimate works</h3>
              <p className="mt-2">
                Large outlined dots are DEXA readings, using the percentage axis
                on the right. Dash-dot lines show estimates between scans.
                Between scans, the model interpolates fat-free mass and combines
                it with smoothed scale weight. A gradual scale-to-scan
                adjustment makes the estimate meet each DEXA reading. Missing
                weight history leaves gaps. These estimates can change when a
                new scan is added.
              </p>
              <p className="mt-2">
                After the latest scan, dotted estimates use the median fat-free
                share of past weight gains and losses.{" "}
                {partition.bulkIntervals >= 2
                  ? `Gain model: ${(partition.bulk * 100).toFixed(0)}% fat-free mass from ${partition.bulkIntervals} usable intervals.`
                  : "Too few gain intervals: fat-free mass is held constant."}{" "}
                {partition.cutIntervals >= 2
                  ? `Loss model: ${(partition.cut * 100).toFixed(0)}% fat-free mass from ${partition.cutIntervals} usable intervals.`
                  : "Too few loss intervals: fat-free mass is held constant."}{" "}
                Intervals with under 2 lb of change, over a year between scans,
                or implausible ratios are excluded.
              </p>
              <p className="mt-2">
                Future body fat applies the same model to planned weight. This
                is a visualization heuristic, not a daily measurement or a
                validated forecast; water and other short-term changes can move
                the estimate.
              </p>
            </section>
          )}
        </details>
      </section>

      <section
        aria-labelledby="dexa-title"
        className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800"
      >
        <h2 id="dexa-title" className="font-rounded text-lg font-medium">
          DEXA lean mass vs bodyweight
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Scan measurements within the selected dates. Lean mass is lean soft
          tissue, excluding bone mineral content.
        </p>
        {scans.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">
            No DEXA scans in this range.
          </p>
        ) : (
          <>
            <DexaChart scans={log.scans} start={start} end={end} />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
                <caption className="sr-only">DEXA scan measurements</caption>
                <thead className="text-muted-foreground">
                  <tr>
                    {[
                      "Date",
                      "Scan weight",
                      "Lean mass",
                      "Fat mass",
                      "Body fat",
                    ].map((heading) => (
                      <th key={heading} scope="col" className="p-2 font-medium">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan) => (
                    <tr
                      key={scan.date}
                      className="border-t border-neutral-200 dark:border-neutral-800"
                    >
                      <th scope="row" className="p-2 font-normal">
                        {formatDate(scan.date)}
                      </th>
                      <td className="p-2">{lb(scan.weight)}</td>
                      <td className="p-2">{lb(scan.leanMass)}</td>
                      <td className="p-2">{lb(scan.fatMass)}</td>
                      <td className="p-2">
                        {scan.bodyFatPercent?.toFixed(1) ?? "—"}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <WeightHistoryCalendar points={full} />
      <p className="text-xs text-muted-foreground">
        Workbook snapshot imported {formatDate(log.importedAt.slice(0, 10))}.
        New Excel entries appear after the next import.
      </p>
    </div>
  );
}
