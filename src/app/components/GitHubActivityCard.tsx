"use client";

import {
  CalendarDotsIcon,
  FireIcon,
  GithubLogoIcon,
  SunIcon,
} from "@phosphor-icons/react";

import { type GitHubPlacard } from "~/lib/github/placard";

import {
  MOSAIC_DAYS,
  type MosaicCell,
  PlacardMosaic,
  mosaicDateLabel,
} from "./stacks/dom/PlacardMosaic";
import { PlacardLinkCard, PlacardStatsCard } from "./stacks/dom/PlacardStatsCard";

function count(value: number) {
  return value.toLocaleString("en-US");
}

/** GitHub's own five shading steps, in the placard's ink rather than GitHub
 * green: the card is a museum label about him, not an embed. The 0.08 floor
 * and the 0.25 base match the Weightlifting mosaic so the two read as one
 * family. */
const LEVEL_OPACITY = [0.08, 0.44, 0.63, 0.81, 1] as const;

function contributionCells(placard: GitHubPlacard): MosaicCell[] {
  return placard.lastYear.days.slice(-MOSAIC_DAYS).map((day) => ({
    key: day.date,
    background: "hsl(var(--foreground))",
    opacity: LEVEL_OPACITY[day.level],
    active: day.count > 0,
    tooltipHeading: mosaicDateLabel(day.date),
    tooltipDetail:
      day.count === 0
        ? "No contributions"
        : `${count(day.count)} contribution${day.count === 1 ? "" : "s"}`,
  }));
}

/**
 * The live half of the Projects placard, in the Weightlifting stats card's
 * shape with the year-at-a-glance mosaic where that card keeps its year
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
            <PlacardMosaic
              cells={contributionCells(placard)}
              label={`${count(lastYear.total)} GitHub contributions on ${count(lastYear.activeDays)} days in the last 12 months`}
              heightClassName="h-[220px] sm:h-[250px]"
            />
            <div className="mt-2.5 flex justify-between text-[11px] text-muted-foreground">
              <span>Last 12 months</span>
              {lastYear.restricted > 0 ? (
                <span>{lastYear.privateShare}% in private repositories</span>
              ) : null}
            </div>
          </>
        }
      />
    </PlacardLinkCard>
  );
}
