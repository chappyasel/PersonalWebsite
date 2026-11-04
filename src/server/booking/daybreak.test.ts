import { describe, expect, it, vi } from "vitest";

import { zonedTime } from "~/lib/booking/zones";

import {
  type BookingConfig,
  PAGE_TTL_MS,
  TURNSTILE_VERIFY_URL,
  bookingConfig,
  clientIpFrom,
  createPageCache,
  proxyHeaders,
  readBookingPage,
  submitBooking,
  verifyTurnstile,
} from "./daybreak";

vi.mock("server-only", () => ({}));

const BASE = "https://example-deployment.convex.site";
// Secrets are assembled at run time so the repo's scans never see a literal.
const PROXY = ["proxy", "test", "value"].join("-");
const TURNSTILE = ["turnstile", "test", "value"].join("-");

const remote = (overrides: Partial<BookingConfig> = {}): BookingConfig => ({
  source: { kind: "remote", baseUrl: BASE },
  slug: "meet",
  proxySecret: PROXY,
  turnstileSecret: TURNSTILE,
  production: true,
  ...overrides,
});

const PAGE = {
  link: {
    slug: "meet",
    title: "Meet with Chappy",
    host: "Chappy",
    lengths: [15, 30, 60],
    defaultLength: 30,
    call: { kind: "meet" },
  },
  timeZone: "America/Los_Angeles",
  firstDay: "2026-11-10",
  lastDay: "2026-11-30",
  days: [{ day: "2026-11-10", open: [{ start: 1, end: 2 }] }],
  suggested: [1],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type FetchArgs = [input: string | URL | Request, init?: RequestInit];

function fakeFetch(...answers: (Response | Error)[]) {
  const calls: FetchArgs[] = [];
  const fetch = vi.fn(async (...args: FetchArgs) => {
    calls.push(args);
    const next = answers.shift();
    if (!next) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const BOOKING = {
  start: 1_800_000_000_000,
  length: 30,
  name: "Ana",
  email: "ana@example.com",
  about: "Planning",
  requestId: "0123456789abcdefghijklmnop",
  turnstileToken: "token",
};

describe("settings", () => {
  it("are off without a deployment", () => {
    expect(bookingConfig({}).source).toEqual({ kind: "off" });
  });

  it("serve the fixture in development only", () => {
    expect(
      bookingConfig({
        DAYBREAK_BOOKING_URL: "fixture",
        NODE_ENV: "development",
      }).source,
    ).toEqual({ kind: "fixture" });
    expect(
      bookingConfig({ DAYBREAK_BOOKING_URL: "fixture", NODE_ENV: "production" })
        .source,
    ).toEqual({ kind: "off" });
  });

  it("read the deployment's origin and secrets, and the route's slug", () => {
    expect(
      bookingConfig(
        {
          DAYBREAK_BOOKING_URL: `${BASE}/`,
          BOOKING_PROXY_SECRET: PROXY,
          TURNSTILE_SECRET_KEY: "",
          NODE_ENV: "production",
        },
        "chat",
      ),
    ).toEqual({
      source: { kind: "remote", baseUrl: BASE },
      slug: "chat",
      proxySecret: PROXY,
      turnstileSecret: undefined,
      production: true,
    });
    expect(bookingConfig({ DAYBREAK_BOOKING_URL: BASE }).slug).toBe("meet");
  });
});

describe("reading a page", () => {
  const now = () => 0;

  it("asks for a week from a Day and parses the answer", async () => {
    const { fetch, calls } = fakeFetch(json(200, PAGE));
    const read = await readBookingPage(
      remote(),
      { from: "2026-11-17" },
      { fetch, now },
      createPageCache(),
    );
    expect(read).toEqual({ status: "open", page: PAGE });
    const url = new URL(calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe(`${BASE}/book/meet`);
    expect(url.searchParams.get("from")).toBe("2026-11-17");
    expect(url.searchParams.get("days")).toBe("7");
    // Reads carry no secret; only a booking does.
    const headers = new Headers(calls[0]![1]?.headers);
    expect(headers.has("X-Daybreak-Booking-Proxy")).toBe(false);
  });

  it("caches a week for 30 seconds", async () => {
    const cache = createPageCache();
    const { fetch } = fakeFetch(json(200, PAGE), json(200, PAGE));
    let clock = 0;
    const deps = { fetch, now: () => clock };
    await readBookingPage(remote(), {}, deps, cache);
    clock = PAGE_TTL_MS - 1;
    await readBookingPage(remote(), {}, deps, cache);
    expect(fetch).toHaveBeenCalledTimes(1);
    clock = PAGE_TTL_MS;
    await readBookingPage(remote(), {}, deps, cache);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("forgets a failed read so the next visitor tries again", async () => {
    const cache = createPageCache();
    const { fetch } = fakeFetch(new Error("offline"), json(200, PAGE));
    expect(await readBookingPage(remote(), {}, { fetch, now }, cache)).toEqual({
      status: "unavailable",
    });
    await Promise.resolve();
    expect(
      await readBookingPage(remote(), {}, { fetch, now }, cache),
    ).toMatchObject({ status: "open" });
  });

  it("says closed for no link or a closed host, and unavailable otherwise", async () => {
    const answers = [
      [json(404, { error: { code: "not_found" } }), "closed"],
      [json(503, { error: { code: "closed" } }), "closed"],
      [json(500, {}), "unavailable"],
      [json(200, { link: {} }), "unavailable"],
    ] as const;
    for (const [answer, status] of answers) {
      const { fetch } = fakeFetch(answer);
      expect(
        await readBookingPage(remote(), {}, { fetch, now }, createPageCache()),
      ).toEqual({ status });
    }
  });

  it("never calls out when booking is off or the Day is malformed", async () => {
    const { fetch } = fakeFetch();
    expect(
      await readBookingPage(
        remote({ source: { kind: "off" } }),
        {},
        { fetch, now },
      ),
    ).toEqual({ status: "closed" });
    expect(
      await readBookingPage(remote(), { from: "next week" }, { fetch, now }),
    ).toEqual({ status: "closed" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves the fixture's canned week", async () => {
    const tuesday = zonedTime("2026-11-10", 8 * 60, "America/Los_Angeles");
    const read = await readBookingPage(
      remote({ source: { kind: "fixture" } }),
      {},
      { fetch: fakeFetch().fetch, now: () => tuesday },
    );
    expect(read.status).toBe("open");
    if (read.status !== "open") return;
    expect(read.page.firstDay).toBe("2026-11-10");
    expect(read.page.days).toHaveLength(7);
    expect(read.page.days.find((d) => d.day === "2026-11-14")?.open).toEqual(
      [],
    );
    expect(read.page.suggested.length).toBeGreaterThan(0);
  });

  it("serves one length per fixture link and no others", async () => {
    const deps = { fetch: fakeFetch().fetch, now: () => 0 };
    const fixture = (slug: string) =>
      readBookingPage(remote({ source: { kind: "fixture" }, slug }), {}, deps);
    for (const [slug, length] of [
      ["meet", 30],
      ["15", 15],
      ["60", 60],
    ] as const) {
      const read = await fixture(slug);
      if (read.status !== "open") throw new Error(`${slug} closed`);
      expect(read.page.link.lengths).toEqual([length]);
      expect(read.page.link.defaultLength).toBe(length);
    }
    expect(await fixture("45")).toEqual({ status: "closed" });
  });

  it("reads a link by the route's slug and refuses a malformed one", async () => {
    const { fetch, calls } = fakeFetch(json(200, PAGE));
    await readBookingPage(remote({ slug: "15" }), {}, { fetch, now });
    expect(String(calls[0]![0] as string | URL)).toContain("/book/15?");
    expect(
      await readBookingPage(remote({ slug: "../x" }), {}, { fetch, now }),
    ).toEqual({ status: "closed" });
    expect(
      await submitBooking(remote({ slug: "Meet Me" }), BOOKING, undefined, {
        fetch,
        now,
      }),
    ).toMatchObject({ ok: false, code: "closed" });
    expect(calls).toHaveLength(1);
  });
});

describe("the visitor's address", () => {
  it("is the real IP Vercel sets, ahead of a forwarded entry", () => {
    // A visitor can send their own x-forwarded-for; Vercel overwrites
    // x-real-ip, so it wins when both are present.
    expect(
      clientIpFrom(
        new Headers({
          "x-real-ip": "203.0.113.8",
          "x-forwarded-for": "198.51.100.1, 203.0.113.8",
        }),
      ),
    ).toBe("203.0.113.8");
    expect(clientIpFrom(new Headers({ "x-real-ip": " 203.0.113.8 " }))).toBe(
      "203.0.113.8",
    );
  });

  it("falls back to the first forwarded entry, else none", () => {
    expect(
      clientIpFrom(
        new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }),
      ),
    ).toBe("203.0.113.7");
    expect(
      clientIpFrom(
        new Headers({ "x-real-ip": " ", "x-forwarded-for": "203.0.113.7" }),
      ),
    ).toBe("203.0.113.7");
    expect(clientIpFrom(new Headers())).toBeUndefined();
  });

  it("travels only with the proxy secret", () => {
    expect(proxyHeaders({ proxySecret: PROXY }, "203.0.113.7")).toEqual({
      "X-Daybreak-Booking-Proxy": PROXY,
      "X-Daybreak-Booking-Client": "203.0.113.7",
    });
    expect(proxyHeaders({ proxySecret: PROXY }, undefined)).toEqual({
      "X-Daybreak-Booking-Proxy": PROXY,
    });
    expect(proxyHeaders({}, "203.0.113.7")).toEqual({});
  });
});

describe("Turnstile", () => {
  it("sends the secret, the token, and the visitor's address", async () => {
    const { fetch, calls } = fakeFetch(json(200, { success: true }));
    expect(
      await verifyTurnstile(remote(), "token", "203.0.113.7", { fetch }),
    ).toEqual({ ok: true });
    expect(calls[0]![0]).toBe(TURNSTILE_VERIFY_URL);
    const body = calls[0]![1]!.body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({
      secret: TURNSTILE,
      response: "token",
      remoteip: "203.0.113.7",
    });
  });

  it("refuses a failed or missing token", async () => {
    const { fetch } = fakeFetch(
      json(200, { success: false, "error-codes": ["timeout-or-duplicate"] }),
    );
    expect(
      await verifyTurnstile(remote(), "token", undefined, { fetch }),
    ).toEqual({ ok: false, code: "challenge" });
    expect(
      await verifyTurnstile(remote(), undefined, undefined, { fetch }),
    ).toEqual({ ok: false, code: "challenge" });
  });

  it("is skipped in development without a secret and refused in production", async () => {
    const { fetch } = fakeFetch();
    expect(
      await verifyTurnstile(
        remote({ turnstileSecret: undefined, production: false }),
        undefined,
        undefined,
        { fetch },
      ),
    ).toEqual({ ok: true });
    expect(
      await verifyTurnstile(
        remote({ turnstileSecret: undefined }),
        "token",
        undefined,
        { fetch },
      ),
    ).toEqual({ ok: false, code: "closed" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls Cloudflare unreachable rather than the booker wrong", async () => {
    const { fetch } = fakeFetch(new Error("offline"));
    expect(
      await verifyTurnstile(remote(), "token", undefined, { fetch }),
    ).toEqual({ ok: false, code: "unavailable" });
  });
});

describe("booking", () => {
  const now = () => 0;
  const booked = {
    start: BOOKING.start,
    end: BOOKING.start + 1_800_000,
    title: "Ana 🤝 Chappy",
  };

  it("checks Turnstile, then forwards with the proxy headers", async () => {
    const { fetch, calls } = fakeFetch(
      json(200, { success: true }),
      json(200, { booked }),
    );
    const result = await submitBooking(
      remote(),
      { ...BOOKING, linkedin: "  " },
      "203.0.113.7",
      { fetch, now },
      createPageCache(),
    );
    expect(result).toEqual({ ok: true, booked });
    const [url, init] = calls[1]!;
    expect(url).toBe(`${BASE}/book/meet`);
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Daybreak-Booking-Proxy")).toBe(PROXY);
    expect(headers.get("X-Daybreak-Booking-Client")).toBe("203.0.113.7");
    // The token stays here; a blank LinkedIn isn't sent.
    expect(JSON.parse(init?.body as string)).toEqual({
      start: BOOKING.start,
      length: 30,
      name: "Ana",
      email: "ana@example.com",
      about: "Planning",
      requestId: BOOKING.requestId,
    });
  });

  it("leaves a blank about line out of the body", async () => {
    const { fetch, calls } = fakeFetch(
      json(200, { success: true }),
      json(200, { booked }),
      json(200, { success: true }),
      json(200, { booked }),
    );
    const withoutAbout = { ...BOOKING, about: undefined };
    for (const request of [{ ...BOOKING, about: "  " }, withoutAbout]) {
      expect(
        await submitBooking(
          remote(),
          request,
          undefined,
          { fetch, now },
          createPageCache(),
        ),
      ).toEqual({ ok: true, booked });
    }
    for (const [, init] of [calls[1]!, calls[3]!]) {
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      expect(body).not.toHaveProperty("about");
      expect(body).toMatchObject({ name: "Ana", requestId: BOOKING.requestId });
    }
  });

  it("never forwards when the person check fails", async () => {
    const { fetch } = fakeFetch(json(200, { success: false }));
    const result = await submitBooking(
      remote(),
      BOOKING,
      undefined,
      { fetch, now },
      createPageCache(),
    );
    expect(result).toMatchObject({ ok: false, code: "challenge" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses in production without a Turnstile secret", async () => {
    const { fetch } = fakeFetch();
    const result = await submitBooking(
      remote({ turnstileSecret: undefined }),
      BOOKING,
      undefined,
      { fetch, now },
    );
    expect(result).toMatchObject({ ok: false, code: "closed" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps Daybreak's refusals", async () => {
    const cases = [
      [
        json(400, {
          error: { code: "invalid", message: "A name is 1 to 100 characters" },
        }),
        { code: "invalid", message: "A name is 1 to 100 characters" },
      ],
      [
        json(409, { error: { code: "taken", message: "x" } }),
        { code: "taken" },
      ],
      [
        json(429, { error: { code: "too_many", message: "x" } }),
        { code: "too_many" },
      ],
      [
        json(503, { error: { code: "closed", message: "x" } }),
        { code: "closed" },
      ],
      [new Response("<html>", { status: 502 }), { code: "unavailable" }],
      [new Error("timeout"), { code: "unavailable" }],
    ] as const;
    for (const [answer, expected] of cases) {
      const { fetch } = fakeFetch(answer);
      const result = await submitBooking(
        remote({ turnstileSecret: undefined, production: false }),
        BOOKING,
        undefined,
        { fetch, now },
        createPageCache(),
      );
      expect(result).toMatchObject({ ok: false, ...expected });
    }
  });

  it("refreshes the cached weeks after a booking or a taken time", async () => {
    const cache = createPageCache();
    const reads = fakeFetch(json(200, PAGE), json(200, PAGE));
    await readBookingPage(remote(), {}, { fetch: reads.fetch, now }, cache);
    expect(cache.size).toBe(1);
    const { fetch } = fakeFetch(json(409, { error: { code: "taken" } }));
    await submitBooking(
      remote({ turnstileSecret: undefined, production: false }),
      BOOKING,
      undefined,
      { fetch, now },
      cache,
    );
    expect(cache.size).toBe(0);
  });

  it("refuses a malformed request ID before calling anyone", async () => {
    const { fetch } = fakeFetch();
    const result = await submitBooking(
      remote(),
      { ...BOOKING, requestId: "short" },
      undefined,
      { fetch, now },
    );
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("books against the fixture the way the deployment would", async () => {
    const fixture = remote({
      source: { kind: "fixture" },
      turnstileSecret: undefined,
      production: false,
    });
    const tuesday = zonedTime("2026-11-10", 8 * 60, "America/Los_Angeles");
    const deps = { fetch: fakeFetch().fetch, now: () => tuesday };
    const read = await readBookingPage(fixture, {}, deps);
    if (read.status !== "open") throw new Error("fixture closed");
    const start = read.page.suggested[0]!;
    expect(
      await submitBooking(fixture, { ...BOOKING, start }, undefined, deps),
    ).toMatchObject({ ok: true, booked: { title: "Ana 🤝 Chappy" } });
    // What it's about is optional.
    const withoutAbout = { ...BOOKING, about: undefined };
    expect(
      await submitBooking(fixture, { ...withoutAbout, start }, undefined, deps),
    ).toMatchObject({ ok: true, booked: { title: "Ana 🤝 Chappy" } });
    expect(
      await submitBooking(
        fixture,
        { ...BOOKING, start, about: "taken please" },
        undefined,
        deps,
      ),
    ).toMatchObject({ code: "taken" });
    expect(
      await submitBooking(
        fixture,
        { ...BOOKING, start: start + 60_000 },
        undefined,
        deps,
      ),
    ).toMatchObject({ code: "taken" });
  });
});
