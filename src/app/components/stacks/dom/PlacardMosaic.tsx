"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

// Four bands of a quarter-year rather than two of a half-year: same 364 days,
// same one-cell-per-day honesty, but each cell gets twice the width. At 26
// columns the year was legible as a texture and unreadable as data — the owner
// called it "too compact".
export const MOSAIC_COLUMNS = 13;
export const MOSAIC_ROWS = 7;
export const MOSAIC_BLOCKS = 4;
export const MOSAIC_DAYS = MOSAIC_COLUMNS * MOSAIC_ROWS * MOSAIC_BLOCKS;
/** Days in one band. */
export const MOSAIC_BLOCK_DAYS = MOSAIC_COLUMNS * MOSAIC_ROWS;

export type MosaicCell = {
  key: string;
  /** Any CSS background: a colour, or a gradient of several. */
  background: string;
  opacity: number;
  /** Whether the day had anything in it; empty days do not react to hover. */
  active: boolean;
  tooltipHeading: string;
  tooltipDetail: string;
};

/** Where day `index` (0 = oldest of the 364) lands: band, column, row. */
export function mosaicPosition(index: number) {
  const week = Math.floor(index / 7);
  return {
    blockIndex: Math.floor(week / MOSAIC_COLUMNS),
    gridColumn: (week % MOSAIC_COLUMNS) + 1,
    gridRow: (index % 7) + 1,
  };
}

/** "Sep 1" for a YYYY-MM-DD key, at local noon so no zone shifts the day. */
export function mosaicDateLabel(key: string) {
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * The year-at-a-glance grid the Weightlifting and Projects placards share:
 * one cell per day in four 13-week bands, a tooltip on each. Callers decide
 * what a day means (its colour, its opacity, its caption); this only lays
 * the days out and keeps the two placards' grids identical.
 */
export function PlacardMosaic({
  cells,
  label,
  heightClassName = "h-[300px] sm:h-[340px]",
}: {
  /** Exactly the trailing MOSAIC_DAYS days, oldest first. */
  cells: MosaicCell[];
  label: string;
  /** The Weightlifting card gives the grid a card of its own; a grid that
   * shares a card with other figures asks for less. */
  heightClassName?: string;
}) {
  // Derived from MOSAIC_BLOCKS rather than listed, so changing the block
  // count is one constant and not three places that can disagree.
  const blocks = Array.from({ length: MOSAIC_BLOCKS }, (_, block) =>
    cells
      .map((cell, index) => ({ cell, ...mosaicPosition(index) }))
      .filter((entry) => entry.blockIndex === block),
  );

  return (
    <div className={heightClassName} role="img" aria-label={label}>
      <TooltipProvider delayDuration={150}>
        <div
          className="grid h-full gap-3"
          style={{
            gridTemplateRows: `repeat(${MOSAIC_BLOCKS}, minmax(0, 1fr))`,
          }}
        >
          {blocks.map((block, blockIndex) => (
            <div
              key={blockIndex}
              className="grid h-full gap-1"
              style={{
                gridTemplateColumns: `repeat(${MOSAIC_COLUMNS}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${MOSAIC_ROWS}, minmax(0, 1fr))`,
              }}
            >
              {block.map(({ cell, gridColumn, gridRow }) => (
                <Tooltip key={cell.key}>
                  <TooltipTrigger asChild>
                    <div
                      className={`size-full rounded-[3px] ${
                        cell.active
                          ? "transition-transform duration-200 hover:scale-125"
                          : ""
                      }`}
                      style={{
                        background: cell.background,
                        opacity: cell.opacity,
                        gridColumn,
                        gridRow,
                      }}
                    />
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={8}
                    className="max-w-56"
                  >
                    <div className="flex flex-col gap-0.5">
                      <p className="font-semibold leading-none">
                        {cell.tooltipHeading}
                      </p>
                      <p className="text-muted-foreground">
                        {cell.tooltipDetail}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}
