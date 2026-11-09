import { type AnyRouter, TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { appRouter } from "~/server/api/root";
import {
  cookieProtectedProcedure,
  createCallerFactory,
  createTRPCRouter,
  ownerProcedure,
  publicProcedure,
} from "~/server/api/trpc";

/**
 * Slice 0 rule of the Weight Log migration (docs/plans/weight-log-migration.md):
 * every `weightLog.*` mutation, and every `weightLog.*` query that returns
 * owner-only data, uses `ownerProcedure`. The router lands in slice 2; until
 * then this passes on its absence and proves itself on the fixtures below.
 */

vi.mock("~/env", () => ({
  env: {
    OWNER_EMAIL: "owner@example.test",
    DAD_CONTENT_PASSWORD: "test-password",
  },
}));
vi.mock("server-only", () => ({}));
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

/**
 * `weightLog.*` queries that return only what the public `/weight-log` chart
 * already shows. Empty on purpose: the public page reads `getWeightLog()`
 * directly. A query added here must return nothing the chart does not, and
 * the owner approves it in review. Mutations never belong here.
 */
const PUBLIC_WEIGHT_LOG_QUERIES = new Set<string>();

const ROUTER_KEY = "weightLog";
const RULE =
  "Every weightLog mutation, and every weightLog query that returns owner-only " +
  "data, must use ownerProcedure (docs/plans/weight-log-migration.md, slice 1).";

type Procedure = {
  _def: { type: string; middlewares: readonly unknown[] };
};

function proceduresOf(router: AnyRouter) {
  return Object.entries(router._def.procedures as Record<string, Procedure>);
}

/** `ownerProcedure`'s middleware chain, owner check included, is a prefix of
 * every procedure built from it, with or without `.input()`. */
function usesOwnerProcedure(procedure: Procedure) {
  const chain = procedure._def.middlewares;
  return ownerProcedure._def.middlewares.every(
    (middleware, index) => chain[index] === middleware,
  );
}

/** A segment that reads as the Weight Log router under another spelling,
 * such as `weight_log` or `WeightLogs`. `weightlifting` does not match. */
const MISSPELLED_ROUTER_KEY = /^weight[-_]?log/i;

/** Every router segment of a path: all but the procedure name. A Weight Log
 * router can sit at any depth, so the checks look at each one. */
function routerSegments(path: string) {
  return path.split(".").slice(0, -1);
}

function ownerOnlyViolations(
  router: AnyRouter,
  publicQueries: ReadonlySet<string> = PUBLIC_WEIGHT_LOG_QUERIES,
) {
  return proceduresOf(router).flatMap(([path, procedure]) => {
    const segments = routerSegments(path);
    // A Weight Log router mounted under another spelling would dodge the
    // exact-key check below.
    const misspelled = segments.find(
      (segment) =>
        segment !== ROUTER_KEY && MISSPELLED_ROUTER_KEY.test(segment),
    );
    if (misspelled) {
      return [`${path} is mounted at "${misspelled}", not "${ROUTER_KEY}"`];
    }
    if (!segments.includes(ROUTER_KEY)) return [];
    const { type } = procedure._def;
    if (type === "query" && publicQueries.has(path)) return [];
    if (usesOwnerProcedure(procedure)) return [];
    return [`${path} (${type}) does not use ownerProcedure`];
  });
}

function weightLogPaths(router: AnyRouter) {
  return proceduresOf(router)
    .map(([path]) => path)
    .filter(
      (path) =>
        routerSegments(path).includes(ROUTER_KEY) &&
        !PUBLIC_WEIGHT_LOG_QUERIES.has(path),
    );
}

type Callable = (input?: unknown) => Promise<unknown>;

/** Calls each path as the given session and reports the tRPC error code. */
async function refusalCodes(
  router: AnyRouter,
  paths: string[],
  session: Session | null,
) {
  const caller = createCallerFactory(router)({
    db: {} as never,
    session,
    headers: new Headers(),
  }) as unknown as Record<string, unknown>;
  const results = await Promise.allSettled(
    paths.map((path) => {
      const procedure = path
        .split(".")
        .reduce<unknown>(
          (node, key) => (node as Record<string, unknown>)[key],
          caller,
        ) as Callable;
      return procedure({});
    }),
  );
  return results.map((result, index) => ({
    path: paths[index],
    code:
      result.status === "fulfilled"
        ? "fulfilled"
        : result.reason instanceof TRPCError
          ? result.reason.code
          : "other",
  }));
}

const strangerSession = {
  user: { id: "stranger", email: "someone@example.test" },
  expires: "2099-01-01T00:00:00.000Z",
} as Session;

const anything = () => "owner data";

const leakyRouter = createTRPCRouter({
  weightLog: createTRPCRouter({
    upsertWeighIn: publicProcedure.mutation(anything),
    deleteWeighIn: cookieProtectedProcedure.mutation(anything),
    weekTable: publicProcedure.query(anything),
    phases: ownerProcedure.query(anything),
  }),
  weight_log: createTRPCRouter({ weighIns: ownerProcedure.query(anything) }),
  admin: createTRPCRouter({
    weightLog: createTRPCRouter({
      exportCsv: publicProcedure.query(anything),
    }),
    weight_log: createTRPCRouter({ phases: ownerProcedure.query(anything) }),
  }),
});

const guardedRouter = createTRPCRouter({
  weightLog: createTRPCRouter({
    upsertWeighIn: ownerProcedure
      .input((value) => value as Record<string, never>)
      .mutation(anything),
    weekTable: ownerProcedure.query(anything),
  }),
  weightlifting: createTRPCRouter({ stats: publicProcedure.query(anything) }),
  admin: createTRPCRouter({
    weightLog: createTRPCRouter({ exportCsv: ownerProcedure.query(anything) }),
    weightlifting: createTRPCRouter({
      stats: publicProcedure.query(anything),
    }),
  }),
});

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("weightLog procedures are owner-only", () => {
  it("the app router has no weightLog procedure off ownerProcedure", () => {
    expect(ownerOnlyViolations(appRouter), RULE).toEqual([]);
  });

  it("the app router's weightLog procedures refuse anyone but the owner", async () => {
    const paths = weightLogPaths(appRouter);
    for (const [session, code] of [
      [null, "UNAUTHORIZED"],
      [strangerSession, "FORBIDDEN"],
    ] as const) {
      for (const outcome of await refusalCodes(appRouter, paths, session)) {
        expect(outcome, RULE).toEqual({ path: outcome.path, code });
      }
    }
  });

  it("names each leaky procedure in a router that breaks the rule", () => {
    expect(ownerOnlyViolations(leakyRouter)).toEqual([
      "weightLog.upsertWeighIn (mutation) does not use ownerProcedure",
      "weightLog.deleteWeighIn (mutation) does not use ownerProcedure",
      "weightLog.weekTable (query) does not use ownerProcedure",
      'weight_log.weighIns is mounted at "weight_log", not "weightLog"',
      "admin.weightLog.exportCsv (query) does not use ownerProcedure",
      'admin.weight_log.phases is mounted at "weight_log", not "weightLog"',
    ]);
  });

  it("exempts a listed public query but never a listed mutation", () => {
    const listed = new Set(["weightLog.weekTable", "weightLog.upsertWeighIn"]);
    expect(ownerOnlyViolations(leakyRouter, listed)).toEqual([
      "weightLog.upsertWeighIn (mutation) does not use ownerProcedure",
      "weightLog.deleteWeighIn (mutation) does not use ownerProcedure",
      'weight_log.weighIns is mounted at "weight_log", not "weightLog"',
      "admin.weightLog.exportCsv (query) does not use ownerProcedure",
      'admin.weight_log.phases is mounted at "weight_log", not "weightLog"',
    ]);
  });

  it("passes a router built on ownerProcedure, and its procedures refuse strangers", async () => {
    expect(ownerOnlyViolations(guardedRouter)).toEqual([]);
    const paths = weightLogPaths(guardedRouter);
    expect(paths).toEqual([
      "weightLog.upsertWeighIn",
      "weightLog.weekTable",
      "admin.weightLog.exportCsv",
    ]);
    expect(await refusalCodes(guardedRouter, paths, null)).toEqual(
      paths.map((path) => ({ path, code: "UNAUTHORIZED" })),
    );
    expect(await refusalCodes(guardedRouter, paths, strangerSession)).toEqual(
      paths.map((path) => ({ path, code: "FORBIDDEN" })),
    );
  });
});
