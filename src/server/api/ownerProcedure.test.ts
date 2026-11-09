import { TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createCallerFactory,
  createTRPCRouter,
  ownerProcedure,
} from "~/server/api/trpc";

vi.mock("~/env", () => ({
  env: { OWNER_EMAIL: "owner@example.test", DAD_CONTENT_PASSWORD: "unused" },
}));
vi.mock("~/server/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("~/server/db", () => ({ db: {} }));

const reached = vi.fn(() => "owner data");

const createCaller = createCallerFactory(
  createTRPCRouter({ secret: ownerProcedure.query(reached) }),
);

function session(email: string | null): Session {
  return {
    user: { id: "user-1", email },
    expires: "2099-01-01T00:00:00.000Z",
  } as Session;
}

async function callAs(sessionValue: Session | null) {
  try {
    const value = await createCaller({
      db: {} as never,
      session: sessionValue,
      headers: new Headers(),
    }).secret();
    return { value };
  } catch (error) {
    return { code: error instanceof TRPCError ? error.code : "other" };
  }
}

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("ownerProcedure", () => {
  it("refuses an anonymous caller", async () => {
    expect(await callAs(null)).toEqual({ code: "UNAUTHORIZED" });
  });

  it.each([
    ["another address", "someone@example.test"],
    ["a session without an address", null],
  ])("refuses a session for %s", async (_, email) => {
    expect(await callAs(session(email))).toEqual({ code: "FORBIDDEN" });
  });

  it("never runs the resolver for a refused caller", async () => {
    reached.mockClear();
    await callAs(null);
    await callAs(session("someone@example.test"));
    expect(reached).not.toHaveBeenCalled();
  });

  it("lets the owner's session through", async () => {
    expect(await callAs(session("OWNER@example.test"))).toEqual({
      value: "owner data",
    });
  });
});
