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

/** GitHub's own five-step green, light and dark, so the graph reads as the
 * one on his profile and not a restyling of it. */
const LEVEL_CLASS = [
  "bg-[#ebedf0] dark:bg-[#2a2f36]",
  "bg-[#9be9a8] dark:bg-[#0e4429]",
  "bg-[#40c463] dark:bg-[#006d32]",
  "bg-[#30a14e] dark:bg-[#26a641]",
  "bg-[#216e39] dark:bg-[#39d353]",
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
 * The contribution graph as GitHub draws it: one column per week, Sunday at
 * the top, square cells, month names over the first week of each month, and
 * a Less-to-More legend. The whole year always fits the card width, so the
 * squares shrink on a phone rather than scrolling sideways, which would
 * fight the sheet's own gestures.
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
      <div
        className="grid h-3.5 text-[10px] leading-none text-muted-foreground"
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
      <TooltipProvider delayDuration={100}>
        <div
          className="grid gap-[2px]"
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
                        "aspect-square w-full rounded-[2px]",
                        LEVEL_CLASS[day.level],
                        day.count > 0 &&
                          "transition-transform duration-150 hover:scale-125",
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
    </div>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-[3px]" aria-hidden>
      <span className="mr-0.5">Less</span>
      {LEVEL_CLASS.map((level) => (
        <span key={level} className={cn("size-2.5 rounded-[2px]", level)} />
      ))}
      <span className="ml-0.5">More</span>
    </span>
  );
}

/**
 * The live half of the Projects placard, in the Weightlifting stats card's
 * shape with GitHub's own contribution graph where that card keeps its year
 * bars. The repositories tab on GitHub is mostly student work from 2015 to
 * 2018 and says nothing about the last year, most of which happened in
 * private repositories; this card is what that tab cannot show.
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
        footer={
          <>
            <ContributionCalendar
              days={lastYear.days}
              label={`${count(lastYear.total)} GitHub contributions on ${count(lastYear.activeDays)} days in the last 12 months`}
            />
            <div className="mt-2.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span>
                {lastYear.restricted > 0
                  ? `${lastYear.privateShare}% in private repositories`
                  : "Last 12 months"}
              </span>
              <Legend />
            </div>
          </>
        }
      />
    </PlacardLinkCard>
  );
}
