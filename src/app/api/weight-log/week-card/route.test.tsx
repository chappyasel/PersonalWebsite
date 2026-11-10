import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WeightLog } from "~/lib/weight-log/schema";
import { currentRow, weekCard } from "~/lib/weight-log/week-card";
import {
  SYNTHETIC_LOG,
  loggedThrough,
} from "~/lib/weight-log/week-summary.fixture";

import { CARD_COLUMNS, cardSize } from "./WeekCard";
import * as route from "./route";

/**
 * The card through the real renderer. Satori throws on a style whose value
 * is undefined, and it throws while the body streams, after the route has
 * returned; that took every book OG card down as a 500 once. Each case here
 * leaves a different set of optional values empty, so a style that goes
 * undefined fails here first. Every number is invented.
 */

const mocks = vi.hoisted(() => ({
  env: {
    WEIGHT_LOG_ENTRY_TOKEN: "invented-entry-token" as string | undefined,
  },
  load: vi.fn(),
  build: vi.fn(),
  report: vi.fn(),
}));
vi.mock("~/server/errorReporting", () => ({
  reportServerErrorAfterResponse: mocks.report,
}));
vi.mock("~/env", () => ({ env: mocks.env }));
vi.mock("~/server/db", () => ({ db: { synthetic: true } }));
vi.mock("~/lib/weight-log/database", () => ({ loadWeekRecords: mocks.load }));
vi.mock("~/lib/weight-log/records", () => ({
  buildWeightLog: mocks.build,
}));

const URL = "https://www.chappyasel.com/api/weight-log/week-card";
const TOKEN = "Bearer invented-entry-token";
const NO_STORE = "private, no-store, max-age=0";

function get(date: string | null, authorization: string | undefined = TOKEN) {
  return new NextRequest(date === null ? URL : `${URL}?date=${date}`, {
    headers: authorization ? { authorization } : {},
  });
}

/** How many pixels have exactly this color. */
async function pixelsOf(png: Buffer, hex: string) {
  const { data, info } = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [r, g, b] = [1, 3, 5].map((at) =>
    Number.parseInt(hex.slice(at, at + 2), 16),
  );
  let count = 0;
  for (let at = 0; at < info.width * info.height * 3; at += 3) {
    if (data[at] === r && data[at + 1] === g && data[at + 2] === b) count++;
  }
  return count;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.WEIGHT_LOG_ENTRY_TOKEN = "invented-entry-token";
  // Phase 2 is still running, so it holds weeks past its plan.
  mocks.load.mockResolvedValue({
    phases: [
      { id: 1, endDate: "2030-01-20" },
      { id: 2, endDate: null },
    ],
  });
  mocks.build.mockReturnValue(SYNTHETIC_LOG);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(console.error).mockRestore();
});

const at = (date: string) =>
  vi.useFakeTimers({ now: new Date(`${date}T15:00:00Z`), toFake: ["Date"] });

/** Phase 3 of `loggedThrough`'s log is running. */
const THREE_PHASES = {
  phases: [
    { id: 1, endDate: "2030-04-28" },
    { id: 2, endDate: "2030-07-21" },
    { id: 3, endDate: null },
  ],
};

describe("GET /api/weight-log/week-card", () => {
  it.each<[string, string, WeightLog | null]>([
    ["an empty week", "2030-02-26", null],
    ["one weigh-in", "2030-02-04", null],
    ["a full week", "2030-01-13", null],
    ["an excluded day", "2030-01-31", null],
    ["a week with no target", "2030-02-19", null],
    ["a planned week with no weigh-ins", "2030-02-12", null],
    ["a window across a phase start", "2030-01-22", null],
    ["the log's first week, with no week before it", "2030-01-08", null],
    ["an empty week after the plan's end", "2030-03-05", null],
    [
      "eleven weeks of one phase, with an excluded day",
      "2030-06-12",
      loggedThrough("2030-06-12"),
    ],
    [
      "the next phase's planned weeks",
      "2030-07-10",
      loggedThrough("2030-07-10"),
    ],
  ])(
    "renders %s as a PNG with each cell's color",
    async (_label, date, log) => {
      at(date);
      if (log) {
        mocks.load.mockResolvedValue(THREE_PHASES);
        mocks.build.mockReturnValue(log);
      }
      const response = await route.GET(get(date));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("cache-control")).toBe(NO_STORE);
      expect(response.headers.get("x-robots-tag")).toBe(
        "noindex, nofollow, noarchive",
      );
      const png = Buffer.from(await response.arrayBuffer());
      const meta = await sharp(png).metadata();
      const card = weekCard(log ?? SYNTHETIC_LOG, date, log ? "3" : "2");
      const size = cardSize(card);
      expect([meta.width, meta.height]).toEqual([size.width, size.height]);
      expect(meta.width).toBe(720);

      // Every filled cell the card shows is drawn in its scale color: this
      // week's days and each row's summary. Today has its red ring. The
      // smallest cell is 95 by 52 device pixels, less its text.
      const fills = [
        ...currentRow(card).colors.days,
        ...card.rows.flatMap(({ colors }) =>
          CARD_COLUMNS.map((column) => colors[column.key]),
        ),
      ].flatMap((color) => (color ? [color.light.background] : []));
      for (const fill of new Set(fills)) {
        expect(await pixelsOf(png, fill)).toBeGreaterThan(2000);
      }
      expect(await pixelsOf(png, "#dc2626")).toBeGreaterThan(500);
      // Nothing is drawn in the bottom padding, so no row was cut off.
      const { data, info } = await sharp(png)
        .removeAlpha()
        .extract({ left: 0, top: meta.height! - 16, width: 720, height: 16 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info.height).toBe(16);
      expect(data.every((value) => value === 255)).toBe(true);
    },
    30_000,
  );

  it("refuses a date outside the window without reading", async () => {
    at("2030-02-04");
    for (const date of ["2030-02-02", "2030-02-06", "2030-02-30", null]) {
      const response = await route.GET(get(date));
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe(NO_STORE);
    }
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("reads Pacific time's yesterday after UTC midnight, and not UTC's tomorrow", async () => {
    // 4:30 PM on Feb 4 in Pacific Standard Time.
    vi.useFakeTimers({
      now: new Date("2030-02-05T00:30:00Z"),
      toFake: ["Date"],
    });
    expect((await route.GET(get("2030-02-06"))).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
    const response = await route.GET(get("2030-02-03"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    await response.arrayBuffer();
  });

  it.each([
    [
      "the read",
      "load",
      () =>
        mocks.load.mockRejectedValue(
          Object.assign(new Error("Failing row contains (100.9)"), {
            code: "57P01",
          }),
        ),
      "57P01",
    ],
    [
      "the week's math",
      "build",
      () =>
        mocks.build.mockImplementation(() => {
          throw new RangeError("100.9 is out of range");
        }),
      "RangeError",
    ],
  ])(
    "answers a JSON 500 with the no-store headers when %s fails",
    async (_label, step, fail, code) => {
      at("2030-02-04");
      fail();
      const response = await route.GET(get("2030-02-04"));
      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
      expect(response.headers.get("cache-control")).toBe(NO_STORE);
      expect(response.headers.get("x-robots-tag")).toBe(
        "noindex, nofollow, noarchive",
      );
      expect(await response.json()).toEqual({
        error: "The week card could not be drawn.",
      });
      const line = `week-card route: ${step} failed (${code})`;
      expect(console.error).toHaveBeenCalledWith(line);
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        "100.9",
      );
      const [reported] = mocks.report.mock.calls[0] as [Error];
      expect(reported.message).toBe(line);
    },
  );

  it.each([
    ["no Authorization header", undefined],
    ["a wrong token", "Bearer invented-entry-tokem"],
  ])("answers 401 to %s without reading", async (_label, auth) => {
    at("2030-02-04");
    const response = await route.GET(get("2030-02-04", auth ?? ""));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("answers 503 while the token is unset", async () => {
    mocks.env.WEIGHT_LOG_ENTRY_TOKEN = undefined;
    const response = await route.GET(get("2030-02-04"));
    expect(response.status).toBe(503);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const)(
    "refuses %s with 405",
    (method) => {
      const response = route[method]();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
    },
  );
});
