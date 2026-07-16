"use client";

import { useMemo } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

const MONTH_LABELS = [
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CELL_GAP_PX = 2;

type YearHeatmapProps<D extends { date: string }> = {
  /** "YYYY" */
  year: string;
  /** Per-day entries keyed by ISO date; days without an entry render empty */
  days: readonly D[] | undefined;
  /** Foreground opacity for a day that has an entry */
  getOpacity: (entry: D) => number;
  renderTooltip: (date: string, entry: D | undefined) => React.ReactNode;
};

/** GitHub-style daily heatmap strip for one year (Monday rows) */
export function YearHeatmap<D extends { date: string }>({
  year,
  days,
  getOpacity,
  renderTooltip,
}: YearHeatmapProps<D>) {
  const grid = useMemo(() => {
    const yearNum = Number(year);
    const yearStart = Date.UTC(yearNum, 0, 1);
    const daysInYear = Math.round(
      (Date.UTC(yearNum + 1, 0, 1) - yearStart) / MS_PER_DAY,
    );
    const startOffset = (new Date(yearStart).getUTCDay() + 6) % 7; // Monday = 0
    const totalCells = Math.ceil((startOffset + daysInYear) / 7) * 7;
    const todayMs = Date.now();

    const dayMap = new Map(days?.map((d) => [d.date, d]) ?? []);

    const cells = Array.from({ length: totalCells }, (_, i) => {
      const dayIndex = i - startOffset;
      if (dayIndex < 0 || dayIndex >= daysInYear) return null; // pad cell
      const dayMs = yearStart + dayIndex * MS_PER_DAY;
      if (dayMs > todayMs) return null; // future day
      const date = new Date(dayMs).toISOString().slice(0, 10);
      return { date, entry: dayMap.get(date) };
    });

    // Column index of each month's first day, for the label row
    const monthCols = MONTH_LABELS.map((label, m) => {
      const firstDay = Math.round(
        (Date.UTC(yearNum, m, 1) - yearStart) / MS_PER_DAY,
      );
      return { label, col: Math.floor((startOffset + firstDay) / 7) };
    });

    return { cells, monthCols, weeks: totalCells / 7 };
  }, [days, year]);

  return (
    <div>
      <div className="relative mb-0.5 h-3">
        {grid.monthCols.map(({ label, col }) => (
          <span
            key={label}
            className="absolute top-0 text-[8px] text-muted-foreground"
            style={{ left: `${(col / grid.weeks) * 100}%` }}
          >
            {label}
          </span>
        ))}
      </div>
      {/* Fluid cells: column tracks split the container width so the strip
          never overflows narrow popovers */}
      <TooltipProvider delayDuration={150} skipDelayDuration={100}>
        <div
          className="grid w-full grid-flow-col"
          style={{
            gridTemplateRows: "repeat(7, auto)",
            gridAutoColumns: "1fr",
            gap: CELL_GAP_PX,
          }}
        >
          {grid.cells.map((cell, i) =>
            cell === null ? (
              <div key={i} className="aspect-square w-full" />
            ) : (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <div
                    className="aspect-square w-full rounded-[1px]"
                    style={{
                      backgroundColor: cell.entry
                        ? `hsl(var(--foreground) / ${getOpacity(cell.entry)})`
                        : "hsl(var(--foreground) / 0.07)",
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {renderTooltip(cell.date, cell.entry)}
                </TooltipContent>
              </Tooltip>
            ),
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}
