import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { devBaseUrl, devSubdomainUrl, formatRelativeTime, getTimeAgo } from "./util";

const NOW = new Date("2026-09-17T12:00:00.000Z");

const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000);
const daysAgo = (days: number) => minutesAgo(days * 24 * 60);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("getTimeAgo", () => {
  it("collapses future and same-day dates to today", () => {
    expect(getTimeAgo(NOW.toISOString())).toBe("today");
    expect(getTimeAgo(minutesAgo(23 * 60).toISOString())).toBe("today");
    expect(getTimeAgo(daysAgo(-3).toISOString())).toBe("today");
  });

  it("pluralizes days, months, and years at their boundaries", () => {
    expect(getTimeAgo(daysAgo(1).toISOString())).toBe("1 day ago");
    expect(getTimeAgo(daysAgo(29).toISOString())).toBe("29 days ago");
    expect(getTimeAgo(daysAgo(30).toISOString())).toBe("1 month ago");
    expect(getTimeAgo(daysAgo(364).toISOString())).toBe("12 months ago");
    expect(getTimeAgo(daysAgo(365).toISOString())).toBe("1 year ago");
    expect(getTimeAgo(daysAgo(730).toISOString())).toBe("2 years ago");
  });
});

describe("formatRelativeTime", () => {
  it("steps through minute, hour, day, and year units", () => {
    expect(formatRelativeTime(NOW)).toBe("just now");
    expect(formatRelativeTime(minutesAgo(0.5))).toBe("just now");
    expect(formatRelativeTime(minutesAgo(42))).toBe("42m ago");
    expect(formatRelativeTime(minutesAgo(60))).toBe("1h ago");
    expect(formatRelativeTime(minutesAgo(23 * 60 + 59))).toBe("23h ago");
    expect(formatRelativeTime(daysAgo(1))).toBe("1d ago");
    expect(formatRelativeTime(daysAgo(364))).toBe("364d ago");
    expect(formatRelativeTime(daysAgo(365))).toBe("1y ago");
  });

  it("accepts ISO strings as well as Date instances", () => {
    expect(formatRelativeTime(minutesAgo(3 * 60).toISOString())).toBe(
      "3h ago",
    );
  });
});

describe("dev URL helpers", () => {
  it("default to port 3000 when PORT is unset on the server", () => {
    vi.stubEnv("PORT", undefined);
    expect(devBaseUrl()).toBe("http://localhost:3000");
    expect(devSubdomainUrl("books")).toBe("http://books.localhost:3000");
  });

  it("honor PORT on the server", () => {
    vi.stubEnv("PORT", "3001");
    expect(devBaseUrl()).toBe("http://localhost:3001");
    expect(devSubdomainUrl("books")).toBe("http://books.localhost:3001");
  });
});
