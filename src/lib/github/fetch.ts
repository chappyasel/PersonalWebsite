import { z } from "zod";

import {
  type GitHubActiveRepo,
  type GitHubActivity,
  type GitHubContributionLevel,
  type GitHubRepo,
  gitHubActivitySchema,
} from "./types";

const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

/**
 * One request covers everything the placard shows. The contribution calendar
 * is only available through GraphQL, which is why a token is required at all:
 * the REST API would list the repositories anonymously but has no calendar.
 *
 * With the owner's own token, `totalContributions` and
 * `restrictedContributionsCount` include private work and
 * `commitContributionsByRepository` lists private repositories. Any other
 * token sees public activity only. Either way every repository is filtered
 * on `isPrivate` below before it is kept.
 */
const ACTIVITY_QUERY = /* GraphQL */ `
  query GitHubActivity($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionYears
        startedAt
        endedAt
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              contributionLevel
            }
          }
        }
        commitContributionsByRepository(maxRepositories: 25) {
          repository {
            ...RepoFields
          }
          contributions {
            totalCount
          }
        }
      }
      repositories(
        first: 100
        ownerAffiliations: OWNER
        privacy: PUBLIC
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        totalCount
        nodes {
          ...RepoFields
        }
      }
    }
  }
  fragment RepoFields on Repository {
    nameWithOwner
    name
    owner {
      login
    }
    description
    url
    homepageUrl
    primaryLanguage {
      name
      color
    }
    pushedAt
    createdAt
    isFork
    isArchived
    isPrivate
    defaultBranchRef {
      target {
        ... on Commit {
          history(first: 1) {
            nodes {
              messageHeadline
              committedDate
            }
          }
        }
      }
    }
  }
`;

const rawRepoSchema = z.object({
  nameWithOwner: z.string(),
  name: z.string(),
  owner: z.object({ login: z.string() }),
  description: z.string().nullable(),
  url: z.string().url(),
  homepageUrl: z.string().nullable(),
  primaryLanguage: z
    .object({ name: z.string(), color: z.string().nullable() })
    .nullable(),
  pushedAt: z.string(),
  createdAt: z.string(),
  isFork: z.boolean(),
  isArchived: z.boolean(),
  isPrivate: z.boolean(),
  // The inline fragment leaves `history` out when the ref points at
  // something other than a commit, and the ref itself is null for an empty
  // repository.
  defaultBranchRef: z
    .object({
      target: z
        .object({
          history: z
            .object({
              nodes: z.array(
                z.object({
                  messageHeadline: z.string(),
                  committedDate: z.string(),
                }),
              ),
            })
            .optional(),
        })
        .nullable(),
    })
    .nullable(),
});

const rawResponseSchema = z.object({
  data: z.object({
    user: z.object({
      contributionsCollection: z.object({
        contributionYears: z.array(z.number().int()),
        startedAt: z.string(),
        endedAt: z.string(),
        restrictedContributionsCount: z.number().int(),
        contributionCalendar: z.object({
          totalContributions: z.number().int(),
          weeks: z.array(
            z.object({
              contributionDays: z.array(
                z.object({
                  date: z.string(),
                  contributionCount: z.number().int(),
                  contributionLevel: z.enum([
                    "NONE",
                    "FIRST_QUARTILE",
                    "SECOND_QUARTILE",
                    "THIRD_QUARTILE",
                    "FOURTH_QUARTILE",
                  ]),
                }),
              ),
            }),
          ),
        }),
        commitContributionsByRepository: z.array(
          z.object({
            repository: rawRepoSchema,
            contributions: z.object({ totalCount: z.number().int() }),
          }),
        ),
      }),
      repositories: z.object({
        totalCount: z.number().int(),
        nodes: z.array(rawRepoSchema),
      }),
    }),
  }),
});

type RawRepo = z.infer<typeof rawRepoSchema>;

/**
 * GitHub caps a contributionsCollection at one year, so the per-year totals
 * behind the year bars are one aliased collection per calendar year, in a
 * second request once the first has said which years exist.
 */
function yearsQuery(years: readonly number[]) {
  const fields = years
    .map(
      (year) =>
        `y${year}: contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z") { contributionCalendar { totalContributions } }`,
    )
    .join("\n");
  return `query GitHubYears($login: String!) { user(login: $login) { ${fields} } }`;
}

const rawYearsSchema = z.object({
  data: z.object({
    user: z.record(
      z.string(),
      z.object({
        contributionCalendar: z.object({ totalContributions: z.number().int() }),
      }),
    ),
  }),
});

async function graphql(token: string, query: string, login: string) {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "chappyasel.com projects placard",
    },
    body: JSON.stringify({ query, variables: { login } }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`GitHub GraphQL responded ${response.status}`);
  }
  const body: unknown = await response.json();
  const errors = (body as { errors?: { message: string }[] }).errors;
  if (errors?.length) {
    throw new Error(
      `GitHub GraphQL: ${errors.map((e) => e.message).join("; ")}`,
    );
  }
  return body;
}

const LEVELS: Record<string, GitHubContributionLevel> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

/** GitHub returns "" for a cleared description; the placard treats that as
 * no description, the same as null. */
function text(value: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function lastCommit(raw: RawRepo) {
  const commit = raw.defaultBranchRef?.target?.history?.nodes[0];
  return commit
    ? { headline: commit.messageHeadline, date: commit.committedDate }
    : null;
}

function publicRepo(raw: RawRepo): GitHubRepo | null {
  if (raw.isPrivate) return null;
  return {
    nameWithOwner: raw.nameWithOwner,
    name: raw.name,
    owner: raw.owner.login,
    description: text(raw.description),
    url: raw.url,
    homepageUrl: text(raw.homepageUrl),
    language: raw.primaryLanguage?.name ?? null,
    languageColor: raw.primaryLanguage?.color ?? null,
    pushedAt: raw.pushedAt,
    createdAt: raw.createdAt,
    isFork: raw.isFork,
    isArchived: raw.isArchived,
    lastCommit: lastCommit(raw),
  };
}

function publicRepos(raws: readonly RawRepo[]) {
  return raws
    .map(publicRepo)
    .filter((repo): repo is GitHubRepo => repo !== null);
}

export async function fetchGitHubActivity({
  token,
  login,
  now = new Date(),
}: {
  token: string;
  login: string;
  now?: Date;
}): Promise<GitHubActivity> {
  const { user } = rawResponseSchema.parse(
    await graphql(token, ACTIVITY_QUERY, login),
  ).data;
  const calendar = user.contributionsCollection.contributionCalendar;

  const yearList = [...user.contributionsCollection.contributionYears].sort(
    (a, b) => a - b,
  );
  const yearTotals = rawYearsSchema.parse(
    await graphql(token, yearsQuery(yearList), login),
  ).data.user;
  const years = yearList.map((year) => ({
    year,
    total: yearTotals[`y${year}`]?.contributionCalendar.totalContributions ?? 0,
  }));

  const activeRepos: GitHubActiveRepo[] = [];
  for (const entry of user.contributionsCollection
    .commitContributionsByRepository) {
    const repo = publicRepo(entry.repository);
    if (!repo || entry.contributions.totalCount <= 0) continue;
    activeRepos.push({ ...repo, commits: entry.contributions.totalCount });
  }
  activeRepos.sort(
    (a, b) => b.commits - a.commits || a.nameWithOwner.localeCompare(b.nameWithOwner),
  );

  return gitHubActivitySchema.parse({
    login,
    fetchedAt: now.toISOString(),
    contributions: {
      from: user.contributionsCollection.startedAt,
      to: user.contributionsCollection.endedAt,
      total: calendar.totalContributions,
      restricted: user.contributionsCollection.restrictedContributionsCount,
      days: calendar.weeks.flatMap((week) =>
        week.contributionDays.map((day) => ({
          date: day.date,
          count: day.contributionCount,
          level: LEVELS[day.contributionLevel] ?? 0,
        })),
      ),
    },
    years,
    publicRepoCount: user.repositories.totalCount,
    repos: publicRepos(user.repositories.nodes),
    activeRepos,
  });
}
