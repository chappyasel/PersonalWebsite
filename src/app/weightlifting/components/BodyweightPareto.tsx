"use client";

import { InfoIcon } from "lucide-react";
import { useMemo } from "react";
import {
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";

import type {
  ParetoPayload,
  ParetoPoint,
} from "~/lib/weightlifting/pareto/analysis";
import { paretoAxes } from "~/lib/weightlifting/pareto/axes";
import { api } from "~/trpc/react";

import { Button } from "~/components/ui/button";
import { ChartContainer, ChartTooltip } from "~/components/ui/chart";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Skeleton } from "~/components/ui/skeleton";

const pounds = (value: number) => value.toFixed(2);
function describe(point: ParetoPoint) {
  const set =
    point.weight !== null && point.reps !== null
      ? `${point.weight} × ${point.reps}, `
      : "";
  return `${point.date}: ${set}${point.oneRM} lb 1RMe at ${pounds(point.bodyweight)} lb estimated bodyweight`;
}
function PointTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const point = payload[0].payload as ParetoPoint;
  return (
    <div className="ph-no-capture ph-mask max-w-64 rounded-lg bg-[var(--seg-bg)] px-2.5 py-1.5 text-[10px] font-bold leading-tight text-[var(--seg-tx)] shadow-lg ring-1 ring-black/10 dark:bg-[var(--seg-bg-d)] dark:text-[var(--seg-tx-d)] dark:ring-white/15">
      <p>{describe(point)}</p>
      <p className="mt-1">
        {point.confidence} confidence · nearest weigh-in {point.distanceDays}{" "}
        days away
      </p>
      <p>
        {point.method}, {point.smoothing} smoothing ·{" "}
        {point.frontier ? "on frontier" : "not frontier"}
      </p>
    </div>
  );
}

export function ParetoChart({
  data,
  color = "#039BE5",
}: {
  data: ParetoPayload;
  color?: string;
}) {
  const chartConfig = {
    attempts: { label: "Attempts", color },
    frontier: { label: "Pareto frontier", color },
  };
  const floor = data.displayFloor;
  const visible = useMemo(
    () => data.points.filter((point) => point.oneRM >= floor),
    [data.points, floor],
  );
  const frontier = useMemo(() => {
    const seen = new Set<string>();
    return visible
      .filter((point) => {
        const key = `${point.bodyweight}:${point.oneRM}`;
        if (!point.frontier || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.bodyweight - b.bodyweight);
  }, [visible]);
  const axes = useMemo(
    () => (visible.length ? paretoAxes(visible, floor) : null),
    [visible, floor],
  );
  const latest = data.latest;
  const latestVisible =
    latest &&
    axes &&
    latest.oneRM >= axes.y.domain[0] &&
    latest.oneRM <= axes.y.domain[1];
  return (
    <div className="ph-no-capture ph-mask space-y-3 text-[13px] text-neutral-500 dark:text-neutral-400">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full opacity-30"
            style={{ backgroundColor: color }}
          />
          Attempts
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-0.5 w-4 rounded-full"
            style={{ backgroundColor: color }}
          />
          Frontier
        </span>
        {latestVisible && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-neutral-700 dark:bg-neutral-200" />
            Latest
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7 text-neutral-400"
              aria-label="About bodyweight estimates"
            >
              <InfoIcon className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="ph-no-capture ph-mask w-80 space-y-3 text-xs"
          >
            <p>
              Daily weigh-ins are linearly interpolated, then averaged over
              seven days. The window is centered within history, leading at the
              start, and trailing at the live edge. Dates outside the measured
              range carry the nearest boundary weight with low confidence.
            </p>
            <p>
              High confidence: a weigh-in within 7 days. Medium: 8–21 days. Low:
              longer gaps or boundary carries. These describe measurement
              proximity, not statistical certainty.
            </p>
            <p>
              The strength axis fits the frontier; weaker attempts outside that
              range are clipped. The frontier includes attempts with no
              equal-or-lighter, equal-or-stronger attempt with a strict
              advantage. All {data.evaluatedCount.toLocaleString()} valid
              attempts are evaluated before cropping; {data.unestimatedCount}{" "}
              lack an estimate.
            </p>
            <p>
              Last weigh-in: {data.lastWeighIn}
              <br />
              Bodyweight imported: {data.bodyweightImportedAt}
              <br />
              Lifting synced: {data.liftingSyncedAt ?? "unavailable"}
              <br />
              Analysis refreshed: {data.refreshedAt}
            </p>
          </PopoverContent>
        </Popover>
      </div>
      {axes ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>1RMe (lb)</span>
            <span>Lighter ← · stronger ↑</span>
          </div>
          <div
            className="overflow-x-auto overscroll-x-contain rounded-lg"
            tabIndex={0}
            role="region"
            aria-label="Strength at bodyweight plot. Scroll horizontally on small screens."
          >
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[320px] w-full"
              style={{ minWidth: axes.minWidth }}
              aria-label={`${data.displayName}: estimated bodyweight versus 1RMe. ${visible.length} visible attempts.`}
            >
              <ScatterChart
                margin={{ top: 12, right: 16, bottom: 28, left: 4 }}
              >
                <CartesianGrid
                  verticalValues={axes.x.minorTicks}
                  horizontalValues={axes.y.minorTicks}
                  syncWithTicks
                  stroke="hsl(var(--foreground))"
                  strokeOpacity={0.06}
                />
                <XAxis
                  type="number"
                  dataKey="bodyweight"
                  name="Estimated bodyweight"
                  domain={axes.x.domain}
                  ticks={axes.x.majorTicks}
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={10}
                  className="fill-neutral-500 text-[9px] font-medium dark:fill-neutral-400"
                  height={38}
                  label={{
                    value: "Estimated bodyweight (lb)",
                    position: "bottom",
                    offset: 10,
                    fill: "hsl(var(--muted-foreground))",
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="oneRM"
                  name="1RMe"
                  domain={axes.y.domain}
                  allowDataOverflow
                  ticks={axes.y.majorTicks}
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  className="fill-neutral-500 text-[9px] font-medium dark:fill-neutral-400"
                  width={48}
                />
                {axes.x.majorTicks.map((value) => (
                  <ReferenceLine
                    key={`x-${value}`}
                    x={value}
                    stroke="hsl(var(--foreground))"
                    strokeOpacity={0.16}
                  />
                ))}
                {axes.y.majorTicks.map((value) => (
                  <ReferenceLine
                    key={`y-${value}`}
                    y={value}
                    stroke="hsl(var(--foreground))"
                    strokeOpacity={0.16}
                  />
                ))}
                <ChartTooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  position={{ y: 4 }}
                  offset={16}
                  content={<PointTooltip />}
                />
                <Scatter
                  name="All attempts"
                  data={visible}
                  fill="var(--color-attempts)"
                  fillOpacity={0.25}
                  isAnimationActive={false}
                />
                <Scatter
                  name="Pareto frontier"
                  data={frontier}
                  fill="var(--color-frontier)"
                  line={{ stroke: "var(--color-frontier)", strokeWidth: 3 }}
                  isAnimationActive={false}
                />
                {latestVisible && (
                  <ReferenceDot
                    x={latest.bodyweight}
                    y={latest.oneRM}
                    r={7}
                    fill="hsl(var(--foreground))"
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                    pointerEvents="none"
                  />
                )}
              </ScatterChart>
            </ChartContainer>
          </div>
        </div>
      ) : (
        <p className="py-6 text-[13px] text-muted-foreground">
          No frontier attempts above this display floor.
        </p>
      )}
      {latest && (
        <p className="sr-only">
          Latest day&apos;s best: {describe(latest)}.{" "}
          {latest.frontier ? "On the frontier." : "Not on the frontier."}
          {data.dominator ? ` Dominated by ${describe(data.dominator)}.` : ""}
          {!latestVisible
            ? " This attempt is outside the plotted frontier range."
            : ""}
        </p>
      )}
    </div>
  );
}

export function BodyweightPareto({
  displayName,
  color,
}: {
  displayName: string;
  color: string;
}) {
  const query = api.weightlifting.getBodyweightPareto.useQuery(
    { displayName },
    { staleTime: 300_000, retry: 1 },
  );
  return (
    <div className="space-y-4">
      {query.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : query.isError ? (
        <div
          role="status"
          className="space-y-2 text-[13px] text-muted-foreground"
        >
          <p>
            Bodyweight analysis is unavailable. The lifting log remains
            available.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
          >
            Retry analysis
          </Button>
        </div>
      ) : query.data.evaluatedCount ? (
        <ParetoChart key={displayName} data={query.data} color={color} />
      ) : (
        <p className="text-[13px] text-muted-foreground">
          No valid recorded 1RMe attempts for this variation yet.
        </p>
      )}
    </div>
  );
}
