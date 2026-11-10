import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { weekSummary } from "~/lib/weight-log/week-summary";
import { SYNTHETIC_LOG } from "~/lib/weight-log/week-summary.fixture";

import { CARD_HEIGHT, CARD_WIDTH } from "./WeekCard";
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
}));
vi.mock("~/env", () => ({ env: mocks.env }));
vi.mock("~/server/db", () => ({ db: { synthetic: true } }));
vi.mock("~/lib/weight-log/database", () => ({ loadWeekRecords: mocks.load }));
vi.mock("~/lib/weight-log/records", () => ({
  buildWeightLog: () => SYNTHETIC_LOG,
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
  mocks.load.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

const at = (date: string) =>
  vi.useFakeTimers({ now: new Date(`${date}T15:00:00Z`), toFake: ["Date"] });

describe("GET /api/weight-log/week-card", () => {
  it.each([
    ["an empty week", "2030-02-26"],
    ["one weigh-in", "2030-02-04"],
    ["a full week", "2030-01-13"],
    ["an excluded day", "2030-01-31"],
    ["a week with no target", "2030-02-19"],
    ["a planned week with no weigh-ins", "2030-02-12"],
  ])(
    "renders %s as a PNG with each day's color",
    async (_label, date) => {
      at(date);
      const response = await route.GET(get(date));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("cache-control")).toBe(NO_STORE);
      expect(response.headers.get("x-robots-tag")).toBe(
        "noindex, nofollow, noarchive",
      );
      const png = Buffer.from(await response.arrayBuffer());
      const meta = await sharp(png).metadata();
      expect([meta.width, meta.height]).toEqual([CARD_WIDTH, CARD_HEIGHT]);

      // Every counted weigh-in's cell is filled with its scale color.
      const summary = weekSummary(SYNTHETIC_LOG, date);
      for (const day of summary.days) {
        if (day.fill) {
          expect(await pixelsOf(png, day.fill.background)).toBeGreaterThan(
            5000,
          );
        }
      }
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

  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)(
    "refuses %s with 405",
    (method) => {
      const response = route[method]();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
    },
  );
});
