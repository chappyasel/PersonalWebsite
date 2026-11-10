import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SYNTHETIC_LOG } from "~/lib/weight-log/week-summary.fixture";
import type * as WeighIns from "~/lib/weight-log/weigh-ins";

import * as route from "./route";

const mocks = vi.hoisted(() => ({
  env: {
    WEIGHT_LOG_ENTRY_TOKEN: "invented-entry-token" as string | undefined,
  },
  save: vi.fn(),
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
}));
vi.mock("~/lib/weight-log/database", () => ({ loadWeekRecords: mocks.load }));
vi.mock("~/lib/weight-log/records", () => ({
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
      summary:
        "100.9 saved. Week avg 100.9 (1 of 7), target 101.0, 0.1 under. Last week 100.6.",
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
      { question: "Mon, Feb 4 already has 101.4. Replace it with 100.9?" },
    ],
    ["replaced", 101.4, {}],
    ["unchanged", 100.9, {}],
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
      expect(body.summary).toContain("Week avg 100.9");
    },
  );

  it("asks about an excluded weigh-in by saying it is left out", async () => {
    mocks.save.mockResolvedValue({
      status: "exists",
      previous: 101.4,
      excluded: true,
    });
    const response = await route.POST(
      post({ date: "2030-02-04", pounds: 100.9 }),
    );
    expect(await response.json()).toMatchObject({
      question:
        "Mon, Feb 4 already has 101.4, which is left out of the weekly average. Replace it with 100.9? The new value stays left out.",
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
      summary: "100.9 saved.",
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

describe("other methods", () => {
  it.each(["GET", "PUT", "PATCH", "DELETE", "OPTIONS"] as const)(
    "refuses %s with 405 and never reads or writes",
    (method) => {
      const response = route[method]();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(response.headers.get("cache-control")).toBe(NO_STORE);
      expect(mocks.save).not.toHaveBeenCalled();
    },
  );
});
