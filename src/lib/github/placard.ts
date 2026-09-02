import { effectiveDaysInYear } from "~/lib/stats/yoy";

import {
  GITHUB_PROFILE_URL,
  GITHUB_REPOSITORIES_URL,
  type GitHubActivity,
  type GitHubContributionDay,
  type GitHubRepo,
} from "./types";

export type GitHubPlacardRepo = {
  nameWithOwner: string;
  name: string;
  /** Null when the repository lives under the account itself. */
  organization: string | null;
  description: string | null;
  url: string;
  language: string | null;
  pushedAt: string;
  createdAt: string;
  /** Commits this year; only set on the active list. */
  commits?: number;
};

export type GitHubPlacardYear = {
  year: number;
  value: number;
  /** For the current year, the rest of the year at the pace so far. */
  projectedRemainder: number;
};

export type GitHubPlacard = {
  login: string;
  profileUrl: string;
  repositoriesUrl: string;
  fetchedAt: string;
  /** Every contribution GitHub has for the account, all years summed. */
  allTime: number;
  /** The first year on the year bars. */
  since: number;
  years: GitHubPlacardYear[];
  lastYear: {
    total: number;
    restricted: number;
    /** Whole-number percentage of `total` made in private repositories. */
    privateShare: number;
    activeDays: number;
    longestStreak: number;
    /** The trailing `MOSAIC_DAYS` days, oldest first, for the banded mosaic. */
    days: GitHubContributionDay[];
    from: string;
    to: string;
  };
  publicRepoCount: number;
  /** Public repositories, own or organization, that received commits this year. */
  active: GitHubPlacardRepo[];
  /** Older public repositories under the account that no card already shows. */
  more: GitHubPlacardRepo[];
};

export const GITHUB_ACTIVE_LIMIT = 5;
export const GITHUB_MORE_LIMIT = 6;
/** Same 364-day window as the Weightlifting mosaic's four 13-week bands. */
export const GITHUB_MOSAIC_DAYS = 364;

function placardRepo(
  repo: GitHubRepo,
  login: string,
  commits?: number,
): GitHubPlacardRepo {
  return {
    nameWithOwner: repo.nameWithOwner,
    name: repo.name,
    organization: repo.owner === login ? null : repo.owner,
    description: repo.description,
    url: repo.url,
    language: repo.language,
    pushedAt: repo.pushedAt,
    createdAt: repo.createdAt,
    ...(commits === undefined ? {} : { commits }),
  };
}

/** Longest run of consecutive days with at least one contribution. */
export function longestStreak(days: readonly GitHubContributionDay[]) {
  let best = 0;
  let run = 0;
  for (const day of days) {
    run = day.count > 0 ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/**
 * One bar per calendar year from the first year GitHub knows to the current
 * one, gaps filled with zero. The current year carries a projected remainder
 * at the pace so far, the same arithmetic as the Weightlifting placard.
 */
export function yearBars(
  years: readonly { year: number; total: number }[],
  now: Date,
): GitHubPlacardYear[] {
  const currentYear = now.getUTCFullYear();
  const totals = new Map(years.map((entry) => [entry.year, entry.total]));
  const firstYear = Math.min(currentYear, ...years.map((entry) => entry.year));
  const daysInCurrentYear = Math.round(
    (Date.UTC(currentYear + 1, 0, 1) - Date.UTC(currentYear, 0, 1)) /
      86_400_000,
  );
  const elapsed =
    effectiveDaysInYear(String(currentYear), now) / daysInCurrentYear;
  return Array.from({ length: currentYear - firstYear + 1 }, (_, index) => {
    const year = firstYear + index;
    const value = totals.get(year) ?? 0;
    const projectedRemainder =
      year === currentYear && elapsed > 0 && elapsed < 1
        ? (value * (1 - elapsed)) / elapsed
        : 0;
    return { year, value, projectedRemainder };
  });
}

/**
 * Shape the fetched activity into what the Projects placard shows.
 *
 * `featuredRepos` names the repositories that already have a curated project
 * card, so the "more" list does not repeat them. The active list keeps them:
 * that list is a record of where this year's commits went, and hiding the
 * site's own repository from it would misstate the year.
 */
export function buildGitHubPlacard(
  activity: GitHubActivity,
  {
    featuredRepos = [],
    now = new Date(),
  }: { featuredRepos?: readonly string[]; now?: Date } = {},
): GitHubPlacard {
  const featured = new Set(featuredRepos.map((name) => name.toLowerCase()));
  const active = activity.activeRepos
    .slice()
    .sort(
      (a, b) =>
        b.commits - a.commits || a.nameWithOwner.localeCompare(b.nameWithOwner),
    )
    .slice(0, GITHUB_ACTIVE_LIMIT)
    .map((repo) => placardRepo(repo, activity.login, repo.commits));
  const shown = new Set([
    ...featured,
    ...active.map((repo) => repo.nameWithOwner.toLowerCase()),
  ]);
  const more = activity.repos
    .filter(
      (repo) =>
        !repo.isFork &&
        !repo.isArchived &&
        repo.description !== null &&
        !shown.has(repo.nameWithOwner.toLowerCase()),
    )
    .sort((a, b) => b.pushedAt.localeCompare(a.pushedAt))
    .slice(0, GITHUB_MORE_LIMIT)
    .map((repo) => placardRepo(repo, activity.login));

  const allDays = activity.contributions.days;
  const days = allDays.slice(-GITHUB_MOSAIC_DAYS);
  const years = yearBars(activity.years, now);
  const { total, restricted } = activity.contributions;
  return {
    login: activity.login,
    profileUrl: GITHUB_PROFILE_URL,
    repositoriesUrl: GITHUB_REPOSITORIES_URL,
    fetchedAt: activity.fetchedAt,
    allTime: years.reduce((sum, year) => sum + year.value, 0),
    since: years[0]?.year ?? now.getUTCFullYear(),
    years,
    lastYear: {
      total,
      restricted,
      privateShare: total > 0 ? Math.round((restricted / total) * 100) : 0,
      activeDays: allDays.filter((day) => day.count > 0).length,
      longestStreak: longestStreak(allDays),
      days,
      from: days[0]?.date ?? activity.contributions.from.slice(0, 10),
      to: days[days.length - 1]?.date ?? activity.contributions.to.slice(0, 10),
    },
    publicRepoCount: activity.publicRepoCount,
    active,
    more,
  };
}
