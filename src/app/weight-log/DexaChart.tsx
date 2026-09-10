"use client";

import { useId, useMemo, useState } from "react";

import { buildDexaAnalysis } from "~/lib/weight-log/dexa";
import { projectDexaBulk } from "~/lib/weight-log/dexa-projection";
import type { WeightLog } from "~/lib/weight-log/schema";

const palette = {
  bulk: "#f87171",
  cut: "#38bdf8",
  latest: "#f97316",
  positive: "#16a34a",
  negative: "#dc6060",
};
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
const dateLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const bounds = (values: number[]): [number, number] => [
  Math.floor(Math.min(...values) - 3),
  Math.ceil(Math.max(...values) + 4),
];
const ticks = ([min, max]: [number, number]) => {
  const rough = (max - min) / 7;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10]
    .map((value) => value * magnitude)
    .find((value) => value >= rough)!;
  return Array.from(
    { length: Math.floor(max / step) - Math.ceil(min / step) + 1 },
    (_, index) => (Math.ceil(min / step) + index) * step,
  );
};

export function DexaChart({
  scans,
  start,
  end,
}: {
  scans: WeightLog["scans"];
  start: string;
  end: string;
}) {
  const id = useId().replaceAll(":", "");
  const analysis = useMemo(() => buildDexaAnalysis(scans), [scans]);
  const [showProjection, setShowProjection] = useState(true);
  const forecast = useMemo(
    () => (showProjection ? projectDexaBulk(scans) : null),
    [scans, showProjection],
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const points = analysis.points.filter(
    (point) => point.date >= start && point.date <= end,
  );
  if (points.length === 0) {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        No lean-mass measurements to plot in this range.
      </p>
    );
  }
  const latest = points.at(-1)!;
  const selected =
    points.find((point) => point.date === selectedDate) ?? latest;
  const projection =
    forecast?.projection &&
    points.some((point) => point.date === forecast.projection.anchor.date)
      ? forecast.projection
      : null;
  const xBounds = bounds([
    ...points.map((point) => point.weight),
    ...(projection ? [projection.target] : []),
  ]);
  const yBounds = bounds([
    ...points.flatMap((point) => [
      point.leanMass,
      ...(point.predicted === null ? [] : [point.predicted]),
    ]),
    ...(projection ? [projection.lower, projection.upper] : []),
  ]);
  const plot = { left: 76, right: 866, top: 30, bottom: 450 };
  const x = (weight: number) =>
    plot.left +
    ((weight - xBounds[0]) / (xBounds[1] - xBounds[0])) *
      (plot.right - plot.left);
  const y = (lean: number) =>
    plot.bottom -
    ((lean - yBounds[0]) / (yBounds[1] - yBounds[0])) *
      (plot.bottom - plot.top);
  const recent = analysis.points.slice(-2);
  const recentSlope =
    recent.length === 2 &&
    recent[1]!.number === recent[0]!.number + 1 &&
    recent[1]!.weight !== recent[0]!.weight
      ? (recent[1]!.leanMass - recent[0]!.leanMass) /
        (recent[1]!.weight - recent[0]!.weight)
      : null;

  return (
    <div className="mt-5">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>More lean mass for bodyweight ↑</span>
        <span className="tabular-nums">
          {points.length} of {scans.length} scans · Full-history R²{" "}
          {analysis.rSquared?.toFixed(2) ?? "unavailable"}
        </span>
      </div>
      <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={showProjection}
          onChange={(event) => setShowProjection(event.target.checked)}
          className="accent-violet-500"
        />
        Project current bulk to 240 lb · 95% ribbon
      </label>
      {showProjection && !projection && (
        <p className="mt-2 text-xs text-muted-foreground">
          {forecast?.reason ??
            "Include the latest DEXA scan in the selected dates to see the current bulk projection."}
        </p>
      )}
      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox="0 0 900 520"
          className="w-full min-w-[600px]"
          role="group"
          aria-labelledby={`${id}-title ${id}-description`}
        >
          <title id={`${id}-title`}>DEXA lean mass vs bodyweight</title>
          <desc id={`${id}-description`}>
            Bodyweight on the horizontal axis and lean soft tissue on the
            vertical axis, both in pounds. Numbered scans run in chronological
            order. Blue arrows show weight loss and red arrows show weight gain.
            Select or focus a scan for its measurements below. Exact values also
            follow in the table.{" "}
            {projection
              ? "A purple ribbon extends from the latest scan to 240 lb, showing the modeled 95% prediction interval and median path."
              : ""}
          </desc>
          <defs>
            <clipPath id={`${id}-clip`}>
              <rect
                x={plot.left}
                y={plot.top}
                width={plot.right - plot.left}
                height={plot.bottom - plot.top}
              />
            </clipPath>
            {(["bulk", "cut"] as const).map((direction) => (
              <marker
                key={direction}
                id={`${id}-${direction}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={palette[direction]} />
              </marker>
            ))}
          </defs>
          <g clipPath={`url(#${id}-clip)`}>
            {analysis.boneMass !== null &&
              Array.from({ length: 99 }, (_, index) => index + 1).map(
                (percent) => {
                  const fraction = 1 - percent / 100;
                  const leanAt = (weight: number) =>
                    weight * fraction - analysis.boneMass!;
                  const labelWeight = Math.min(
                    xBounds[1] - 0.5,
                    (yBounds[1] - 0.5 + analysis.boneMass!) / fraction,
                  );
                  const labelLean = leanAt(labelWeight);
                  return (
                    <g key={percent}>
                      <line
                        x1={x(xBounds[0])}
                        y1={y(leanAt(xBounds[0]))}
                        x2={x(xBounds[1])}
                        y2={y(leanAt(xBounds[1]))}
                        stroke="currentColor"
                        opacity={percent % 5 === 0 ? 0.18 : 0.07}
                      />
                      {percent % 5 === 0 &&
                        labelLean > yBounds[0] + 0.5 &&
                        labelWeight > xBounds[0] && (
                          <text
                            x={x(labelWeight) - 4}
                            y={y(labelLean) - 6}
                            textAnchor="end"
                            fill="currentColor"
                            opacity={0.45}
                            fontSize="11"
                          >
                            {percent}%
                          </text>
                        )}
                    </g>
                  );
                },
              )}
            {ticks(xBounds).map((value) => (
              <line
                key={`x-${value}`}
                x1={x(value)}
                x2={x(value)}
                y1={plot.top}
                y2={plot.bottom}
                stroke="currentColor"
                opacity={0.08}
              />
            ))}
            {ticks(yBounds).map((value) => (
              <line
                key={`y-${value}`}
                x1={plot.left}
                x2={plot.right}
                y1={y(value)}
                y2={y(value)}
                stroke="currentColor"
                opacity={0.08}
              />
            ))}
            {projection && (
              <g aria-label="Bulk projection to 240 lb">
                <polygon
                  points={`${x(projection.anchor.weight)},${y(projection.anchor.leanMass)} ${x(projection.target)},${y(projection.upper)} ${x(projection.target)},${y(projection.lower)}`}
                  fill="#8b5cf6"
                  fillOpacity="0.16"
                />
                <line
                  x1={x(projection.target)}
                  x2={x(projection.target)}
                  y1={plot.top}
                  y2={plot.bottom}
                  stroke="#8b5cf6"
                  strokeOpacity="0.3"
                  strokeDasharray="3 5"
                />
                <text
                  x={x(projection.target) - 8}
                  y={plot.top + 16}
                  textAnchor="end"
                  fill="currentColor"
                  fontSize="12"
                >
                  240 lb target
                </text>
                {[
                  {
                    label: "Best",
                    lean: projection.upper,
                    dash: "3 5",
                    opacity: 0.65,
                  },
                  {
                    label: "Expected",
                    lean: projection.expected,
                    dash: "8 4",
                    opacity: 1,
                  },
                  {
                    label: "Worst",
                    lean: projection.lower,
                    dash: "3 5",
                    opacity: 0.65,
                  },
                ].map((scenario) => (
                  <g key={scenario.label}>
                    <line
                      x1={x(projection.anchor.weight)}
                      y1={y(projection.anchor.leanMass)}
                      x2={x(projection.target)}
                      y2={y(scenario.lean)}
                      stroke="#8b5cf6"
                      strokeWidth={scenario.label === "Expected" ? 2.5 : 1.5}
                      strokeOpacity={scenario.opacity}
                      strokeDasharray={scenario.dash}
                    />
                    <circle
                      cx={x(projection.target)}
                      cy={y(scenario.lean)}
                      r="4"
                      fill="#8b5cf6"
                    />
                    <text
                      x={x(projection.target) - 8}
                      y={y(scenario.lean) - 8}
                      textAnchor="end"
                      fill="currentColor"
                      fontSize="11"
                    >
                      {scenario.label} {scenario.lean.toFixed(1)}
                    </text>
                  </g>
                ))}
              </g>
            )}
            {analysis.trend && (
              <line
                x1={x(xBounds[0])}
                x2={x(xBounds[1])}
                y1={y(
                  analysis.trend.slope * xBounds[0] + analysis.trend.intercept,
                )}
                y2={y(
                  analysis.trend.slope * xBounds[1] + analysis.trend.intercept,
                )}
                stroke="currentColor"
                opacity={0.65}
                strokeWidth="2.5"
                strokeDasharray="10 7"
              />
            )}
            {recentSlope !== null && (
              <line
                x1={x(xBounds[0])}
                x2={x(xBounds[1])}
                y1={y(
                  recent[1]!.leanMass +
                    recentSlope * (xBounds[0] - recent[1]!.weight),
                )}
                y2={y(
                  recent[1]!.leanMass +
                    recentSlope * (xBounds[1] - recent[1]!.weight),
                )}
                stroke="currentColor"
                opacity={0.3}
                strokeWidth="2"
                strokeDasharray="3 7"
              />
            )}
            {points.map((point, index) => {
              const previous = points[index - 1];
              if (
                !previous ||
                point.number !== previous.number + 1 ||
                !point.direction
              )
                return null;
              const dx = x(point.weight) - x(previous.weight);
              const dy = y(point.leanMass) - y(previous.leanMass);
              const length = Math.hypot(dx, dy);
              if (length < 36) return null;
              return (
                <line
                  key={`arrow-${point.date}`}
                  x1={x(previous.weight) + (dx / length) * 17}
                  y1={y(previous.leanMass) + (dy / length) * 17}
                  x2={x(point.weight) - (dx / length) * 20}
                  y2={y(point.leanMass) - (dy / length) * 20}
                  stroke={palette[point.direction]}
                  strokeWidth="2"
                  opacity={0.75}
                  markerEnd={`url(#${id}-${point.direction})`}
                />
              );
            })}
            {points.map(
              (point) =>
                point.predicted !== null && (
                  <line
                    key={`residual-${point.date}`}
                    x1={x(point.weight)}
                    x2={x(point.weight)}
                    y1={y(point.predicted)}
                    y2={y(point.leanMass)}
                    stroke={
                      point.residual! >= 0 ? palette.positive : palette.negative
                    }
                    strokeWidth="3"
                    opacity={0.8}
                  />
                ),
            )}
          </g>
          <path
            d={`M ${plot.left} ${plot.top} V ${plot.bottom} H ${plot.right}`}
            fill="none"
            stroke="currentColor"
            opacity={0.4}
          />
          {ticks(xBounds).map((value) => (
            <text
              key={value}
              x={x(value)}
              y={plot.bottom + 25}
              textAnchor="middle"
              fill="currentColor"
              opacity={0.6}
              fontSize="12"
            >
              {Number(value.toFixed(1))}
            </text>
          ))}
          {ticks(yBounds).map((value) => (
            <text
              key={value}
              x={plot.left - 12}
              y={y(value) + 4}
              textAnchor="end"
              fill="currentColor"
              opacity={0.6}
              fontSize="12"
            >
              {Number(value.toFixed(1))}
            </text>
          ))}
          <text
            x={(plot.left + plot.right) / 2}
            y="505"
            textAnchor="middle"
            fill="currentColor"
            fontSize="13"
          >
            Bodyweight (lb)
          </text>
          <text
            transform={`translate(20 ${(plot.top + plot.bottom) / 2}) rotate(-90)`}
            textAnchor="middle"
            fill="currentColor"
            fontSize="13"
          >
            Lean soft tissue (lb)
          </text>
          {points.map((point) => (
            <g
              key={point.date}
              role="button"
              tabIndex={0}
              aria-pressed={selected.date === point.date}
              aria-label={`Scan ${point.number}, ${dateLabel(point.date)}, ${point.weight.toFixed(1)} lb bodyweight, ${point.leanMass.toFixed(1)} lb lean mass`}
              className="cursor-pointer outline-none"
              onFocus={() => setSelectedDate(point.date)}
              onClick={() => setSelectedDate(point.date)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedDate(point.date);
                }
              }}
            >
              <circle
                cx={x(point.weight)}
                cy={y(point.leanMass)}
                r="19"
                fill="transparent"
                stroke={selected.date === point.date ? "currentColor" : "none"}
                strokeOpacity={0.5}
              />
              <circle
                cx={x(point.weight)}
                cy={y(point.leanMass)}
                r="13"
                fill={
                  point.date === analysis.latestDate
                    ? palette.latest
                    : "#475569"
                }
              />
              <text
                x={x(point.weight)}
                y={y(point.leanMass) + 4.5}
                textAnchor="middle"
                fill="white"
                fontSize="12"
                fontWeight="600"
                pointerEvents="none"
              >
                {point.number}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span>
          <span style={{ color: palette.cut }}>→</span> Cut
        </span>
        <span>
          <span style={{ color: palette.bulk }}>→</span> Bulk
        </span>
        <span>− − Full-history trend</span>
        <span>··· Latest two scans</span>
        <span>Vertical bars = distance from trend</span>
        <span>
          <span style={{ color: palette.latest }}>●</span> Latest scan
        </span>
      </div>
      {projection && (
        <section
          aria-label="Bulk scenarios at 240 lb"
          className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4"
        >
          <h3 className="text-sm font-medium">
            Current bulk · Scenarios at 240 lb
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            From the {dateLabel(projection.anchor.date)} scan · 95% model
            prediction interval
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Worst case",
                percentile: "2.5th percentile",
                lean: projection.lower,
              },
              {
                label: "Expected case",
                percentile: "Median",
                lean: projection.expected,
              },
              {
                label: "Best case",
                percentile: "97.5th percentile",
                lean: projection.upper,
              },
            ].map((scenario) => (
              <div key={scenario.label} className="tabular-nums">
                <p className="text-xs font-medium">
                  {scenario.label}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {scenario.percentile}
                  </span>
                </p>
                <p className="mt-1 text-lg font-medium">
                  {scenario.lean.toFixed(1)}{" "}
                  <span className="text-xs font-normal">lb lean</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {signed(scenario.lean - projection.anchor.leanMass)} lb lean
                  since scan
                  {analysis.boneMass !== null
                    ? ` · ${(100 * (1 - (scenario.lean + analysis.boneMass) / projection.target)).toFixed(1)}% body fat`
                    : ""}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            The ribbon contains the middle 95% of modeled outcomes. Best and
            worst are percentile scenarios, not absolute limits. Only{" "}
            {projection.intervals} usable bulk intervals in {projection.blocks}{" "}
            scan groups support this estimate; actual 95% coverage has not been
            validated.
          </p>
          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Projection assumptions</summary>
            <p className="mt-2 leading-relaxed">
              Lean mass starts at the latest scan and changes by a constant
              share of each pound gained. We resample whole groups of bulk
              intervals that share a scan, then add the variation of one future
              bulk. The expected path is the median of{" "}
              {projection.simulations.toLocaleString()} deterministic
              simulations. Date filters never refit the model.
            </p>
            <p className="mt-2 leading-relaxed">
              Usable intervals are consecutive scans with at least 2 lb gained
              and no more than 365 days between them, with lean mass recorded at
              both ends. {projection.excluded} gain intervals were excluded.
              Observed scan variation is retained; there is no additional
              measurement-error model. The ribbon conditions on the latest scan
              being exact and narrows to zero there. It projects lean soft
              tissue, including water, rather than muscle alone. Body fat holds
              inferred bone mineral content constant.
            </p>
            <p className="mt-2 leading-relaxed">
              A future bulk needs a{" "}
              <a
                className="underline"
                href="https://www.itl.nist.gov/div898/handbook/pmd/section5/pmd512.htm"
                target="_blank"
                rel="noreferrer"
              >
                prediction interval
              </a>
              , which includes variation in future outcomes as well as
              uncertainty in the fitted average. These empirical bounds assume
              the next bulk resembles past bulks.
            </p>
          </details>
        </section>
      )}
      <div
        className="mt-4 rounded-xl bg-neutral-500/5 p-4 text-sm tabular-nums"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="font-medium">
          Scan {selected.number} · {dateLabel(selected.date)}
          {selected.date === analysis.latestDate ? " · Latest" : ""}
        </p>
        <p className="mt-1 text-muted-foreground">
          {selected.weight.toFixed(1)} lb bodyweight ·{" "}
          {selected.leanMass.toFixed(1)} lb lean mass
          {selected.residual !== null
            ? ` · ${signed(selected.residual)} lb vs trend`
            : ""}
        </p>
        {selected.efficiency !== null && (
          <p className="mt-1 text-xs text-muted-foreground">
            {selected.direction === "bulk" ? "Bulk" : "Cut"} efficiency{" "}
            {Math.round(selected.efficiency * 100)}% ·{" "}
            {selected.direction === "bulk"
              ? "Lean mass gained / weight gained"
              : "1 − lean mass lost / weight lost"}{" "}
            since the preceding scan.
          </p>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Numbers follow scan order. Select a point for details. Arrows reflect
        weight change between scans.
        {analysis.boneMass !== null
          ? ` Diagonal lines show body fat in 1 percentage-point steps, holding inferred bone mineral content at ${analysis.boneMass.toFixed(1)} lb from the latest scan’s weight minus lean and fat mass.`
          : " Body-fat contours are unavailable without complete mass components in the latest scan."}{" "}
        Lean soft tissue excludes bone and includes water. Efficiency describes
        the scan interval and can fall outside 0–100%.
      </p>
    </div>
  );
}
