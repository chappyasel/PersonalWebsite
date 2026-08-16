import TiltCard from "../../TiltCard";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";

import { cn } from "~/lib/util";

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

export function PlacardLinkCard({
  href,
  label,
  newTab = false,
  children,
}: {
  href: string;
  label: string;
  newTab?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TiltCard interactive className="w-full">
      <Link
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
        aria-label={label}
        className="block w-full rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/45"
      >
        <div
          data-placard-surface=""
          className="rounded-3xl border border-foreground/[0.06] bg-muted/40 p-5 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-[24px] min-[1200px]:p-6"
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
  children,
}: {
  href: string;
  label: string;
  newTab?: boolean;
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
        role="link"
        tabIndex={0}
        aria-label={label}
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
          className="rounded-3xl border border-foreground/[0.06] bg-muted/40 p-5 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-[24px] min-[1200px]:p-6"
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
}: {
  years: PlacardYearDatum[];
  unit: string;
}) {
  const max = Math.max(
    1,
    ...years.map((year) => year.value + year.projectedRemainder),
  );

  return (
    <div
      className="flex h-[62px] items-end gap-1.5"
      role="img"
      aria-label={years
        .map((year) => `${year.year}: ${year.value} ${unit}`)
        .join(", ")}
    >
      {years.map((year) => {
        const total = year.value + year.projectedRemainder;
        const actualHeight = Math.max(2, (year.value / max) * 46);
        const projectedHeight = (year.projectedRemainder / max) * 46;

        return (
          <div
            key={year.year}
            className="group/year relative flex min-w-0 flex-1 flex-col items-center justify-end"
          >
            <div className="pointer-events-none absolute bottom-[calc(100%+0.4rem)] left-1/2 z-10 w-max -translate-x-1/2 translate-y-1 rounded-lg border border-white/30 bg-background/90 px-2 py-1 text-center text-[10px] leading-tight text-foreground opacity-0 shadow-lg backdrop-blur-md transition-[opacity,transform] duration-150 group-hover/year:translate-y-0 group-hover/year:opacity-100">
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
                  style={{ height: projectedHeight }}
                />
              ) : null}
              <div
                className="bg-foreground/75"
                style={{ height: actualHeight }}
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

export function PlacardStatsCard({
  headline,
  headlineIcon: HeadlineIcon,
  headlineLabel,
  years,
  yearUnit,
  stats,
}: {
  headline: string;
  headlineIcon: Icon;
  headlineLabel: string;
  years: PlacardYearDatum[];
  yearUnit: string;
  stats: PlacardStat[];
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(7.75rem,.8fr)] items-stretch">
      <div className="flex min-h-52 min-w-0 flex-col justify-between pr-5">
        <div>
          <strong className="block whitespace-nowrap font-serif text-[clamp(3.25rem,13vw,5rem)] font-normal leading-[.78] tracking-[-0.055em] text-foreground">
            {headline}
          </strong>
          <span className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <HeadlineIcon className="size-3.5 shrink-0" weight="bold" />
            {headlineLabel}
          </span>
        </div>
        <PlacardYearBars years={years} unit={yearUnit} />
      </div>
      <div className="flex min-w-0 flex-col justify-between border-l border-foreground/10 pl-5 text-right">
        {stats.map(({ icon: StatIcon, label, value }) => (
          <div key={label}>
            <strong className="block text-[1.65rem] font-semibold tabular-nums leading-none text-foreground">
              {value}
            </strong>
            <span className="mt-1.5 flex items-center justify-end gap-1 whitespace-nowrap text-[11px] font-medium leading-none text-muted-foreground">
              <StatIcon className="size-3.5 shrink-0" weight="bold" />
              {label}
            </span>
          </div>
        ))}
      </div>
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
