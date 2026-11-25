import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

import {
  createCallerFactory,
  createTRPCRouter,
  ownerProcedure,
} from "~/server/api/trpc";

/**
 * The iOS app's bearer token opens `weightLog.*` and nothing else, and only
 * with the exact token.
 */

const TOKEN = "invented-app-token-0123456789abcdef0123456789";

vi.mock("~/env", () => ({
  env: {
    OWNER_EMAIL: "owner@example.test",
    DAD_CONTENT_PASSWORD: "test-password",
    WEIGHT_LOG_APP_TOKEN: "invented-app-token-0123456789abcdef0123456789",
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("~/server/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("~/server/db", () => ({ db: {} }));

const router = createTRPCRouter({
  weightLog: createTRPCRouter({
    probe: ownerProcedure.query(() => "weight log"),
  }),
  weightlifting: createTRPCRouter({
    probe: ownerProcedure.query(() => "weightlifting"),
  }),
});

const callerWith = (authorization?: string) =>
  createCallerFactory(router)({
    db: {} as never,
    session: null,
    headers: new Headers(authorization ? { authorization } : {}),
  });

async function code(call: Promise<unknown>) {
  try {
    await call;
    return "OK";
  } catch (error) {
    return error instanceof TRPCError ? error.code : "THREW";
  }
}

describe("the owner app token", () => {
  it("opens weightLog procedures", async () => {
    await expect(
      callerWith(`Bearer ${TOKEN}`).weightLog.probe(),
    ).resolves.toBe("weight log");
  });

  it("opens no other owner procedure", async () => {
    expect(await code(callerWith(`Bearer ${TOKEN}`).weightlifting.probe())).toBe(
      "UNAUTHORIZED",
    );
  });

  it("refuses a wrong, partial, or missing token", async () => {
    for (const header of [
      `Bearer ${TOKEN}x`,
      `Bearer ${TOKEN.slice(0, -1)}`,
      TOKEN,
      undefined,
    ]) {
      expect(await code(callerWith(header).weightLog.probe())).toBe(
        "UNAUTHORIZED",
      );
    }
  });
});
