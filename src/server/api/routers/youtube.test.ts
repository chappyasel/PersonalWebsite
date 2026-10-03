import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { dadAccessToken } from "~/lib/dad/access";
import { youtubeAccessToken } from "~/lib/youtube/access";
import { youtubeRouter } from "~/server/api/routers/youtube";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

vi.mock("~/env", () => ({
  env: { DAD_CONTENT_PASSWORD: "correct-password" },
}));
vi.mock("~/server/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("~/server/db", () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error("database touched");
      },
    },
  ),
}));
vi.mock("~/lib/youtube/sync", () => ({ syncYouTube: vi.fn() }));

type AnyProcedure = (input?: unknown) => Promise<unknown>;

// The only procedure that answers without a token. It reports whether a
// password is right and nothing else.
const PUBLIC_PROCEDURES = new Set(["verifyPassword"]);

const procedureNames = Object.keys(youtubeRouter._def.procedures).filter(
  (name) => !PUBLIC_PROCEDURES.has(name),
);

const createCaller = createCallerFactory(
  createTRPCRouter({ youtube: youtubeRouter }),
);

function youtubeCaller(cookie?: string) {
  const caller = createCaller({
    db: {} as never,
    session: null,
    headers: new Headers(cookie ? { cookie: `youtube-access=${cookie}` } : {}),
  });
  return caller.youtube as unknown as Record<string, AnyProcedure>;
}

// Each call goes through the timing middleware, which logs and, outside
// production, waits up to half a second. Calls run in parallel to keep the
// suite fast.
async function settle(cookie: string | undefined) {
  const caller = youtubeCaller(cookie);
  const results = await Promise.allSettled(
    procedureNames.map((name) => caller[name]!({})),
  );
  return procedureNames.map((name, index) => ({
    name,
    result: results[index]!,
  }));
}

function errorCode(result: PromiseSettledResult<unknown>) {
  if (result.status === "fulfilled") return "fulfilled";
  return result.reason instanceof TRPCError ? result.reason.code : "other";
}

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("YouTube tRPC procedures", () => {
  it("covers every viewing-data procedure", () => {
    expect(procedureNames).toEqual(
      expect.arrayContaining([
        "getStats",
        "getCalendarData",
        "getInformationDietSummary",
        "getChannelVideos",
        "saveCalibrationScores",
      ]),
    );
  });

  it.each([
    ["a missing", undefined],
    ["an arbitrary", "authenticated"],
    ["a stale", youtubeAccessToken("old-password")],
    ["a Dad-signed", dadAccessToken("correct-password")],
  ])("refuse %s cookie before touching data", async (_, cookie) => {
    const outcomes = await settle(cookie);

    for (const { name, result } of outcomes) {
      expect({ name, code: errorCode(result) }).toEqual({
        name,
        code: "UNAUTHORIZED",
      });
    }
  });

  it("let the token the login action sets past the gate", async () => {
    const outcomes = await settle(youtubeAccessToken("correct-password"));

    for (const { name, result } of outcomes) {
      // triggerSync also needs a signed-in NextAuth session.
      if (name === "triggerSync") continue;
      expect({ name, code: errorCode(result) }).not.toEqual({
        name,
        code: "UNAUTHORIZED",
      });
    }
  });

  it("verifyPassword reveals only whether the password is right", async () => {
    await expect(
      youtubeCaller().verifyPassword!({ password: "wrong-password" }),
    ).resolves.toEqual({ valid: false });
  });
});
