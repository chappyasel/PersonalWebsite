import { z } from "zod";

/**
 * The GitHub account the Projects placard reads. The Macintosh on the
 * Projects shelf and the contact row link to the same profile.
 */
export const GITHUB_LOGIN = "chappyasel";
export const GITHUB_PROFILE_URL = `https://github.com/${GITHUB_LOGIN}`;
export const GITHUB_REPOSITORIES_URL = `${GITHUB_PROFILE_URL}?tab=repositories`;

/** GitHub's own five-step contribution shading, NONE through FOURTH_QUARTILE. */
export const contributionLevelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export const contributionDaySchema = z.object({
  /** Calendar date in UTC, YYYY-MM-DD, as GitHub reports it. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative(),
  level: contributionLevelSchema,
});

/**
 * One public repository. Deliberately carries no `isPrivate` flag: the
 * fetcher drops private repositories before they reach this shape, so nothing
 * downstream can render one by forgetting to check.
 */
export const repoSchema = z.object({
  nameWithOwner: z.string(),
  name: z.string(),
  owner: z.string(),
  description: z.string().nullable(),
  url: z.string().url(),
  homepageUrl: z.string().nullable(),
  language: z.string().nullable(),
  pushedAt: z.string(),
  createdAt: z.string(),
  isFork: z.boolean(),
  isArchived: z.boolean(),
});

export const activeRepoSchema = repoSchema.extend({
  /** Commits Chappy made to this repository inside the contribution year. */
  commits: z.number().int().positive(),
});

export const gitHubActivitySchema = z.object({
  login: z.string(),
  fetchedAt: z.string(),
  contributions: z.object({
    /** ISO instants bounding GitHub's rolling contribution year. */
    from: z.string(),
    to: z.string(),
    /** Every contribution in the year, private work included. */
    total: z.number().int().nonnegative(),
    /** The share of `total` made in private repositories. */
    restricted: z.number().int().nonnegative(),
    /** One entry per calendar day, oldest first. */
    days: z.array(contributionDaySchema),
  }),
  /** Contributions per calendar year since the account's first, ascending.
   * The current year is a year-to-date figure. */
  years: z.array(
    z.object({
      year: z.number().int(),
      total: z.number().int().nonnegative(),
    }),
  ),
  /** Public repositories under the account, forks included. */
  publicRepoCount: z.number().int().nonnegative(),
  /** Those repositories, most recently pushed first. */
  repos: z.array(repoSchema),
  /** Public repositories, own or not, that received commits this year. */
  activeRepos: z.array(activeRepoSchema),
});

export type GitHubContributionLevel = z.infer<typeof contributionLevelSchema>;
export type GitHubContributionDay = z.infer<typeof contributionDaySchema>;
export type GitHubRepo = z.infer<typeof repoSchema>;
export type GitHubActiveRepo = z.infer<typeof activeRepoSchema>;
export type GitHubYear = GitHubActivity["years"][number];
export type GitHubActivity = z.infer<typeof gitHubActivitySchema>;
