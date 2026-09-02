import { describe, expect, it } from "vitest";

import {
  GITHUB_CALENDAR_WEEKS,
  buildGitHubPlacard,
  contributionDayUrl,
  contributionWeeks,
  longestStreak,
  monthLabelColumns,
  recentWeeks,
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
    languageColor: "#3178c6",
    pushedAt: "2026-01-01T00:00:00Z",
    createdAt: "2025-01-01T00:00:00Z",
    isFork: false,
    isArchived: false,
    lastCommit: { headline: "Initial commit", date: "2026-01-01T00:00:00Z" },
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

/** `count` consecutive days starting at `start` (UTC), all contributed to. */
function consecutiveDays(start: string, count: number) {
  const [year, month, dayOfMonth] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year!, month! - 1, dayOfMonth! + index));
    return day(date.toISOString().slice(0, 10), 1);
  });
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

describe("recentWeeks", () => {
  it("keeps the newest columns, the partial current week included", () => {
    // Sun 2025-08-31 through Wed 2026-09-02: 53 columns, the last partial,
    // exactly GitHub's own graph.
    const days = consecutiveDays("2025-08-31", 368);
    const weeks = recentWeeks(days);
    expect(weeks).toHaveLength(GITHUB_CALENDAR_WEEKS);
    expect(weeks.at(-1)![3]?.date).toBe("2026-09-02");
    expect(weeks.at(-1)![4]).toBeNull();
    expect(weeks[0]![0]?.date).toBe("2025-08-31");
    // Starting mid-week adds a 54th, partial column at the old end; it goes.
    expect(recentWeeks(consecutiveDays("2025-08-27", 372))[0]![0]?.date).toBe(
      "2025-08-31",
    );
  });

  it("hands back everything when there is less than the window", () => {
    expect(recentWeeks(consecutiveDays("2026-08-30", 14))).toHaveLength(2);
  });
});

describe("contributionDayUrl", () => {
  it("filters the profile overview to the one day", () => {
    expect(contributionDayUrl("chappyasel", "2026-07-24")).toBe(
      "https://github.com/chappyasel?tab=overview&from=2026-07-24&to=2026-07-24",
    );
  });
});

describe("monthLabelColumns", () => {
  it("labels the first column of each new month and drops crowded ones", () => {
    // Sun 2026-08-30 through Sat 2026-10-10: six columns.
    const weeks = contributionWeeks(consecutiveDays("2026-08-30", 42));
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
    expect(placard.repos[0]!.languageColor).toBe("#3178c6");
    expect(placard.repos[0]!.lastCommit?.headline).toBe("Initial commit");
  });

  it("keeps forks, archived, undescribed, and carded repositories, flagging forks", () => {
    const placard = buildGitHubPlacard(
      activity({
        repos: [
          repo({ name: "PersonalWebsite" }),
          repo({ name: "fork", isFork: true }),
          repo({ name: "archived", isArchived: true }),
          repo({ name: "blank", description: null }),
        ],
      }),
      { now: NOW },
    );
    // Same push instant throughout, so the order is the tab's own.
    expect(placard.repos.map((r) => r.name)).toEqual([
      "PersonalWebsite",
      "fork",
      "archived",
      "blank",
    ]);
    expect(placard.repos.map((r) => r.isFork)).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });
});
