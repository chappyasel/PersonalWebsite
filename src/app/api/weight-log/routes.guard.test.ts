import { autoImplementMethods } from "next/dist/server/route-modules/app-route/helpers/auto-implement-methods";
import { HTTP_METHODS } from "next/dist/server/web/http";
import { NextRequest } from "next/server";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * Every route under `src/app/api/weight-log/` sits outside the tRPC guard
 * (`weightLogOwnerOnly.test.ts`) and the owner page's boundary test, since it
 * answers a Shortcut, not a signed-in owner. This test is their guard: each
 * route must be listed below with the one token env var it answers and a
 * request it would serve. Every method Next answers for it, its own exports
 * and the HEAD and OPTIONS Next adds, must refuse a missing token, a wrong
 * one, and another route's token before it touches the database, even when
 * the rest of the request is valid. A new route fails here until it is listed
 * and refuses those requests.
 */

type TokenVar = "WEIGHT_LOG_MIRROR_TOKEN" | "WEIGHT_LOG_ENTRY_TOKEN";

/** The day the tests run on. The valid requests below name it. */
const NOW = new Date("2030-02-04T15:00:00Z");

interface ValidRequest {
  /** A query string the route would serve. */
  query?: string;
  /** A JSON body the route would accept, sent with every method but GET and HEAD. */
  body?: unknown;
}

/**
 * Each route file, relative to this folder, the token it answers, and a
 * request it would serve with that token.
 */
const ROUTES: Record<string, { token: TokenVar; valid: ValidRequest }> = {
  "mirror/route.ts": {
    token: "WEIGHT_LOG_MIRROR_TOKEN",
    valid: { query: "from=2030-01-22&to=2030-02-04" },
  },
  "weigh-in/route.ts": {
    token: "WEIGHT_LOG_ENTRY_TOKEN",
    valid: {
      query: "date=2030-02-04",
      body: { date: "2030-02-04", pounds: 150.2, replace: true },
    },
  },
  "week-card/route.tsx": {
    token: "WEIGHT_LOG_ENTRY_TOKEN",
    valid: { query: "date=2030-02-04" },
  },
};

const TOKENS: Record<TokenVar, string> = {
  WEIGHT_LOG_MIRROR_TOKEN: "invented-mirror-token-0123456789abcdef",
  WEIGHT_LOG_ENTRY_TOKEN: "invented-entry-token-0123456789abcdef",
};

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  touched: [] as string[],
}));
vi.mock("~/env", () => ({ env: mocks.env }));
vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({
  db: new Proxy(
    {},
    {
      get(_target, key) {
        mocks.touched.push(String(key));
        throw new Error("database touched");
      },
    },
  ),
}));

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROUTE_FILE = /^route\.(ts|tsx|js|jsx|mjs)$/;
const NO_STORE = "private, no-store, max-age=0";

/** Every route handler file under a folder, relative to it. */
function routeFiles(root: string) {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => ROUTE_FILE.test(path.split(/[\\/]/).at(-1)!))
    .map((path) => relative(root, join(root, path)).split("\\").join("/"))
    .sort();
}

/** Route files missing from the list, and listed files that are gone. */
function listViolations(files: string[], listed: Record<string, unknown>) {
  return [
    ...files
      .filter((file) => !(file in listed))
      .map((file) => `${file} is not listed with its token`),
    ...Object.keys(listed)
      .filter((file) => !files.includes(file))
      .map((file) => `${file} is listed but does not exist`),
  ];
}

type Handler = (request: NextRequest) => Response | Promise<Response>;

/**
 * Every method Next answers for a route file: its exports, with HEAD and
 * OPTIONS filled in the way Next fills them when the file leaves them out,
 * and a bare 405 for the rest.
 */
async function handlersOf(file: string) {
  const exports = (await import(join(HERE, file))) as Record<string, unknown>;
  const methods = autoImplementMethods(exports as never) as unknown as Record<
    string,
    Handler
  >;
  return HTTP_METHODS.map((method) => [method, methods[method]!] as const);
}

function request(
  file: string,
  method: string,
  authorization: string | undefined,
  { query, body }: ValidRequest = {},
) {
  const url = `https://www.chappyasel.com/api/weight-log/${file.split("/")[0]}${query ? `?${query}` : ""}`;
  const sendsBody = body !== undefined && method !== "GET" && method !== "HEAD";
  return new NextRequest(url, {
    method,
    headers: {
      ...(authorization ? { authorization } : {}),
      ...(sendsBody ? { "content-type": "application/json" } : {}),
    },
    ...(sendsBody ? { body: JSON.stringify(body) } : {}),
  });
}

/**
 * What a handler answered. A 405 must name the methods the route serves, and
 * every answer here must carry the no-store header, so a refusal can't be
 * cached by a proxy.
 */
async function outcome(handler: Handler, req: NextRequest) {
  try {
    const response = await handler(req);
    const status =
      response.status === 405
        ? `405 Allow: ${response.headers.get("allow")}`
        : String(response.status);
    return response.headers.get("cache-control") === NO_STORE
      ? status
      : `${status} without no-store`;
  } catch (error) {
    return `threw ${(error as Error).message}`;
  }
}

const isMethodRefusal = (result: string) =>
  /^405 Allow: [A-Z]/.test(result) && !result.endsWith("without no-store");

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  Object.assign(mocks.env, TOKENS);
  mocks.touched = [];
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("weight-log API routes", () => {
  it("lists every route with its token", () => {
    expect(listViolations(routeFiles(HERE), ROUTES)).toEqual([]);
  });

  it("names a route that is not listed, and a listed route that is gone", () => {
    const files = ["mirror/route.ts", "export/route.ts"];
    expect(
      listViolations(files, {
        "mirror/route.ts": "WEIGHT_LOG_MIRROR_TOKEN",
        "weigh-in/route.ts": "WEIGHT_LOG_ENTRY_TOKEN",
      }),
    ).toEqual([
      "export/route.ts is not listed with its token",
      "weigh-in/route.ts is listed but does not exist",
    ]);
  });

  it("uses a different token for the mirror and for entry", () => {
    expect(new Set(Object.values(TOKENS)).size).toBe(2);
  });

  describe.each(Object.entries(ROUTES))("%s", (file, { token: own, valid }) => {
    const others = (Object.keys(TOKENS) as TokenVar[]).filter(
      (token) => token !== own,
    );
    const refused: [label: string, authorization: string | undefined][] = [
      ["no token", undefined],
      ["a wrong token", `Bearer ${TOKENS[own]}x`],
      ["the token without Bearer", TOKENS[own]],
      ...others.map((token): [string, string] => [
        token,
        `Bearer ${TOKENS[token]}`,
      ]),
    ];

    it.each(refused)(
      "refuses %s on every method before touching the database",
      async (_label, authorization) => {
        for (const input of [{}, valid]) {
          for (const [method, handler] of await handlersOf(file)) {
            const result = await outcome(
              handler,
              request(file, method, authorization, input),
            );
            expect(
              result === "401" || isMethodRefusal(result),
              `${method} ${file} answered ${result}`,
            ).toBe(true);
          }
        }
        expect(mocks.touched).toEqual([]);
      },
    );

    it("refuses every method while its token is unset", async () => {
      mocks.env[own] = undefined;
      for (const [method, handler] of await handlersOf(file)) {
        const result = await outcome(
          handler,
          request(file, method, `Bearer ${TOKENS[own]}`, valid),
        );
        expect(
          result === "503" || isMethodRefusal(result),
          `${method} ${file} answered ${result}`,
        ).toBe(true);
      }
      expect(mocks.touched).toEqual([]);
    });

    it(`answers ${own}, which gets past the token check`, async () => {
      // An empty request is refused as a bad request, before any read, so
      // reaching a 400 shows the route checked the token it is listed with.
      const results = await Promise.all(
        (await handlersOf(file)).map(async ([method, handler]) =>
          outcome(handler, request(file, method, `Bearer ${TOKENS[own]}`)),
        ),
      );
      expect(results).toContain("400");
      expect(results).not.toContain("401");
      expect(mocks.touched).toEqual([]);
    });

    it("reaches the database with its token and the valid request", async () => {
      // Shows the valid request above is one the route would serve, so the
      // refusals before it were the token's doing.
      for (const [method, handler] of await handlersOf(file)) {
        await outcome(
          handler,
          request(file, method, `Bearer ${TOKENS[own]}`, valid),
        );
      }
      expect(mocks.touched).not.toEqual([]);
    });
  });
});
