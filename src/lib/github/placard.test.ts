import { describe, expect, it } from "vitest";

import {
  GITHUB_REPOS_LIMIT,
  buildGitHubPlacard,
  contributionWeeks,
  longestStreak,
  monthLabelColumns,
  yearBars,
} from "./placard";
import {
  type GitHubActivity,
  type GitHubContributionDay,
  type GitHubRepo,
} from "./types";

const NOW = new Date("2026-07-02T00:00:00Z"); // day 183 of 365

function repo(overrides: Partial<GitHubRepo> & { name: string }): GitHubRepo {
  const owner = overrides.owner ?? "chappyasel";
  return {
    nameWithOwner: `${owner}/${overrides.name}`,
    owner,
    description: "A description",
    url: `https://github.com/${owner}/${overrides.name}`,
    homepageUrl: null,
    language: "TypeScript",
    pushedAt: "2026-01-01T00:00:00Z",
    createdAt: "2025-01-01T00:00:00Z",
    isFork: false,
    isArchived: false,
    ...overrides,
  };
}

function day(date: string, count: number): GitHubContributionDay {
  return { date, count, level: count === 0 ? 0 : 2 };
}

function activity(overrides: Partial<GitHubActivity> = {}): GitHubActivity {
  return {
    login: "chappyasel",
    fetchedAt: "2026-07-02T00:00:00Z",
    contributions: {
      from: "2025-07-02T00:00:00Z",
      to: "2026-07-02T00:00:00Z",
      total: 10,
      restricted: 4,
      days: [
        day("2026-06-30", 0),
        day("2026-07-01", 3),
        day("2026-07-02", 1),
      ],
    },
    years: [
      { year: 2024, total: 100 },
      { year: 2026, total: 500 },
    ],
    publicRepoCount: 3,
    repos: [],
    activeRepos: [],
    ...overrides,
  };
}

describe("contributionWeeks", () => {
  it("lays days out in Sunday-first columns and pads partial weeks", () => {
    const weeks = contributionWeeks([
      day("2026-08-31", 0), // Monday
      day("2026-09-01", 3),
      day("2026-09-02", 1),
    ]);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.map((entry) => entry?.date ?? null)).toEqual([
      null,
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      null,
      null,
      null,
    ]);
  });

  it("starts a new column at each Sunday", () => {
    const days = Array.from({ length: 10 }, (_, index) =>
      day(`2026-09-${String(5 + index).padStart(2, "0")}`, index), // Sat 5 Sep
    );
    const weeks = contributionWeeks(days);
    expect(weeks).toHaveLength(3);
    expect(weeks[0]![6]?.date).toBe("2026-09-05");
    expect(weeks[1]![0]?.date).toBe("2026-09-06");
    expect(weeks[2]![1]?.date).toBe("2026-09-14");
    expect(weeks[2]![2]).toBeNull();
  });

  it("returns no columns for no days", () => {
    expect(contributionWeeks([])).toEqual([]);
  });
});

describe("monthLabelColumns", () => {
  it("labels the first column of each new month and drops crowded ones", () => {
    // Sun 2026-08-30 through Sat 2026-10-10: six columns.
    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 7, 30 + index));
      return day(date.toISOString().slice(0, 10), 1);
    });
    const weeks = contributionWeeks(days);
    // Column 1 starts Sep 6 (new month vs Aug 30); column 5 starts Oct 4.
    expect(monthLabelColumns(weeks)).toEqual([
      { column: 1, month: 9 },
      { column: 5, month: 10 },
    ]);
    // With a wide minimum gap the September label yields to October's.
    expect(monthLabelColumns(weeks, 5)).toEqual([{ column: 5, month: 10 }]);
  });
});

describe("longestStreak", () => {
  it("counts the longest run of days with any contribution", () => {
    expect(
      longestStreak([
        day("2026-01-01", 1),
        day("2026-01-02", 2),
        day("2026-01-03", 0),
        day("2026-01-04", 1),
        day("2026-01-05", 1),
        day("2026-01-06", 1),
      ]),
    ).toBe(3);
    expect(longestStreak([])).toBe(0);
  });
});

describe("yearBars", () => {
  it("fills missing years with zero and projects only the current year", () => {
    const bars = yearBars(
      [
        { year: 2024, total: 100 },
        { year: 2026, total: 500 },
      ],
      NOW,
    );
    expect(bars.map((bar) => [bar.year, bar.value])).toEqual([
      [2024, 100],
      [2025, 0],
      [2026, 500],
    ]);
    expect(bars[0]!.projectedRemainder).toBe(0);
    expect(bars[1]!.projectedRemainder).toBe(0);
    // 183 of 365 days elapsed: 500 * (182 / 183) remains at this pace.
    expect(bars[2]!.projectedRemainder).toBeCloseTo(500 * (182 / 183), 6);
  });

  it("starts at the current year when there is no history", () => {
    expect(yearBars([], NOW)).toEqual([
      { year: 2026, value: 0, projectedRemainder: 0 },
    ]);
  });
});

describe("buildGitHubPlacard", () => {
  it("derives the last-year figures and the all-time total", () => {
    const placard = buildGitHubPlacard(activity(), { now: NOW });
    expect(placard.lastYear.total).toBe(10);
    expect(placard.lastYear.restricted).toBe(4);
    expect(placard.lastYear.privateShare).toBe(40);
    expect(placard.lastYear.activeDays).toBe(2);
    expect(placard.lastYear.longestStreak).toBe(2);
    expect(placard.lastYear.from).toBe("2026-06-30");
    expect(placard.lastYear.to).toBe("2026-07-02");
    expect(placard.allTime).toBe(600);
    expect(placard.since).toBe(2024);
    expect(placard.profileUrl).toBe("https://github.com/chappyasel");
  });

  it("hands the whole returned year to the calendar", () => {
    const days = Array.from({ length: 371 }, (_, index) =>
      day(`d${index}`, index % 3),
    );
    const placard = buildGitHubPlacard(
      activity({
        contributions: { ...activity().contributions, days },
      }),
      { now: NOW },
    );
    expect(placard.lastYear.days).toHaveLength(371);
    expect(placard.lastYear.activeDays).toBe(247);
  });

  it("lists own and organization repositories together by last push", () => {
    const placard = buildGitHubPlacard(
      activity({
        repos: [
          repo({ name: "older", pushedAt: "2024-01-01T00:00:00Z" }),
          repo({ name: "newest", pushedAt: "2026-06-01T00:00:00Z" }),
        ],
        activeRepos: [
          {
            ...repo({
              name: "lattice",
              owner: "caikdev",
              pushedAt: "2026-03-01T00:00:00Z",
            }),
            commits: 90,
          },
          // Already in `repos`; must not appear twice.
          { ...repo({ name: "newest", pushedAt: "2026-06-01T00:00:00Z" }), commits: 5 },
        ],
      }),
      { now: NOW },
    );
    expect(placard.repos.map((r) => r.nameWithOwner)).toEqual([
      "chappyasel/newest",
      "caikdev/lattice",
      "chappyasel/older",
    ]);
    expect(placard.repos[1]!.organization).toBe("caikdev");
    expect(placard.repos[0]!.organization).toBeNull();
    expect(placard.repos[0]).not.toHaveProperty("commits");
  });

  it("leaves out featured, forked, archived, and undescribed repositories", () => {
    const placard = buildGitHubPlacard(
      activity({
        repos: [
          repo({ name: "PersonalWebsite" }),
          repo({ name: "fork", isFork: true }),
          repo({ name: "archived", isArchived: true }),
          repo({ name: "blank", description: null }),
          repo({ name: "kept" }),
        ],
      }),
      { featuredRepos: ["chappyasel/personalwebsite"], now: NOW },
    );
    expect(placard.repos.map((r) => r.name)).toEqual(["kept"]);
  });

  it("caps the list", () => {
    const repos = Array.from({ length: GITHUB_REPOS_LIMIT + 2 }, (_, index) =>
      repo({
        name: `r${index}`,
        pushedAt: `2020-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      }),
    );
    const placard = buildGitHubPlacard(activity({ repos }), { now: NOW });
    expect(placard.repos).toHaveLength(GITHUB_REPOS_LIMIT);
    expect(placard.repos[0]!.name).toBe(`r${GITHUB_REPOS_LIMIT + 1}`);
  });
});
