import { describe, expect, it } from "vitest";

import {
  GITHUB_ACTIVE_LIMIT,
  GITHUB_MORE_LIMIT,
  GITHUB_MOSAIC_DAYS,
  buildGitHubPlacard,
  longestStreak,
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

  it("keeps only the trailing mosaic window of days", () => {
    const days = Array.from({ length: GITHUB_MOSAIC_DAYS + 5 }, (_, index) =>
      day(`d${index}`, index),
    );
    const placard = buildGitHubPlacard(
      activity({
        contributions: { ...activity().contributions, days },
      }),
      { now: NOW },
    );
    expect(placard.lastYear.days).toHaveLength(GITHUB_MOSAIC_DAYS);
    expect(placard.lastYear.days[0]!.date).toBe("d5");
    // Active days and the streak still read the whole year GitHub returned.
    expect(placard.lastYear.activeDays).toBe(GITHUB_MOSAIC_DAYS + 4);
  });

  it("orders the active list by commits, marks organization owners, and caps it", () => {
    const placard = buildGitHubPlacard(
      activity({
        activeRepos: [
          { ...repo({ name: "site" }), commits: 40 },
          { ...repo({ name: "lattice", owner: "caikdev" }), commits: 90 },
          { ...repo({ name: "a" }), commits: 1 },
          { ...repo({ name: "b" }), commits: 2 },
          { ...repo({ name: "c" }), commits: 3 },
          { ...repo({ name: "d" }), commits: 4 },
        ],
      }),
      { now: NOW },
    );
    expect(placard.active).toHaveLength(GITHUB_ACTIVE_LIMIT);
    expect(placard.active.map((r) => r.name)).toEqual([
      "lattice",
      "site",
      "d",
      "c",
      "b",
    ]);
    expect(placard.active[0]!.organization).toBe("caikdev");
    expect(placard.active[1]!.organization).toBeNull();
    expect(placard.active[0]!.commits).toBe(90);
  });

  it("keeps featured repositories on the active list but off the more list", () => {
    const placard = buildGitHubPlacard(
      activity({
        repos: [repo({ name: "PersonalWebsite" }), repo({ name: "old" })],
        activeRepos: [{ ...repo({ name: "PersonalWebsite" }), commits: 5 }],
      }),
      { featuredRepos: ["chappyasel/personalwebsite"], now: NOW },
    );
    expect(placard.active.map((r) => r.name)).toEqual(["PersonalWebsite"]);
    expect(placard.more.map((r) => r.name)).toEqual(["old"]);
  });

  it("drops forks, archived, undescribed, and already-active repositories from more", () => {
    const placard = buildGitHubPlacard(
      activity({
        repos: [
          repo({ name: "fork", isFork: true }),
          repo({ name: "archived", isArchived: true }),
          repo({ name: "blank", description: null }),
          repo({ name: "active" }),
          repo({ name: "kept" }),
        ],
        activeRepos: [{ ...repo({ name: "active" }), commits: 2 }],
      }),
      { now: NOW },
    );
    expect(placard.more.map((r) => r.name)).toEqual(["kept"]);
    expect(placard.more[0]).not.toHaveProperty("commits");
  });

  it("orders more by last push and caps it", () => {
    const repos = Array.from({ length: GITHUB_MORE_LIMIT + 2 }, (_, index) =>
      repo({
        name: `r${index}`,
        pushedAt: `2020-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      }),
    );
    const placard = buildGitHubPlacard(activity({ repos }), { now: NOW });
    expect(placard.more).toHaveLength(GITHUB_MORE_LIMIT);
    expect(placard.more[0]!.name).toBe(`r${GITHUB_MORE_LIMIT + 1}`);
  });
});
