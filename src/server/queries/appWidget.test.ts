import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/queries/latestWorkout", () => ({
  getCachedLatestWorkout: vi.fn(),
}));

const { latestMusing } = await import("./appWidget");

describe("latestMusing", () => {
  it("picks the newest post across both date formats and absolutizes local links", () => {
    const result = latestMusing(
      [
        { title: "Old", pubDate: "2025-04-03 16:00:00", link: "https://x.com/old" },
        { title: "New", pubDate: "2026-04-06T17:43:00.000+00:00", link: "/musings/new" },
      ],
      "https://www.chappyasel.com",
    );
    expect(result).toEqual({
      title: "New",
      date: "2026-04-06T17:43:00.000Z",
      url: "https://www.chappyasel.com/musings/new",
    });
  });

  it("returns null when nothing has a readable date", () => {
    expect(latestMusing([{ title: "X", pubDate: "soon", link: "/x" }], "o")).toBeNull();
  });
});
