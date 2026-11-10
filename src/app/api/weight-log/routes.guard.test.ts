import { NextRequest } from "next/server";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterAll,
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
 * route must be listed below with the one token env var it answers, and every
 * method it exports must refuse a missing token, a wrong one, and another
 * route's token before it touches the database. A new route fails here until
 * it is listed and refuses those requests.
 */

type TokenVar = "WEIGHT_LOG_MIRROR_TOKEN" | "WEIGHT_LOG_ENTRY_TOKEN";

/** Each route file, relative to this folder, and the token it answers. */
const ROUTE_TOKENS: Record<string, TokenVar> = {
  "mirror/route.ts": "WEIGHT_LOG_MIRROR_TOKEN",
  "weigh-in/route.ts": "WEIGHT_LOG_ENTRY_TOKEN",
  "week-card/route.tsx": "WEIGHT_LOG_ENTRY_TOKEN",
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
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

/** Every route handler file under a folder, relative to it. */
function routeFiles(root: string) {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => ROUTE_FILE.test(path.split(/[\\/]/).at(-1)!))
    .map((path) => relative(root, join(root, path)).split("\\").join("/"))
    .sort();
}

/** Route files missing from the list, and listed files that are gone. */
function listViolations(files: string[], listed: Record<string, TokenVar>) {
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

async function handlersOf(file: string) {
  const exports = (await import(join(HERE, file))) as Record<string, unknown>;
  return METHODS.flatMap((method) =>
    typeof exports[method] === "function"
      ? [[method, exports[method] as Handler] as const]
      : [],
  );
}

function request(file: string, method: string, authorization?: string) {
  const url = `https://www.chappyasel.com/api/weight-log/${file.split("/")[0]}`;
  return new NextRequest(url, {
    method,
    headers: authorization ? { authorization } : {},
  });
}

/** A refusal: 401 for a bad token, or 405 for a method the route never serves. */
async function outcome(handler: Handler, req: NextRequest) {
  try {
    const response = await handler(req);
    return response.status === 405
      ? `405 Allow: ${response.headers.get("allow")}`
      : String(response.status);
  } catch (error) {
    return `threw ${(error as Error).message}`;
  }
}

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  Object.assign(mocks.env, TOKENS);
  mocks.touched = [];
});

describe("weight-log API routes", () => {
  it("lists every route with its token", () => {
    expect(listViolations(routeFiles(HERE), ROUTE_TOKENS)).toEqual([]);
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

  describe.each(Object.entries(ROUTE_TOKENS))("%s", (file, own) => {
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
        const handlers = await handlersOf(file);
        expect(handlers.length).toBeGreaterThan(0);
        for (const [method, handler] of handlers) {
          const result = await outcome(
            handler,
            request(file, method, authorization),
          );
          expect(
            result === "401" || result.startsWith("405 Allow:"),
            `${method} ${file} answered ${result}`,
          ).toBe(true);
        }
        expect(mocks.touched).toEqual([]);
      },
    );

    it("refuses every method while its token is unset", async () => {
      mocks.env[own] = undefined;
      for (const [method, handler] of await handlersOf(file)) {
        const result = await outcome(
          handler,
          request(file, method, `Bearer ${TOKENS[own]}`),
        );
        expect(
          result === "503" || result.startsWith("405 Allow:"),
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
  });
});
