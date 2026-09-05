"use client";

import {
  ClockCounterClockwiseIcon,
  FireIcon,
  GithubLogoIcon,
  SunIcon,
} from "@phosphor-icons/react";

import {
  type GitHubPlacard,
  contributionDayUrl,
  monthLabelColumns,
  recentWeeks,
} from "~/lib/github/placard";
import { type GitHubContributionDay } from "~/lib/github/types";
import { cn } from "~/lib/util";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import {
  PlacardNestedLinkCard,
  PlacardStatsCard,
} from "./stacks/dom/PlacardStatsCard";

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
 * The contribution graph as GitHub lays it out, across the whole card under
 * the headline and the stats: one column per week, Sunday at the top, square
 * cells, a month name under the first week of each month where the year
 * bars carry their year labels. The year always fits the width, so the
 * squares are as big as the card allows and no bigger. Each square is a
 * link to that day's activity on GitHub; the squares stay out of the tab
 * order because the card itself is the link keyboard users get, and 180
 * stops in a row would be a wall. The month row hides on narrow screens
 * where it would overlap.
 */
function ContributionCalendar({
  login,
  days,
}: {
  login: string;
  days: GitHubContributionDay[];
}) {
  const weeks = recentWeeks(days);
  const labels = monthLabelColumns(weeks);
  const columns = `repeat(${weeks.length}, minmax(0, 1fr))`;
  const shown = weeks
    .flat()
    .filter((day): day is GitHubContributionDay => day !== null);
  const total = shown.reduce((sum, day) => sum + day.count, 0);
  const active = shown.filter((day) => day.count > 0).length;
  return (
    <div
      role="group"
      aria-label={`${count(total)} contributions on ${count(active)} days in the last ${weeks.length} weeks`}
    >
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
                    <a
                      href={contributionDayUrl(login, day.date)}
                      target="_blank"
                      rel="noopener noreferrer"
                      tabIndex={-1}
                      aria-label={`${dateLabel(day.date)}: ${dayCaption(day)}`}
                      className={cn(
                        "block aspect-square w-full rounded-[1px]",
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
 * type and figures: the headline beside the three figures, GitHub's
 * contribution graph across the card beneath them. The headline is the
 * number GitHub prints above its own graph, the last year, because that is
 * the year the graph and the figures describe; the lifetime total sits with
 * the figures. The repositories tab on GitHub is mostly student work from
 * 2015 to 2018 and says nothing about the last year, most of which happened
 * in private repositories; this card is what that tab cannot show.
 */
export default function GitHubActivityCard({
  placard,
}: {
  placard: GitHubPlacard;
}) {
  const { lastYear } = placard;
  return (
    <PlacardNestedLinkCard
      href={placard.profileUrl}
      label="Open Chappy's GitHub profile"
      newTab
      mobileCompact
    >
      <PlacardStatsCard
        headline={count(lastYear.total)}
        headlineIcon={GithubLogoIcon}
        headlineLabel="Contributions in the last year"
        compactMobile
        chart={
          <ContributionCalendar login={placard.login} days={lastYear.days} />
        }
        stats={[
          {
            icon: ClockCounterClockwiseIcon,
            label: `Since ${placard.since}`,
            value: count(placard.allTime),
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
    </PlacardNestedLinkCard>
  );
}
