import TiltCard from "../../TiltCard";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

import { useTapFirstCapability } from "~/lib/useTapFirstCapability";
import { cn } from "~/lib/util";

import { tooltipSurfaceClassName } from "~/components/ui/tooltip";

export type PlacardYearDatum = {
  year: number;
  value: number;
  projectedRemainder: number;
};

export type PlacardStat = {
  icon: Icon;
  label: string;
  value: string;
};

/** "placard" is the homepage size. "card" fits a hover card: the same
 * layout with the headline, bars, and stats scaled to a 24rem popover. */
export type PlacardSize = "placard" | "card";

export function PlacardLinkCard({
  href,
  label,
  newTab = false,
  mobileCompact = false,
  children,
}: {
  href: string;
  label: string;
  newTab?: boolean;
  mobileCompact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TiltCard interactive className="w-full">
      <Link
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
        aria-label={label}
        data-mobile-compact-card={mobileCompact ? "" : undefined}
        className="block w-full rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/45"
      >
        <div
          data-placard-surface=""
          className="rounded-3xl border border-foreground/[0.06] bg-muted/90 p-5 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-[24px] min-[1200px]:p-6"
        >
          {children}
        </div>
      </Link>
    </TiltCard>
  );
}

/** Whole-surface navigation for cards that also contain narrower deep links.
 * A div owns the general destination so the descendant book/subject anchors
 * remain valid HTML and keep their more specific destinations. */
export function PlacardNestedLinkCard({
  href,
  label,
  newTab = false,
  mobileCompact = false,
  children,
}: {
  href: string;
  label: string;
  newTab?: boolean;
  mobileCompact?: boolean;
  children: React.ReactNode;
}) {
  const open = () => {
    if (newTab) {
      const opened = window.open(href, "_blank", "noopener,noreferrer");
      if (opened) opened.opener = null;
      return;
    }
    window.location.assign(href);
  };

  return (
    <TiltCard interactive className="w-full">
      <div
        data-placard-link=""
        data-placard-href={href}
        data-placard-target={newTab ? "_blank" : undefined}
        role="link"
        tabIndex={0}
        aria-label={label}
        data-mobile-compact-card={mobileCompact ? "" : undefined}
        onClick={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest("a, button, input, select, textarea")
          )
            return;
          open();
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || event.key !== "Enter")
            return;
          event.preventDefault();
          open();
        }}
        className="w-full rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/45"
      >
        <div
          data-placard-surface=""
          className="rounded-3xl border border-foreground/[0.06] bg-muted/90 p-5 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-[24px] min-[1200px]:p-6"
        >
          {children}
        </div>
      </div>
    </TiltCard>
  );
}

function PlacardYearBars({
  years,
  unit,
  compactMobile = false,
  size = "placard",
}: {
  years: PlacardYearDatum[];
  unit: string;
  compactMobile?: boolean;
  size?: PlacardSize;
}) {
  const tapFirst = useTapFirstCapability();
  const [touchedYear, setTouchedYear] = useState<number | null>(null);
  const max = Math.max(
    1,
    ...years.map((year) => year.value + year.projectedRemainder),
  );

  return (
    <div
      data-year-bars=""
      data-mobile-compact={compactMobile ? "" : undefined}
      className={cn(
        "flex items-end gap-1.5",
        // The placard's bar height follows the card's inline size (the grid
        // above is the query container), so the bars grow with the column
        // they sit in instead of holding 46px in a 530px card. The mobile
        // sheet overrides both the variable and the height in PlacardLayer.
        size === "card"
          ? "h-[46px]"
          : "h-[calc(var(--placard-year-bar-max)+1rem)] [--placard-year-bar-max:clamp(46px,12cqw,64px)]",
      )}
      style={
        size === "card"
          ? ({
              "--placard-year-bar-max": "32px",
            } as unknown as React.CSSProperties)
          : undefined
      }
      role="img"
      aria-label={years
        .map((year) => `${year.year}: ${year.value} ${unit}`)
        .join(", ")}
    >
      {years.map((year) => {
        const total = year.value + year.projectedRemainder;
        const actualHeight = Math.max(2 / 46, year.value / max);
        const projectedHeight = year.projectedRemainder / max;

        return (
          <div
            key={year.year}
            tabIndex={0}
            aria-label={`${year.year}: ${year.value} ${unit}`}
            onPointerUp={(event) => {
              if (event.pointerType !== "touch") return;
              event.preventDefault();
              event.stopPropagation();
              setTouchedYear((current) =>
                current === year.year ? null : year.year,
              );
            }}
            onClick={(event) => {
              if (tapFirst) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onBlur={() => setTouchedYear(null)}
            className="group/year relative flex min-w-0 flex-1 flex-col items-center justify-end"
          >
            <div
              role="tooltip"
              className={cn(
                tooltipSurfaceClassName,
                "pointer-events-none absolute bottom-[calc(100%+0.4rem)] left-1/2 z-[100] w-max -translate-x-1/2 translate-y-1 text-center text-[10px] leading-tight opacity-0 transition-[opacity,transform] duration-150 group-hover/year:translate-y-0 group-hover/year:opacity-100 group-focus/year:translate-y-0 group-focus/year:opacity-100",
                touchedYear === year.year && "translate-y-0 opacity-100",
              )}
            >
              <span className="block text-muted-foreground">{year.year}</span>
              <strong className="font-semibold tabular-nums">
                {year.value} {unit}
              </strong>
              {year.projectedRemainder > 0 ? (
                <span className="block text-muted-foreground">
                  ~{Math.round(total)} projected
                </span>
              ) : null}
            </div>
            <div
              className="flex w-full flex-col justify-end overflow-hidden rounded-t-[3px]"
              style={{ maxWidth: years.length === 1 ? 64 : undefined }}
            >
              {projectedHeight > 0 ? (
                <div
                  className="border border-dashed border-foreground/35 bg-foreground/[0.06]"
                  style={{
                    height: `calc(var(--placard-year-bar-max, 46px) * ${projectedHeight})`,
                  }}
                />
              ) : null}
              <div
                className="bg-foreground/75"
                style={{
                  height: `calc(var(--placard-year-bar-max, 46px) * ${actualHeight})`,
                }}
              />
            </div>
            <span className="mt-1.5 text-[10px] tabular-nums text-muted-foreground">
              &apos;{String(year.year).slice(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Headline figure and three stats, with a chart under the headline: the
 * year bars when `years` is given (Weightlifting), or whatever `chart` is
 * passed in their place (the GitHub card's contribution calendar). With
 * neither, the left column drops its minimum height so no blank slot is
 * left where a chart would have stood.
 *
 * The stats column is sized to its widest label, so the divider sits
 * beside the figures instead of splitting the card 60/40 and leaving the
 * right half mostly empty. Everything else goes to the headline and the
 * chart. The grid is a container query root: the headline, the stat
 * values, and the year bars scale in `cqw` of the card, which holds in all
 * three shells (the desktop dock, the mobile sheet, the flat page) where a
 * viewport unit only described one of them.
 *
 * Past 38rem of card width the year-bar cards put the headline beside the
 * bars instead of above them (`data-placard-split`, rules in globals.css):
 * a bar row across a 40rem column runs long and leaves a pocket beside the
 * number.
 *
 * A `chart` (the GitHub calendar) takes a different shape: below 38rem the
 * headline sits beside the stats in a top row and the chart spans the whole
 * card underneath, because its 53 columns need the full width to be legible
 * and the three stacked stats are always taller than the headline block,
 * so that row has no pocket to fill. From 38rem (`data-placard-chart-row`,
 * globals.css) the chart moves back under the headline in the left column
 * and the stats span both rows: a 38rem column already gives the weeks 8px
 * cells, and the beside-stats row was mostly air at that size.
 */
export function PlacardStatsCard({
  headline,
  headlineIcon: HeadlineIcon,
  headlineLabel,
  years,
  yearUnit,
  stats,
  compactMobile = false,
  chart,
  size = "placard",
}: {
  headline: string;
  headlineIcon: Icon;
  headlineLabel: string;
  years?: PlacardYearDatum[];
  yearUnit?: string;
  stats: PlacardStat[];
  compactMobile?: boolean;
  /** Rendered where the year bars would go, in the left column. */
  chart?: React.ReactNode;
  size?: PlacardSize;
}) {
  const bars = years !== undefined && yearUnit !== undefined;
  const chartRow = !bars && chart !== undefined;
  const card = size === "card";
  return (
    <div
      data-mobile-compact-stats={compactMobile ? "" : undefined}
      data-placard-size={size}
      data-placard-split={bars && !card ? "" : undefined}
      data-placard-chart-row={chartRow ? "" : undefined}
      className={cn(
        "grid items-stretch",
        // Three sizes drive the type: the headline, the stat values, and the
        // one label size both share. Margins and icons are fractions of
        // them (below), so the number-to-label gap is the same proportion
        // everywhere and the mobile sheet and split form only swap the
        // three values. `leading-none` follows each `text-[...]` on purpose:
        // `cn` is tailwind-merge, which drops a leading class that a later
        // font-size class would override, and that is how every stat value
        // silently rendered at 1.5 line-height.
        card
          ? "grid-cols-[minmax(0,1.25fr)_minmax(6rem,.75fr)] [--placard-headline:2.75rem] [--placard-label:10px] [--placard-stat:1.25rem]"
          : "grid-cols-[minmax(0,1fr)_auto] [--placard-headline:clamp(3.25rem,21cqw,7rem)] [--placard-label:clamp(11px,2.75cqw,16px)] [--placard-stat:clamp(1.65rem,6cqw,2.25rem)] [container-type:inline-size]",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-col",
          // Beside the stats the headline block is the shorter of the two,
          // so it centres on them; above the bars it holds the top.
          chartRow ? "justify-center" : "justify-between",
          card ? "pr-3" : "gap-5 pr-4 min-[1200px]:pr-5",
          bars && (card ? "min-h-[8.5rem]" : "min-h-44 min-[1200px]:min-h-52"),
        )}
      >
        <div>
          <strong className="block whitespace-nowrap font-serif text-[length:var(--placard-headline)] font-normal leading-[.78] tracking-[-0.055em] text-foreground">
            {headline}
          </strong>
          {/* 0.22 of the headline, not less: leading-[.78] crops the line
              box to 0.04em below the baseline and Georgia's comma descends
              0.2em, so anything under ~0.18em puts "2,315" into the label. */}
          <span className="mt-[calc(var(--placard-headline)*0.22)] flex items-center gap-1.5 whitespace-nowrap text-[length:var(--placard-label)] leading-none text-muted-foreground">
            <HeadlineIcon className="size-[1.15em] shrink-0" weight="bold" />
            {headlineLabel}
          </span>
        </div>
        {bars ? (
          <PlacardYearBars
            years={years}
            unit={yearUnit}
            compactMobile={compactMobile}
            size={size}
          />
        ) : null}
      </div>
      <div
        data-placard-stats=""
        className={cn(
          "flex min-w-0 flex-col justify-between border-l border-foreground/10 text-right",
          card ? "pl-3" : "pl-4 min-[1200px]:pl-5",
          // The stats set the top row's height when the chart is below, so
          // their spread has to come from a gap rather than from slack.
          chartRow && "gap-3",
        )}
      >
        {stats.map(({ icon: StatIcon, label, value }) => (
          <div key={label}>
            <strong className="block text-[length:var(--placard-stat)] font-semibold tabular-nums leading-none text-foreground">
              {value}
            </strong>
            <span className="mt-[calc(var(--placard-stat)*0.15)] flex items-center justify-end gap-1 whitespace-nowrap text-[length:var(--placard-label)] font-medium leading-none text-muted-foreground">
              <StatIcon className="size-[1.15em] shrink-0" weight="bold" />
              {label}
            </span>
          </div>
        ))}
      </div>
      {chartRow ? (
        <div
          data-placard-chart=""
          className={cn("col-span-2", card ? "mt-3" : "mt-4 min-[1200px]:mt-5")}
        >
          {chart}
        </div>
      ) : null}
    </div>
  );
}

export function PlacardCardHeading({
  icon: Icon,
  children,
  detail,
  className,
}: {
  icon: Icon;
  children: React.ReactNode;
  detail?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("mb-4 flex items-center justify-between gap-3", className)}
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="size-4 shrink-0" weight="duotone" />
        {children}
      </h3>
      {detail ? (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {detail}
        </span>
      ) : null}
    </div>
  );
}
