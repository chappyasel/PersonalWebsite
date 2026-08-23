import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { dadAccessToken } from "~/lib/dad/access";

import { GET } from "./route";

const { searchBooks, searchDadIndex, searchWeightliftingExercises } =
  vi.hoisted(() => ({
    searchBooks: vi.fn(async () => []),
    searchDadIndex: vi.fn(async (): Promise<unknown[]> => []),
    searchWeightliftingExercises: vi.fn(async () => []),
  }));

vi.mock("~/env", () => ({
  env: { DAD_CONTENT_PASSWORD: "correct-password" },
}));
vi.mock("~/lib/universal-search/server/books", () => ({ searchBooks }));
vi.mock("~/lib/universal-search/server/dad-index", () => ({ searchDadIndex }));
vi.mock("~/lib/universal-search/server/weightlifting", () => ({
  searchWeightliftingExercises,
}));

describe("GET /api/search", () => {
  beforeEach(() => {
    searchBooks.mockClear();
    searchDadIndex.mockReset();
    searchDadIndex.mockResolvedValue([]);
    searchWeightliftingExercises.mockClear();
  });

  it("runs public providers and leaves Dad skipped without access", async () => {
    searchDadIndex.mockResolvedValueOnce([
      {
        id: "dad:secret",
        kind: "content",
        group: "dad",
        label: "Protected fixture",
        href: "https://www.chappyasel.com/dad/secret",
        excerpt: "protected fixture text",
        matchKind: "body",
        score: 400,
      },
    ]);
    const response = await GET(
      new NextRequest("https://www.chappyasel.com/api/search?q=bench"),
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(searchBooks).toHaveBeenCalledOnce();
    expect(searchWeightliftingExercises).toHaveBeenCalledOnce();
    expect(searchDadIndex).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      groups: { dad: { status: "skipped", results: [] } },
    });
    expect(JSON.stringify(body)).not.toContain("protected fixture");
  });

  it("runs Dad search only for a valid signed cookie", async () => {
    const response = await GET(
      new NextRequest("https://books.chappyasel.com/api/search?q=journal", {
        headers: {
          cookie: `dad-access=${dadAccessToken("correct-password")}`,
        },
      }),
    );
    const body: unknown = await response.json();

    expect(body).toMatchObject({
      groups: { dad: { status: "success", results: [] } },
    });
    expect(searchDadIndex).toHaveBeenCalledOnce();
    expect(response.headers.get("vary")).toBe("Cookie");
  });
});
