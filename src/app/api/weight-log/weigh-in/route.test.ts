import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Records from "~/lib/weight-log/records";
import { SYNTHETIC_LOG } from "~/lib/weight-log/week-summary.fixture";
import type * as WeighIns from "~/lib/weight-log/weigh-ins";

import * as route from "./route";

const mocks = vi.hoisted(() => ({
  env: {
    WEIGHT_LOG_ENTRY_TOKEN: "invented-entry-token" as string | undefined,
  },
  save: vi.fn(),
  last: vi.fn(),
  load: vi.fn(),
  report: vi.fn(),
}));
vi.mock("~/server/errorReporting", () => ({
  reportServerErrorAfterResponse: mocks.report,
}));
vi.mock("~/env", () => ({ env: mocks.env }));
vi.mock("~/server/db", () => ({ db: { synthetic: true } }));
vi.mock("~/lib/weight-log/weigh-ins", async (original) => ({
  ...(await original<typeof WeighIns>()),
  saveWeighIn: mocks.save,
  lastCountedWeighInBefore: mocks.last,
}));
vi.mock("~/lib/weight-log/database", () => ({ loadWeekRecords: mocks.load }));
vi.mock("~/lib/weight-log/records", async (original) => ({
  ...(await original<typeof Records>()),
  buildWeightLog: () => SYNTHETIC_LOG,
}));

const URL = "https://www.chappyasel.com/api/weight-log/weigh-in";
const TOKEN = "Bearer invented-entry-token";

function post(body: unknown, authorization: string | undefined = TOKEN) {
  return new NextRequest(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function get(query: string, authorization: string | null = TOKEN) {
  return new NextRequest(`${URL}${query}`, {
    headers: authorization ? { authorization } : {},
  });
}

const NO_STORE = "private, no-store, max-age=0";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.WEIGHT_LOG_ENTRY_TOKEN = "invented-entry-token";
  mocks.save.mockResolvedValue({
    status: "saved",
    previous: null,
    excluded: false,
  });
  mocks.load.mockResolvedValue({});
  mocks.last.mockResolvedValue({ date: "2030-02-03", pounds: 100.4 });
  vi.useFakeTimers({ now: new Date("2030-02-04T15:00:00Z"), toFake: ["Date"] });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/weight-log/weigh-in", () => {
  it("saves with replace false by default and answers the outcome and the week", async () => {
    const response = await route.POST(
      post({ date: "2030-02-04", pounds: 100.9 }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "saved",
      date: "2030-02-04",
      pounds: 100.9,
      previous: null,
      title: "✓ 100.9",
      summary: "Avg 100.9 · 0.1 under target",
    });
    expect(mocks.save).toHaveBeenCalledWith(
      { synthetic: true },
      { date: "2030-02-04", pounds: 100.9, replace: false },
    );
    // The week is read after the save, so it includes the new weigh-in.
    expect(mocks.load.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.save.mock.invocationCallOrder[0]!,
    );
  });

  it.each([
    [
      "exists",
      101.4,
      {
        title: "Kept 101.4",
        question: "Today has 101.4. Replace with 100.9?",
      },
    ],
    ["replaced", 101.4, { title: "↻ 100.9, was 101.4" }],
    ["unchanged", 100.9, { title: "= 100.9" }],
  ] as const)(
    "answers %s with a 200 and the previous pounds",
    async (status, previous, extra) => {
      mocks.save.mockResolvedValue({ status, previous, excluded: false });
      const response = await route.POST(
        post({
          date: "2030-02-04",
          pounds: 100.9,
          replace: status !== "exists",
        }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ status, previous, ...extra });
      expect(body.summary).toBe("Avg 100.9 · 0.1 under target");
    },
  );

  it("asks about an excluded weigh-in by marking it excluded", async () => {
    mocks.save.mockResolvedValue({
      status: "exists",
      previous: 101.4,
      excluded: true,
    });
    const response = await route.POST(
      post({ date: "2030-02-04", pounds: 100.9 }),
    );
    expect(await response.json()).toMatchObject({
      title: "Kept 101.4 · excluded",
      question:
        "Today has 101.4, excluded. Replace with 100.9? It stays excluded.",
    });
  });

  it("names the date when it is not today in Los Angeles", async () => {
    // 05:00 UTC on Feb 5 is still Feb 4 in Los Angeles, so Feb 5 is named.
    vi.setSystemTime(new Date("2030-02-05T05:00:00Z"));
    mocks.save.mockResolvedValue({
      status: "exists",
      previous: 101.4,
      excluded: false,
    });
    const response = await route.POST(
      post({ date: "2030-02-05", pounds: 100.9 }),
    );
    expect(await response.json()).toMatchObject({
      question: "Tue, Feb 5 has 101.4. Replace with 100.9?",
    });
  });

  it("passes replace through", async () => {
    await route.POST(
      post({ date: "2030-02-04", pounds: 100.9, replace: true }),
    );
    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), {
      date: "2030-02-04",
      pounds: 100.9,
      replace: true,
    });
  });

  it("takes pounds as a number or a string, rounded to one decimal", async () => {
    await route.POST(post({ date: "2030-02-04", pounds: "100.94" }));
    await route.POST(post({ date: "2030-02-04", pounds: 100.95 }));
    const sent = mocks.save.mock.calls as [unknown, { pounds: number }][];
    expect(sent.map(([, weighIn]) => weighIn.pounds)).toEqual([100.9, 101]);
  });

  it.each([
    ["yesterday", "2030-02-03", 200],
    ["today", "2030-02-04", 200],
    ["tomorrow", "2030-02-05", 200],
    ["two days back", "2030-02-02", 400],
    ["two days ahead", "2030-02-06", 400],
  ])("treats %s (%s) as %i", async (_label, date, status) => {
    const response = await route.POST(post({ date, pounds: 100.9 }));
    expect(response.status).toBe(status);
    if (status === 400) {
      expect(await response.json()).toEqual({
        error:
          "Only today's or yesterday's weigh-in can be sent here. Use /weight-log/edit for other dates.",
      });
      expect(mocks.save).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["the day before yesterday", "2030-02-02", 400],
    ["yesterday", "2030-02-03", 200],
    ["today", "2030-02-04", 200],
    ["UTC's today", "2030-02-05", 200],
    ["UTC's tomorrow", "2030-02-06", 400],
  ])(
    "treats %s (%s) as %i at 4:30 PM in Pacific time, past UTC midnight",
    async (_label, date, status) => {
      vi.setSystemTime(new Date("2030-02-05T00:30:00Z"));
      const response = await route.POST(post({ date, pounds: 100.9 }));
      expect(response.status).toBe(status);
    },
  );

  it.each([
    ["not JSON", "date=2030-02-04"],
    ["no pounds", { date: "2030-02-04" }],
    ["zero pounds", { date: "2030-02-04", pounds: 0 }],
    ["a bad date", { date: "2030-02-30", pounds: 100 }],
  ])("refuses a body with %s", async (_label, body) => {
    const response = await route.POST(post(body));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each([
    ["no Authorization header", undefined],
    ["a wrong token", "Bearer invented-entry-tokem"],
    ["the mirror's token", "Bearer invented-mirror-token"],
  ])("answers 401 to %s without reading or writing", async (_label, auth) => {
    const response = await route.POST(
      post({ date: "2030-02-04", pounds: 100.9 }, auth ?? ""),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("answers 503 to everything while the token is unset", async () => {
    mocks.env.WEIGHT_LOG_ENTRY_TOKEN = undefined;
    for (const auth of [TOKEN, "Bearer ", "Bearer undefined"]) {
      const response = await route.POST(
        post({ date: "2030-02-04", pounds: 100.9 }, auth),
      );
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe(NO_STORE);
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("answers 500 when the save fails, and logs no weight", async () => {
    mocks.save.mockRejectedValue(
      Object.assign(new Error("Failing row contains (2030-02-04, 100.9)"), {
        code: "23514",
      }),
    );
    const response = await route.POST(
      post({ date: "2030-02-04", pounds: 100.9 }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "The weigh-in didn't save. Try again.",
    });
    expect(console.error).toHaveBeenCalledWith(
      "weigh-in route: save failed (23514)",
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "100.9",
    );
  });

  it("reports a failed save with only the step and the code", async () => {
    const failure = Object.assign(
      new Error("Failing row contains (2030-02-04, 100.9)"),
      { code: "23514" },
    );
    mocks.save.mockRejectedValue(failure);
    await route.POST(post({ date: "2030-02-04", pounds: 100.9 }));
    expect(mocks.report).toHaveBeenCalledTimes(1);
    const [reported, context] = mocks.report.mock.calls[0] as [
      Error,
      Record<string, unknown>,
    ];
    expect(reported).not.toBe(failure);
    expect(reported.message).toBe("weigh-in route: save failed (23514)");
    expect(reported.cause).toBeUndefined();
    expect(context).toEqual({
      source: "request",
      route: "/api/weight-log/weigh-in",
      label: "save",
    });
  });

  it("still reports a save when the week can't be read", async () => {
    mocks.load.mockRejectedValue(new Error("connection reset"));
    const response = await route.POST(
      post({ date: "2030-02-04", pounds: 100.9 }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "saved",
      title: "✓ 100.9",
      summary: "Week unavailable",
    });
  });

  it("sends the no-store headers on a success", async () => {
    const response = await route.POST(
      post({ date: "2030-02-04", pounds: 100.9 }),
    );
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("GET /api/weight-log/weigh-in", () => {
  it("answers the latest counted weigh-in before the phone's date", async () => {
    const response = await route.GET(get("?date=2030-02-04"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      date: "2030-02-03",
      pounds: 100.4,
    });
    expect(mocks.last).toHaveBeenCalledWith({ synthetic: true }, "2030-02-04");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("answers nulls when the log has no weigh-in before the date", async () => {
    mocks.last.mockResolvedValue(null);
    const response = await route.GET(get("?date=2030-02-04"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ date: null, pounds: null });
  });

  it("reads yesterday too, at the window's other end", async () => {
    await route.GET(get("?date=2030-02-03"));
    expect(mocks.last).toHaveBeenCalledWith({ synthetic: true }, "2030-02-03");
  });

  it.each([
    ["", "date must be a date written YYYY-MM-DD"],
    ["?date=Feb%204", "date must be a date written YYYY-MM-DD"],
    ["?date=2030-02-31", "date must be a date written YYYY-MM-DD"],
    [
      "?date=2030-01-20",
      "Only the weigh-in before today or yesterday can be read here. Use /weight-log/edit for other dates.",
    ],
    [
      "?date=2030-02-06",
      "Only the weigh-in before today or yesterday can be read here. Use /weight-log/edit for other dates.",
    ],
  ])("refuses %j with 400 before reading", async (query, error) => {
    const response = await route.GET(get(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
    expect(mocks.last).not.toHaveBeenCalled();
  });

  it.each([
    ["no token", null],
    ["a wrong token", "Bearer invented-entry-tokenx"],
  ])("refuses %s with 401 before reading", async (_label, auth) => {
    const response = await route.GET(get("?date=2030-02-04", auth));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(mocks.last).not.toHaveBeenCalled();
  });

  it("answers 503 while the token is unset", async () => {
    mocks.env.WEIGHT_LOG_ENTRY_TOKEN = undefined;
    const response = await route.GET(get("?date=2030-02-04"));
    expect(response.status).toBe(503);
    expect(mocks.last).not.toHaveBeenCalled();
  });

  it("answers 500 when the read fails, and logs only the step and code", async () => {
    mocks.last.mockRejectedValue(
      Object.assign(new Error("row (2030-02-03, 100.4)"), { code: "57P01" }),
    );
    const response = await route.GET(get("?date=2030-02-04"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "The last weigh-in could not be read.",
    });
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
    expect(console.error).toHaveBeenCalledWith(
      "weigh-in route: last failed (57P01)",
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "100.4",
    );
  });
});

describe("other methods", () => {
  it.each(["PUT", "PATCH", "DELETE", "OPTIONS"] as const)(
    "refuses %s with 405 and never reads or writes",
    (method) => {
      const response = route[method]();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD, POST");
      expect(response.headers.get("cache-control")).toBe(NO_STORE);
      expect(mocks.save).not.toHaveBeenCalled();
      expect(mocks.last).not.toHaveBeenCalled();
    },
  );
});
