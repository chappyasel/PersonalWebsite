import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Mirror from "~/lib/weight-log/mirror";

import * as route from "./route";

const mocks = vi.hoisted(() => ({
  env: {
    WEIGHT_LOG_MIRROR_TOKEN: "invented-mirror-token" as string | undefined,
  },
  query: vi.fn(),
}));
vi.mock("~/env", () => ({ env: mocks.env }));
vi.mock("~/server/db", () => ({ db: { synthetic: true } }));
vi.mock("~/lib/weight-log/mirror", async (original) => ({
  ...(await original<typeof Mirror>()),
  mirrorWeighInsQuery: mocks.query,
}));

const URL_BASE = "https://www.chappyasel.com/api/weight-log/mirror";

function get(query: string, authorization?: string) {
  return new NextRequest(`${URL_BASE}?${query}`, {
    headers: authorization ? { authorization } : {},
  });
}

// Invented readings. The database mock returns rows outside the asked range
// and extra columns, so the tests show the route keeps neither.
const rows = [
  { date: "2026-10-31", pounds: 172.4, excluded: false },
  { date: "2026-11-01", pounds: 172.0, excluded: false },
  { date: "2026-11-02", pounds: 171.6, excluded: true },
  { date: "2026-11-03", pounds: 171.8, excluded: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.WEIGHT_LOG_MIRROR_TOKEN = "invented-mirror-token";
  mocks.query.mockResolvedValue(rows);
});

describe("GET /api/weight-log/mirror", () => {
  it("returns only the requested range, with date and pounds only", async () => {
    const response = await route.GET(
      get("from=2026-11-01&to=2026-11-02", "Bearer invented-mirror-token"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      weighIns: [
        { date: "2026-11-01", pounds: 172.0 },
        { date: "2026-11-02", pounds: 171.6 },
      ],
    });
    expect(mocks.query).toHaveBeenCalledWith(
      { synthetic: true },
      { from: "2026-11-01", to: "2026-11-02" },
    );
  });

  it("is never cached", async () => {
    const response = await route.GET(
      get("from=2026-11-01&to=2026-11-02", "Bearer invented-mirror-token"),
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it.each([
    ["no Authorization header", undefined],
    ["a wrong token", "Bearer invented-mirror-tokem"],
    ["the token without Bearer", "invented-mirror-token"],
    ["Basic auth", "Basic aW52ZW50ZWQ6dG9rZW4="],
  ])("rejects %s without reading the database", async (_label, auth) => {
    const response = await route.GET(
      get("from=2026-11-01&to=2026-11-02", auth),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("refuses every request while the token is unset", async () => {
    mocks.env.WEIGHT_LOG_MIRROR_TOKEN = undefined;
    for (const auth of [undefined, "Bearer ", "Bearer undefined"]) {
      const response = await route.GET(
        get("from=2026-11-01&to=2026-11-02", auth),
      );
      expect(response.status).toBe(503);
    }
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([
    ["from=2026-11-01", "from and to must be dates written YYYY-MM-DD"],
    ["from=2026-11-02&to=2026-11-01", "from must not be after to"],
    ["from=2025-01-01&to=2026-12-31", "ask for at most 366 days at a time"],
  ])("refuses a bad range %j", async (query, error) => {
    const response = await route.GET(
      get(query, "Bearer invented-mirror-token"),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe("other methods", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const)(
    "refuses %s with 405 and never reads or writes",
    (method) => {
      const response = route[method]();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );

  it("routes every exported method but GET to the same refusal", () => {
    const handlers = Object.keys(route).filter((key) => /^[A-Z]+$/.test(key));
    expect(handlers.sort()).toEqual([
      "DELETE",
      "GET",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT",
    ]);
    for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS"] as const) {
      expect(route[method]).toBe(route.POST);
    }
  });
});
