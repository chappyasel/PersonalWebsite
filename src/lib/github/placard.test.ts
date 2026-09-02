import { describe, expect, it } from "vitest";

import {
  GITHUB_ACTIVE_LIMIT,
  GITHUB_MORE_LIMIT,
  buildGitHubPlacard,
  contributionWeeks,
} from "./placard";
import { type GitHubActivity, type GitHubRepo } from "./types";

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

function activity(overrides: Partial<GitHubActivity> = {}): GitHubActivity {
  return {
    login: "chappyasel",
    fetchedAt: "2026-09-02T00:00:00Z",
    contributions: {
      from: "2025-09-02T00:00:00Z",
      to: "2026-09-02T00:00:00Z",
      total: 10,
      restricted: 4,
      days: [
        { date: "2026-08-31", count: 0, level: 0 }, // Monday
        { date: "2026-09-01", count: 3, level: 2 },
        { date: "2026-09-02", count: 1, level: 1 },
      ],
    },
    publicRepoCount: 3,
    repos: [],
    activeRepos: [],
    ...overrides,
  };
}

describe("contributionWeeks", () => {
  it("lays days out in Sunday-first columns and pads partial weeks", () => {
    const weeks = contributionWeeks(activity().contributions.days);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.map((day) => day?.date ?? null)).toEqual([
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
    const days = Array.from({ length: 10 }, (_, index) => ({
      date: `2026-09-${String(5 + index).padStart(2, "0")}`, // Sat 5 Sep
      count: index,
      level: 0 as const,
    }));
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

describe("buildGitHubPlacard", () => {
  it("counts active days and reads the mosaic range off the days", () => {
    const placard = buildGitHubPlacard(activity());
    expect(placard.contributions.activeDays).toBe(2);
    expect(placard.contributions.from).toBe("2026-08-31");
    expect(placard.contributions.to).toBe("2026-09-02");
    expect(placard.contributions.total).toBe(10);
    expect(placard.contributions.restricted).toBe(4);
    expect(placard.profileUrl).toBe("https://github.com/chappyasel");
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
      { featuredRepos: ["chappyasel/personalwebsite"] },
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
    const placard = buildGitHubPlacard(activity({ repos }));
    expect(placard.more).toHaveLength(GITHUB_MORE_LIMIT);
    expect(placard.more[0]!.name).toBe(`r${GITHUB_MORE_LIMIT + 1}`);
  });
});
