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

export type GitHubPlacard = {
  login: string;
  profileUrl: string;
  repositoriesUrl: string;
  fetchedAt: string;
  contributions: {
    total: number;
    restricted: number;
    /** First and last calendar dates on the mosaic, YYYY-MM-DD. */
    from: string;
    to: string;
    /** Columns of seven weekday rows, Sunday first; null pads partial weeks. */
    weeks: (GitHubContributionDay | null)[][];
    activeDays: number;
  };
  publicRepoCount: number;
  /** Public repositories, own or organization, that received commits this year. */
  active: GitHubPlacardRepo[];
  /** Older public repositories under the account that no card already shows. */
  more: GitHubPlacardRepo[];
};

export const GITHUB_ACTIVE_LIMIT = 5;
export const GITHUB_MORE_LIMIT = 6;

function weekday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).getUTCDay();
}

/**
 * GitHub's calendar is columns of weeks, Sunday at the top. The snapshot
 * stores days flat, so rebuild the columns from the first day's weekday and
 * pad the partial first and last weeks with nulls instead of shifting them.
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
  { featuredRepos = [] }: { featuredRepos?: readonly string[] } = {},
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

  const days = activity.contributions.days;
  return {
    login: activity.login,
    profileUrl: GITHUB_PROFILE_URL,
    repositoriesUrl: GITHUB_REPOSITORIES_URL,
    fetchedAt: activity.fetchedAt,
    contributions: {
      total: activity.contributions.total,
      restricted: activity.contributions.restricted,
      from: days[0]?.date ?? activity.contributions.from.slice(0, 10),
      to: days[days.length - 1]?.date ?? activity.contributions.to.slice(0, 10),
      weeks: contributionWeeks(days),
      activeDays: days.filter((day) => day.count > 0).length,
    },
    publicRepoCount: activity.publicRepoCount,
    active,
    more,
  };
}
