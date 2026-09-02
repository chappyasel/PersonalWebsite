"use client";

import {
  CalendarDotsIcon,
  FireIcon,
  GithubLogoIcon,
  SunIcon,
} from "@phosphor-icons/react";

import {
  type GitHubPlacard,
  contributionWeeks,
  monthLabelColumns,
} from "~/lib/github/placard";
import { type GitHubContributionDay } from "~/lib/github/types";
import { cn } from "~/lib/util";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import { PlacardLinkCard, PlacardStatsCard } from "./stacks/dom/PlacardStatsCard";

function count(value: number) {
  return value.toLocaleString("en-US");
}

const MONTHS = [
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

/** GitHub's five steps in the placard's ink, so the squares sit in the card
 * the way the year bars do (bg-foreground/75) instead of arriving in
 * GitHub green. An empty day keeps the faint floor the bars' track uses. */
const LEVEL_CLASS = [
  "bg-foreground/[0.08]",
  "bg-foreground/30",
  "bg-foreground/[0.52]",
  "bg-foreground/[0.76]",
  "bg-foreground",
] as const;

/** "Sep 1" at local noon so no zone shifts the day. */
function dateLabel(key: string) {
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function dayCaption(day: GitHubContributionDay) {
  return day.count === 0
    ? "No contributions"
    : `${count(day.count)} contribution${day.count === 1 ? "" : "s"}`;
}

/**
 * The contribution graph as GitHub lays it out, in the slot the Weightlifting
 * card gives its year bars: one column per week, Sunday at the top, square
 * cells, a month name under the first week of each month where the bars
 * carry their year labels. The year always fits the column, so the squares
 * are small; the month row hides on narrow screens where it would overlap.
 */
function ContributionCalendar({
  days,
  label,
}: {
  days: GitHubContributionDay[];
  label: string;
}) {
  const weeks = contributionWeeks(days);
  const labels = monthLabelColumns(weeks);
  const columns = `repeat(${weeks.length}, minmax(0, 1fr))`;
  return (
    <div role="img" aria-label={label}>
      <TooltipProvider delayDuration={100}>
        <div
          className="grid gap-px"
          style={{
            gridTemplateColumns: columns,
            gridTemplateRows: "repeat(7, minmax(0, 1fr))",
            gridAutoFlow: "column",
          }}
        >
          {weeks.flatMap((week, column) =>
            week.map((day, row) =>
              day ? (
                <Tooltip key={day.date}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "aspect-square w-full rounded-[1px]",
                        LEVEL_CLASS[day.level],
                        day.count > 0 &&
                          "transition-transform duration-150 hover:scale-150",
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    <div className="flex flex-col gap-0.5">
                      <p className="font-semibold leading-none">
                        {dateLabel(day.date)}
                      </p>
                      <p className="text-muted-foreground">{dayCaption(day)}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div key={`${column}:${row}`} className="aspect-square w-full" />
              ),
            ),
          )}
        </div>
      </TooltipProvider>
      <div
        className="mt-1.5 hidden h-3 text-[10px] leading-none text-muted-foreground sm:grid"
        style={{ gridTemplateColumns: columns }}
        aria-hidden
      >
        {labels.map(({ column, month }) => (
          <span
            key={column}
            className="whitespace-nowrap"
            style={{ gridColumn: column + 1 }}
          >
            {MONTHS[month - 1]}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The live half of the Projects placard, in the Weightlifting stats card's
 * exact shape: the headline, GitHub's contribution graph where that card
 * keeps its year bars, three figures past the divider. The repositories tab
 * on GitHub is mostly student work from 2015 to 2018 and says nothing about
 * the last year, most of which happened in private repositories; this card
 * is what that tab cannot show.
 */
export default function GitHubActivityCard({
  placard,
}: {
  placard: GitHubPlacard;
}) {
  const { lastYear } = placard;
  return (
    <PlacardLinkCard
      href={placard.profileUrl}
      label="Open Chappy's GitHub profile"
      newTab
      mobileCompact
    >
      <PlacardStatsCard
        headline={count(placard.allTime)}
        headlineIcon={GithubLogoIcon}
        headlineLabel={`Contributions since ${placard.since}`}
        compactMobile
        chart={
          <ContributionCalendar
            days={lastYear.days}
            label={`${count(lastYear.total)} GitHub contributions on ${count(lastYear.activeDays)} days in the last 12 months`}
          />
        }
        stats={[
          {
            icon: CalendarDotsIcon,
            label: "Last 12 months",
            value: count(lastYear.total),
          },
          {
            icon: SunIcon,
            label: "Active days",
            value: count(lastYear.activeDays),
          },
          {
            icon: FireIcon,
            label: "Longest streak",
            value: `${count(lastYear.longestStreak)}d`,
          },
        ]}
      />
    </PlacardLinkCard>
  );
}
