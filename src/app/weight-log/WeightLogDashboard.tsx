"use client";

import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  BarbellIcon,
  ChartLineUpIcon,
  ChartScatterIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import {
  Area,
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
  fitHistoricalBodyFat,
  historicalBodyFat,
} from "~/lib/weight-log/historical-body-fat";
import {
  bodyFatAxis,
  calendarAxis,
  phaseColorAt,
  weightAxis,
  weightCellStyle,
} from "~/lib/weight-log/presentation";
import type { WeightLog } from "~/lib/weight-log/schema";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { CollapsibleSection } from "~/components/ui/collapsible-section";
import { Input } from "~/components/ui/input";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

import { ChartInteraction } from "./ChartInteraction";
import { DexaChart } from "./DexaChart";
import { PhaseGradient } from "./PhaseGradient";
import { WeightHistoryCalendar } from "./WeightHistoryCalendar";
import styles from "./WeightLogDashboard.module.css";

const referenceColor = "#64748b";
const futureWeightOpacity = 0.55;
const bodyFatColors = {
  bodyFat: "#8b5cf6",
  historicalBodyFat: "#a78bfa",
  bodyFatProjections: "#a78bfa",
};
const lineStyles = {
  weight: "",
  weekly: "",
  target: "4 4",
  originalTarget: "1 4",
  trailing: "",
  annual: "2 4",
  setPoints: "6 5",
  projections: "14 5",
  bodyFatProjections: "1 5",
  bodyFat: "",
  historicalBodyFat: "2 6",
};
function LineSwatch({
  dash,
  dot = false,
  color,
}: {
  dash: string;
  dot?: boolean;
  color?: string;
}) {
  return (
    <svg width="30" height="12" aria-hidden="true" style={{ color }}>
      {dot ? (
        <circle cx="15" cy="6" r="2.5" fill="currentColor" />
      ) : (
        <line
          x1="0"
          x2="30"
          y1="6"
          y2="6"
          stroke="currentColor"
          strokeWidth={dash === lineStyles.projections ? 1.5 : 2}
          strokeOpacity={
            dash === lineStyles.projections ? futureWeightOpacity : 1
          }
          strokeDasharray={dash}
          strokeLinecap={
            dash === lineStyles.bodyFatProjections ? "round" : "butt"
          }
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
  projections: "Future weight plan",
  bodyFatProjections: "Future body fat plan",
  bodyFat: "Body fat %",
  historicalBodyFat: "Early body fat · exploratory",
};
const layerGroups = [
  {
    label: "Weight",
    keys: [
      "weight",
      "trailing",
      "weekly",
      "annual",
      "target",
      "originalTarget",
      "setPoints",
      "projections",
    ],
  },
  {
    label: "Body fat",
    keys: ["bodyFat", "historicalBodyFat", "bodyFatProjections"],
  },
] as const;
const formatDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const lb = (value: number | null | undefined) =>
  value == null ? "—" : `${value.toFixed(1)} lb`;

function PhaseDot({
  cx,
  cy,
  payload,
  radius,
  outlined = false,
  phases,
  color,
}: {
  cx?: number;
  cy?: number;
  payload?: { time?: number };
  radius: number;
  outlined?: boolean;
  phases: WeightLog["phases"];
  color?: string;
}) {
  if (cx == null || cy == null || !Number.isFinite(cx) || !Number.isFinite(cy))
    return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill={color ?? phaseColorAt(payload?.time ?? NaN, phases)}
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
      fill={bodyFatColors.bodyFat}
      opacity={major ? 1 : 0.7}
      fontSize={10}
      fontWeight={major ? 600 : 400}
    >
      {payload.value}%
    </text>
  );
}

function LayerPicker({
  visible,
  onChange,
}: {
  visible: Record<keyof typeof labels, boolean>;
  onChange: (key: keyof typeof labels, checked: boolean) => void;
}) {
  const [layersOpen, setLayersOpen] = useState(false);
  return (
    <Popover open={layersOpen} onOpenChange={setLayersOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-[90px] tabular-nums"
        >
          Layers · {Object.values(visible).filter(Boolean).length}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Chart layers"
        className="ph-no-capture ph-mask grid max-h-[min(70vh,var(--radix-popover-content-available-height))] w-[min(580px,calc(100vw-2rem))] gap-5 overflow-y-auto font-sans sm:grid-cols-[2fr_1fr]"
      >
        <div className="flex items-center justify-between sm:col-span-2">
          <h3 className="text-sm font-medium">Chart layers</h3>
          <PopoverClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Close layers"
            >
              Close
            </Button>
          </PopoverClose>
        </div>
        {layerGroups.map((group) => (
          <fieldset key={group.label} className="min-w-0">
            <legend className="mb-3 text-sm font-medium">{group.label}</legend>
            <div
              className={`grid gap-3 ${group.label === "Weight" ? "sm:grid-cols-2" : ""}`}
            >
              {group.keys.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 py-1 text-xs"
                >
                  <Checkbox
                    aria-label={labels[key]}
                    checked={visible[key]}
                    onCheckedChange={(checked) =>
                      onChange(key, checked === true)
                    }
                  />
                  <LineSwatch
                    dash={lineStyles[key]}
                    color={
                      key in bodyFatColors
                        ? bodyFatColors[key as keyof typeof bodyFatColors]
                        : undefined
                    }
                    dot={key === "weight"}
                  />
                  {labels[key]}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function WeightLogDashboard({ log }: { log: WeightLog }) {
  const historicalModel = useMemo(
    () => fitHistoricalBodyFat(log.scans, log.historicalContext, log.phases),
    [log.scans, log.historicalContext, log.phases],
  );
  const full = useMemo(() => {
    const points = buildWeightChart(log);
    const historical = historicalBodyFat(points, historicalModel);
    return points.map((point, index) => ({ ...point, ...historical[index]! }));
  }, [log, historicalModel]);
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
    projections: true,
    bodyFatProjections: true,
    bodyFat: true,
    historicalBodyFat: true,
  });
  const [zoomBase, setZoomBase] = useState<[string, string] | null>(null);
  const [dragging, setDragging] = useState(false);
  const chartId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const phaseGradientId = `${chartId}-phase`;
  const phaseStroke = `url(#${phaseGradientId})`;
  const phaseDot = (radius: number, outlined = false, color?: string) => (
    <PhaseDot
      radius={radius}
      outlined={outlined}
      phases={log.phases}
      color={color}
    />
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
  const chartPhases = useMemo(
    () => log.phases.filter((item) => phase === "all" || item.id === phase),
    [log.phases, phase],
  );
  const data = useMemo(
    () =>
      selected.filter(
        (point) => rangeValid && point.date >= start && point.date <= end,
      ),
    [selected, rangeValid, start, end],
  );
  const readings = useMemo(
    () => data.filter((point) => point.weight !== null),
    [data],
  );
  const latest = readings.at(-1);
  const allReadings = useMemo(
    () => full.filter((point) => point.weight !== null),
    [full],
  );
  const lastObserved = allReadings.at(-1)?.date ?? last;
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        phaseSeries: Object.fromEntries(
          Object.entries(point.phaseSeries).map(([id, series]) => [
            id,
            {
              ...series,
              target: point.date > lastObserved ? null : series.target,
            },
          ]),
        ),
      })),
    [data, lastObserved],
  );
  const scans = useMemo(
    () => [...log.scans].sort((a, b) => a.date.localeCompare(b.date)),
    [log.scans],
  );
  const bounds: [number, number] = [data[0]?.time ?? 0, data.at(-1)?.time ?? 1];
  const bodyFatVisible =
    visible.bodyFat || visible.historicalBodyFat || visible.bodyFatProjections;
  const bodyFatScale = bodyFatAxis(
    chartData,
    visible.bodyFatProjections,
    visible.historicalBodyFat
      ? chartData.flatMap((point) =>
          point.bodyFatHistoricalRange ? [point.bodyFatHistoricalRange] : [],
        )
      : [],
    visible.bodyFat,
  );
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
  const yearStart = dayString(
    Math.max(dayTime(first), dayTime(lastObserved) - 365 * 86_400_000),
  );
  const recentStart = dayString(
    Math.max(dayTime(first), dayTime(lastObserved) - 90 * 86_400_000),
  );
  const hasOverlappingPhases =
    new Set(log.weeks.map((week) => week.date)).size < log.weeks.length;

  const phaseControl = (
    <Select
      value={phase}
      onValueChange={(value) => {
        setZoomBase(null);
        const selected = log.phases.find((item) => item.id === value);
        setPhase(value);
        setStart(selected?.start ?? first);
        setEnd(selected?.end ?? last);
      }}
    >
      <SelectTrigger aria-label="Phase" className="h-8 w-[160px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="ph-no-capture ph-mask font-sans">
        <SelectItem value="all">All phases</SelectItem>
        {log.phases.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.kind === "other"
              ? ""
              : `${item.kind === "bulk" ? "Bulk" : item.kind === "maintenance" ? "Maintain" : "Cut"} · `}
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const dateControls = (
    <div className="flex min-w-0 items-center gap-1">
      <Input
        aria-label="From"
        type="date"
        value={start}
        min={first}
        max={end || last}
        className="h-8 w-[132px] min-w-0 flex-1 px-2 text-xs md:flex-none md:text-xs"
        onChange={(event) => {
          setZoomBase(null);
          setStart(event.target.value);
        }}
      />
      <span aria-hidden="true" className="text-xs text-muted-foreground">
        to
      </span>
      <Input
        aria-label="To"
        type="date"
        value={end}
        min={start || first}
        max={last}
        className="h-8 w-[132px] min-w-0 flex-1 px-2 text-xs md:flex-none md:text-xs"
        onChange={(event) => {
          setZoomBase(null);
          setEnd(event.target.value);
        }}
      />
    </div>
  );
  const aboutContent = (
    <>
      {hasOverlappingPhases && (
        <p className="mt-3 px-3 text-xs leading-relaxed text-muted-foreground">
          Some phase dates overlap in the workbook. Each phase’s averages and
          targets are drawn separately. Select a phase to inspect its recorded
          dates.
        </p>
      )}
      <p className="mt-3 px-3 text-xs leading-relaxed text-muted-foreground">
        Weight gridlines mark every pound, with stronger lines every 5 lb. The
        body-fat-only view uses 1% steps with stronger lines every 4%. Date
        markers follow calendar years, months, weeks, or days according to the
        range.
      </p>
      <p className="mt-3 px-3 text-xs leading-relaxed text-muted-foreground">
        The 12-month average uses recorded weigh-ins from the preceding 12
        calendar months, with equal weight per reading. It uses available
        history at the beginning, skips missing readings, and stops at the last
        weigh-in. Changing the displayed dates does not reset either rolling
        average.
      </p>
      <p className="mt-3 px-3 text-xs leading-relaxed text-muted-foreground">
        Weight lines use red for bulking, blue for cutting, and yellow for
        maintenance. Weekly averages cover Monday through Sunday and omit one
        highest and one lowest reading when there are at least three.
        Workbook-specific exclusions are preserved. Empty weeks remain gaps.
        Targets show the plan recorded in the workbook.
      </p>
      {visible.trailing && (
        <p className="mt-2 px-3 text-xs leading-relaxed text-muted-foreground">
          The 7-day trend uses available readings in each trailing week,
          trimming one highest and one lowest when there are at least three. It
          bridges gaps up to 14 days and stops at the last weigh-in. Longer gaps
          remain empty.
        </p>
      )}
      {(visible.projections || visible.bodyFatProjections) && (
        <p className="mt-2 px-3 text-xs leading-relaxed text-muted-foreground">
          Long dashes show planned weight in pounds on the left axis. Round dots
          show estimated future body fat in percent on the right axis. Each has
          its own toggle. Both use the dated workbook weight plan; future body
          fat applies the fat-free mass model to that plan. Neither guarantees
          the planned outcome.
        </p>
      )}
      {visible.historicalBodyFat && historicalModel && (
        <section className="mt-4 px-3 text-xs leading-relaxed text-muted-foreground">
          <h3 className="font-medium">Before the first DEXA</h3>
          <p className="mt-2">
            The starting assumption is{" "}
            {historicalModel.context.anchor.bodyFatLow}% to{" "}
            {historicalModel.context.anchor.bodyFatHigh}% on{" "}
            {formatDate(historicalModel.context.anchor.date)}. This is a
            recollection, not a measurement.{" "}
            {historicalModel.context.anchor.note}
          </p>
          <p className="mt-2">
            Fat-free mass changes between that starting range and the first
            DEXA. Calendar time, progress across comparable lifts, and weight
            gains during recorded bulks help distribute that change. Equal
            bodyweights in different years can now have different body fat.
            Missing weight history remains empty.
          </p>
          <p className="mt-2">
            The center line blends timing from calendar time, bulk progress, and
            strength. Strength only influences when the assumed change happens;
            it does not determine pounds of muscle. Missing or inconsistent lift
            coverage falls back to calendar time.
          </p>
          <p className="mt-2">
            Shading spans earlier and later muscle-gain schedules, both ends of
            the starting range, and different amounts of fat-free mass gained
            and lost through bulk/cut cycles. It also varies the DEXA endpoint
            by two percentage points as a sensitivity assumption. These
            alternatives are not equally likely outcomes or a validated
            confidence interval. The old scan-only prediction score does not
            validate this reconstruction. The tooltip shows the full range,
            including values below the 4% chart floor.
          </p>
          <p className="mt-2">
            Strength is not converted into muscle mass here. Lift performance
            also reflects factors beyond muscle size, and DEXA fat-free mass
            includes water and bone. See the{" "}
            <a
              href="https://pubmed.ncbi.nlm.nih.gov/39206316/"
              className="underline"
            >
              strength and lean-mass study
            </a>{" "}
            and the{" "}
            <a
              href="https://pubmed.ncbi.nlm.nih.gov/28204901/"
              className="underline"
            >
              DEXA hydration study
            </a>
            .
          </p>
        </section>
      )}
      {visible.bodyFat && (
        <section className="mt-4 px-3 text-xs leading-relaxed text-muted-foreground">
          <h3 className="font-medium">How the body-fat estimate works</h3>
          <p className="mt-2">
            Large outlined dots are DEXA readings, using the percentage axis on
            the right. Solid purple lines show estimates between scans. Between
            scans, the model interpolates fat-free mass and combines it with
            smoothed scale weight. A gradual scale-to-scan adjustment makes the
            estimate meet each DEXA reading. Missing weight history leaves gaps.
            These estimates can change when a new scan is added.
          </p>
          <p className="mt-2">
            After the latest scan, estimates use the median fat-free share of
            past weight gains and losses.{" "}
            {partition.bulkIntervals >= 2
              ? `Gain model: ${(partition.bulk * 100).toFixed(0)}% fat-free mass from ${partition.bulkIntervals} usable intervals.`
              : "Too few gain intervals: fat-free mass is held constant."}{" "}
            {partition.cutIntervals >= 2
              ? `Loss model: ${(partition.cut * 100).toFixed(0)}% fat-free mass from ${partition.cutIntervals} usable intervals.`
              : "Too few loss intervals: fat-free mass is held constant."}{" "}
            Intervals with under 2 lb of change, over a year between scans, or
            implausible ratios are excluded.
          </p>
          <p className="mt-2">
            Future body fat applies the same model to planned weight. This is a
            visualization heuristic, not a daily measurement or a validated
            forecast; water and other short-term changes can move the estimate.
          </p>
        </section>
      )}
    </>
  );
  const legendContent = (
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 text-xs">
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2"
        aria-label="Active layers"
      >
        {layerGroups.map((group) => {
          const active = group.keys.filter((key) => visible[key]);
          return active.length ? (
            <div
              key={group.label}
              className="flex flex-wrap items-center gap-x-4 gap-y-2"
            >
              {active.map((key) => (
                <span key={key} className="flex items-center gap-2">
                  <LineSwatch
                    dash={lineStyles[key]}
                    color={
                      key in bodyFatColors
                        ? bodyFatColors[key as keyof typeof bodyFatColors]
                        : undefined
                    }
                    dot={key === "weight"}
                  />
                  {labels[key]}
                </span>
              ))}
            </div>
          ) : null;
        })}
        {!Object.values(visible).some(Boolean) && (
          <span className="text-muted-foreground">Choose a layer to plot.</span>
        )}
      </div>
      <div
        className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"
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
    </div>
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1>
            <Link
              href={
                process.env.NODE_ENV === "production"
                  ? "https://weightlifting.chappyasel.com"
                  : "/weightlifting"
              }
              aria-label="Weight Log, back to Weightlifting"
              className="group inline-flex items-center gap-2 text-2xl font-semibold text-foreground transition-opacity hover:opacity-80 md:text-4xl"
            >
              <span
                aria-hidden="true"
                className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center md:h-9 md:w-9"
              >
                <BarbellIcon
                  weight="bold"
                  className="absolute h-7 w-7 transition-all duration-200 group-hover:scale-75 group-hover:opacity-0 group-focus-visible:scale-75 group-focus-visible:opacity-0 motion-reduce:transition-none md:h-9 md:w-9"
                />
                <ArrowLeftIcon
                  weight="bold"
                  className="absolute h-7 w-7 scale-75 opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100 motion-reduce:transition-none md:h-9 md:w-9"
                />
              </span>
              <span className="line-clamp-1 font-rounded">Weight Log</span>
            </Link>
          </h1>
          <p className="pl-9 text-sm text-muted-foreground md:pl-11">
            {allReadings.length.toLocaleString()} weigh-ins
            {allReadings[0] && allReadings.at(-1)
              ? ` · ${((allReadings.at(-1)!.time - allReadings[0].time) / (365.2425 * 86_400_000)).toFixed(1)} years`
              : ""}
          </p>
        </div>
        <p className="text-xs text-muted-foreground sm:self-end">
          Last import {formatDate(log.importedAt.slice(0, 10))}
        </p>
      </header>

      <CollapsibleSection
        title="Bodyweight over time"
        icon={<ChartLineUpIcon className="h-5 w-5" weight="bold" />}
        cardClassName="px-2 dark:bg-neutral-900 sm:px-4"
      >
        <section
          aria-label="Chart filters"
          className="mb-1 flex items-center gap-2 px-2 md:mb-3 md:flex-wrap"
        >
          <Select
            value={
              phase === "all" && start === first && end === last
                ? "all"
                : phase === "all" && start === yearStart && end === lastObserved
                  ? "year"
                  : phase === "all" && start === recentStart && end === last
                    ? "plan"
                    : "custom"
            }
            onValueChange={(value) => {
              if (value === "custom") return;
              setZoomBase(null);
              setPhase("all");
              setStart(
                value === "year"
                  ? yearStart
                  : value === "plan"
                    ? recentStart
                    : first,
              );
              setEnd(value === "year" ? lastObserved : last);
            }}
          >
            <SelectTrigger
              aria-label="Date range"
              className="h-8 min-w-0 flex-1 text-xs md:w-[135px] md:flex-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="ph-no-capture ph-mask font-sans">
              <SelectItem value="all">Full history</SelectItem>
              <SelectItem value="year">Last year</SelectItem>
              <SelectItem value="plan">Recent + plan</SelectItem>
              <SelectItem value="custom" disabled>
                Custom range
              </SelectItem>
            </SelectContent>
          </Select>
          <div className="hidden items-center gap-2 md:flex">
            {phaseControl}
            {dateControls}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!zoomBase}
              aria-label="Reset zoom"
              className={`${zoomBase ? "inline-flex" : "hidden"} w-8 px-0 md:inline-flex md:w-auto md:px-3`}
              onClick={() => {
                if (!zoomBase) return;
                setStart(zoomBase[0]);
                setEnd(zoomBase[1]);
                setZoomBase(null);
              }}
            >
              <ArrowCounterClockwiseIcon className="md:hidden" />
              <span className="hidden md:inline">Reset zoom</span>
            </Button>
            <LayerPicker
              visible={visible}
              onChange={(key, checked) =>
                setVisible((previous) => ({ ...previous, [key]: checked }))
              }
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Chart settings"
                  className="h-8 w-8 md:hidden"
                >
                  <SlidersHorizontalIcon />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                aria-label="Chart settings"
                className="ph-no-capture ph-mask max-h-[min(70vh,var(--radix-popover-content-available-height))] w-[min(340px,calc(100vw-2rem))] space-y-4 overflow-y-auto font-sans"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Chart settings</h3>
                  <PopoverClose asChild>
                    <Button type="button" variant="ghost" size="sm">
                      Done
                    </Button>
                  </PopoverClose>
                </div>
                <div className="space-y-2 [&>button]:w-full">
                  <p className="text-xs text-muted-foreground">Phase</p>
                  {phaseControl}
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Dates</p>
                  {dateControls}
                </div>
                <Accordion type="single" collapsible>
                  <AccordionItem value="about" className="border-0">
                    <AccordionTrigger className="py-0 text-xs hover:no-underline">
                      About this chart
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      {aboutContent}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="About this chart"
                  className="hidden md:inline-flex"
                >
                  About
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="ph-no-capture ph-mask max-h-[min(70vh,var(--radix-popover-content-available-height))] w-[min(480px,calc(100vw-2rem))] overflow-y-auto font-sans"
              >
                <h3 className="px-3 text-sm font-medium">About this chart</h3>
                {aboutContent}
              </PopoverContent>
            </Popover>
          </div>
        </section>
        <div className="mb-2 flex items-center justify-between gap-2 px-2 text-xs md:hidden">
          <div className="flex items-center gap-4">
            {weightAxisVisible && (
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="flex">
                  {["bulk", "cut", "maintenance"].map((kind) => (
                    <span
                      key={kind}
                      className="h-0.5 w-2"
                      style={{
                        background:
                          PHASE_COLORS[kind as keyof typeof PHASE_COLORS],
                      }}
                    />
                  ))}
                </span>
                Weight
              </span>
            )}
            {bodyFatVisible && (
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-0.5 w-5"
                  style={{ background: bodyFatColors.bodyFat }}
                />
                Body fat
              </span>
            )}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                Legend
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              aria-label="Chart legend"
              className="ph-no-capture ph-mask w-[min(360px,calc(100vw-2rem))] font-sans"
            >
              {legendContent}
            </PopoverContent>
          </Popover>
        </div>
        <div className="mb-3 hidden px-2 md:block">{legendContent}</div>
        <p id={`${chartId}-zoom-help`} className="sr-only">
          Drag across the plot to zoom; Esc cancels. You can also use the From
          and To date controls, available in Chart settings on mobile.
        </p>
        {!rangeValid ? (
          <p role="status" className="p-10 text-center text-muted-foreground">
            Choose a valid date range.
          </p>
        ) : data.length === 0 ? (
          <p role="status" className="p-10 text-center text-muted-foreground">
            No data in this range.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div
              className={`${styles.chart} h-[420px] w-full min-w-[600px] sm:h-[540px]`}
              role="group"
              aria-label="Weight history with daily readings, weekly averages, and planned targets. Exact readings are available in the full-history calendar below."
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 12, right: 16, bottom: 8, left: 0 }}
                  accessibilityLayer
                  aria-describedby={`${chartId}-zoom-help`}
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
                  {bodyFatVisible &&
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
                        weightAxisVisible ? 0 : bodyFatVisible ? "bodyFat" : 0
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
                  {bodyFatVisible && (
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
                    active={dragging ? false : undefined}
                    labelFormatter={(value) =>
                      formatDate(dayString(Number(value)))
                    }
                    formatter={(
                      value: number | [number, number],
                      name: string,
                    ) => [
                      Array.isArray(value)
                        ? `${value[0].toFixed(1)}% to ${value[1].toFixed(1)}%`
                        : name.toLowerCase().includes("body fat")
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
                  {visible.historicalBodyFat && (
                    <Area
                      yAxisId="bodyFat"
                      type="linear"
                      name="Early body fat · sensitivity range, not a confidence interval"
                      dataKey="bodyFatHistoricalRange"
                      className="historical-body-fat-range"
                      fill={bodyFatColors.historicalBodyFat}
                      fillOpacity={0.13}
                      stroke="none"
                      dot={false}
                      activeDot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
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
                  {(visible.projections || visible.bodyFatProjections) &&
                    bounds[1] > dayTime(lastObserved) && (
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
                        name={`Future weight plan · ${item.label}`}
                        className="future-weight-plan"
                        dataKey={`phaseSeries.${item.id}.projection`}
                        stroke={PHASE_COLORS[item.kind]}
                        strokeOpacity={futureWeightOpacity}
                        strokeWidth={1.5}
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
                  {visible.historicalBodyFat && (
                    <Line
                      yAxisId="bodyFat"
                      type="linear"
                      name="Early body fat · exploratory estimate"
                      dataKey="bodyFatHistorical"
                      className="historical-body-fat-line"
                      stroke={bodyFatColors.historicalBodyFat}
                      strokeOpacity={0.6}
                      strokeWidth={2}
                      strokeDasharray={lineStyles.historicalBodyFat}
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  {visible.historicalBodyFat && historicalModel && (
                    <ReferenceLine
                      x={dayTime(historicalModel.context.anchor.date)}
                      yAxisId="bodyFat"
                      stroke="#8888"
                      strokeDasharray="1 4"
                      label={{
                        value: "Recollection · approximate date",
                        className: "hidden md:block",
                        position: "insideTopLeft",
                        fontSize: 11,
                        fill: "#888",
                      }}
                    />
                  )}
                  {visible.historicalBodyFat && historicalModel && (
                    <ReferenceLine
                      x={dayTime(historicalModel.anchor.date)}
                      yAxisId="bodyFat"
                      stroke="#8888"
                      strokeDasharray="3 3"
                      label={{
                        value: "First DEXA",
                        className: "hidden md:block",
                        position: "insideTopRight",
                        fontSize: 11,
                        fill: "#888",
                      }}
                    />
                  )}
                  {visible.bodyFat && latest?.bodyFatExtrapolated != null && (
                    <ReferenceDot
                      yAxisId="bodyFat"
                      x={latest.time}
                      y={latest.bodyFatExtrapolated}
                      r={3}
                      fill={bodyFatColors.bodyFat}
                      stroke="none"
                    />
                  )}
                  {visible.bodyFat && (
                    <Line
                      yAxisId="bodyFat"
                      name="Body fat · between scans"
                      dataKey="bodyFatInterpolated"
                      strokeDasharray={lineStyles.bodyFat}
                      stroke={bodyFatColors.bodyFat}
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
                      stroke={bodyFatColors.bodyFat}
                      strokeWidth={2}
                      strokeDasharray={lineStyles.bodyFat}
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  {visible.bodyFatProjections && (
                    <Line
                      yAxisId="bodyFat"
                      name="Future body fat plan · estimated"
                      className="future-body-fat-plan"
                      dataKey="bodyFatProjected"
                      stroke={bodyFatColors.bodyFatProjections}
                      strokeWidth={2}
                      strokeDasharray={lineStyles.bodyFatProjections}
                      strokeLinecap="round"
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
                      dot={phaseDot(4, true, bodyFatColors.bodyFat)}
                      activeDot={phaseDot(6, true, bodyFatColors.bodyFat)}
                      isAnimationActive={false}
                    />
                  )}
                  <Customized
                    component={
                      <ChartInteraction
                        bounds={bounds}
                        onDraggingChange={setDragging}
                        onZoom={(from, to) => {
                          setZoomBase((base) => base ?? [start, end]);
                          setStart(from);
                          setEnd(to);
                        }}
                      />
                    }
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="DEXA lean mass vs bodyweight"
        icon={<ChartScatterIcon className="h-5 w-5" weight="bold" />}
        cardClassName="dark:bg-neutral-900"
      >
        {scans.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">
            No DEXA scans recorded.
          </p>
        ) : (
          <>
            <DexaChart
              scans={log.scans}
              start={scans[0]?.date ?? first}
              end={scans.at(-1)?.date ?? last}
            />
            <Accordion type="single" collapsible className="mt-4">
              <AccordionItem value="details" className="border-0">
                <AccordionTrigger className="py-2 text-sm hover:no-underline">
                  Scan data · {scans.length}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
                      <caption className="sr-only">
                        DEXA scan measurements
                      </caption>
                      <thead className="text-muted-foreground">
                        <tr>
                          {[
                            "Date",
                            "Scan weight",
                            "Lean mass",
                            "Fat mass",
                            "Body fat",
                          ].map((heading) => (
                            <th
                              key={heading}
                              scope="col"
                              className="p-2 font-medium"
                            >
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
                            {(
                              [
                                "weight",
                                "leanMass",
                                "fatMass",
                                "bodyFatPercent",
                              ] as const
                            ).map((key) => {
                              const value = scan[key];
                              const values = scans.flatMap((item) =>
                                item[key] === null ? [] : [item[key]],
                              );
                              return (
                                <td
                                  key={key}
                                  className="p-2"
                                  style={
                                    value === null
                                      ? undefined
                                      : weightCellStyle(
                                          value,
                                          Math.min(...values),
                                          Math.max(...values),
                                        )
                                  }
                                >
                                  {value === null
                                    ? "—"
                                    : key === "bodyFatPercent"
                                      ? `${value.toFixed(1)}%`
                                      : lb(value)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}
      </CollapsibleSection>

      <WeightHistoryCalendar points={full} />
    </div>
  );
}
