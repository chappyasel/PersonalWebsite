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
    /** Every day GitHub returned for the year, oldest first: whole weeks,
     * Sunday to Saturday, the way its own graph lays them out. */
    days: GitHubContributionDay[];
    from: string;
    to: string;
  };
  publicRepoCount: number;
  /** Public repositories with a description, own or organization ones he
   * committed to this year, newest push first, minus those with a card. */
  repos: GitHubPlacardRepo[];
};

export const GITHUB_REPOS_LIMIT = 8;

function weekday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).getUTCDay();
}

/**
 * GitHub's graph is columns of weeks, Sunday at the top. The snapshot stores
 * days flat, so rebuild the columns from the first day's weekday and pad the
 * partial first and last weeks with nulls instead of shifting them.
 */
export function contributionWeeks(days: readonly GitHubContributionDay[]) {
  if (days.length === 0) return [] as (GitHubContributionDay | null)[][];
  const offset = weekday(days[0]!.date);
  const columns = Math.ceil((offset + days.length) / 7);
  const weeks: (GitHubContributionDay | null)[][] = Array.from(
    { length: columns },
    () => Array.from({ length: 7 }, () => null),
  );
  days.forEach((day, index) => {
    const slot = offset + index;
    weeks[Math.floor(slot / 7)]![slot % 7] = day;
  });
  return weeks;
}

/**
 * Which columns get a month label, GitHub's way: the first column whose first
 * day falls in a new month. A label that would sit on top of the next one
 * (a partial first week, mostly) is dropped rather than crowded.
 */
export function monthLabelColumns(
  weeks: readonly (readonly (GitHubContributionDay | null)[])[],
  minimumGap = 3,
) {
  const labels: { column: number; month: number }[] = [];
  let previousMonth: number | null = null;
  weeks.forEach((week, column) => {
    const first = week.find((day) => day !== null);
    if (!first) return;
    const month = Number(first.date.slice(5, 7));
    if (previousMonth !== null && month !== previousMonth) {
      labels.push({ column, month });
    }
    previousMonth = month;
  });
  return labels.filter(
    (label, index) =>
      index === labels.length - 1 ||
      labels[index + 1]!.column - label.column >= minimumGap,
  );
}

function placardRepo(repo: GitHubRepo, login: string): GitHubPlacardRepo {
  return {
    nameWithOwner: repo.nameWithOwner,
    name: repo.name,
    organization: repo.owner === login ? null : repo.owner,
    description: repo.description,
    url: repo.url,
    language: repo.language,
    pushedAt: repo.pushedAt,
    createdAt: repo.createdAt,
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
 * card, so the repository list does not repeat them. The list itself is his
 * own public repositories plus the organization ones he committed to this
 * year, one list by last push, the way the repositories tab sorts.
 */
export function buildGitHubPlacard(
  activity: GitHubActivity,
  {
    featuredRepos = [],
    now = new Date(),
  }: { featuredRepos?: readonly string[]; now?: Date } = {},
): GitHubPlacard {
  const featured = new Set(featuredRepos.map((name) => name.toLowerCase()));
  const seen = new Set<string>();
  const repos = [...activity.repos, ...activity.activeRepos]
    .filter((repo) => {
      const key = repo.nameWithOwner.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return (
        !repo.isFork &&
        !repo.isArchived &&
        repo.description !== null &&
        !featured.has(key)
      );
    })
    .sort((a, b) => b.pushedAt.localeCompare(a.pushedAt))
    .slice(0, GITHUB_REPOS_LIMIT)
    .map((repo) => placardRepo(repo, activity.login));

  const days = activity.contributions.days;
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
      activeDays: days.filter((day) => day.count > 0).length,
      longestStreak: longestStreak(days),
      days,
      from: days[0]?.date ?? activity.contributions.from.slice(0, 10),
      to: days[days.length - 1]?.date ?? activity.contributions.to.slice(0, 10),
    },
    publicRepoCount: activity.publicRepoCount,
    repos,
  };
}
