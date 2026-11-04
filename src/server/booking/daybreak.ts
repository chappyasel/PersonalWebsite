import "server-only";

import {
  type BookingPage,
  DAY_PATTERN,
  WEEK,
  bookingPageSchema,
} from "~/lib/booking/page";
import {
  type BookResult,
  type BookingFields,
  MESSAGES,
  REQUEST_ID,
  readBookingAnswer,
} from "~/lib/booking/request";

import { fixtureBook, fixturePage } from "./fixture";

/**
 * The server side of /meet. The browser never calls the Daybreak deployment
 * or sees its secrets: it asks this module, through the booking tRPC
 * router, which reads a Booking link's open time and books through
 * Daybreak's tokenless `/book/<slug>` routes (Daybreak ADR 0028).
 *
 * Reads are cached for 30 seconds, since the deployment's GET has no rate
 * limit. A booking checks Cloudflare Turnstile first, then forwards with the
 * deployment's proxy secret and the visitor's address, which Daybreak's
 * per-visitor limit counts.
 */

export type BookingSource =
  | { kind: "off" }
  | { kind: "fixture" }
  | { kind: "remote"; baseUrl: string };

export type BookingConfig = {
  source: BookingSource;
  slug: string;
  proxySecret?: string;
  turnstileSecret?: string;
  production: boolean;
};

type EnvLike = {
  NODE_ENV?: string;
  DAYBREAK_BOOKING_URL?: string;
  DAYBREAK_BOOKING_SLUG?: string;
  BOOKING_PROXY_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
};

export const DEFAULT_SLUG = "meet";

/**
 * The booking settings from the environment. `fixture` serves canned open
 * time outside production only; a production build that has it set is
 * treated as having no deployment.
 */
export function bookingConfig(env: EnvLike): BookingConfig {
  const production = env.NODE_ENV === "production";
  const url = env.DAYBREAK_BOOKING_URL?.trim();
  const source: BookingSource =
    !url || (url === "fixture" && production)
      ? { kind: "off" }
      : url === "fixture"
        ? { kind: "fixture" }
        : { kind: "remote", baseUrl: url.replace(/\/+$/, "") };
  return {
    source,
    slug: env.DAYBREAK_BOOKING_SLUG ?? DEFAULT_SLUG,
    proxySecret: nonEmpty(env.BOOKING_PROXY_SECRET),
    turnstileSecret: nonEmpty(env.TURNSTILE_SECRET_KEY),
    production,
  };
}

export type PageRead =
  | { status: "open"; page: BookingPage }
  /** No deployment set, no such link, or the host isn't taking bookings. */
  | { status: "closed" }
  /** The deployment didn't answer, or answered something unreadable. */
  | { status: "unavailable" };

export type Deps = {
  fetch: typeof fetch;
  now: () => number;
};

const defaultDeps: Deps = {
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
};

export const PAGE_TTL_MS = 30_000;
const MOST_CACHED = 100;

/**
 * A short-lived cache of page reads, keyed by link and first Day. Only
 * open pages stay; a failed read is forgotten once it settles, so the next
 * visitor tries again. Concurrent reads of one key share a request.
 */
export function createPageCache(ttl = PAGE_TTL_MS) {
  const entries = new Map<string, { at: number; value: Promise<PageRead> }>();
  return {
    read(key: string, now: number, load: () => Promise<PageRead>) {
      const hit = entries.get(key);
      if (hit && now - hit.at < ttl) return hit.value;
      const value = load();
      entries.set(key, { at: now, value });
      if (entries.size > MOST_CACHED) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      void value.then(
        (read) => {
          if (read.status !== "open" && entries.get(key)?.value === value) {
            entries.delete(key);
          }
        },
        () => entries.delete(key),
      );
      return value;
    },
    /** Drops every cached week of `slug`, after a booking changes its open time. */
    forget(slug: string) {
      for (const key of entries.keys()) {
        if (key.startsWith(`${slug}|`)) entries.delete(key);
      }
    },
    get size() {
      return entries.size;
    },
  };
}

export type PageCache = ReturnType<typeof createPageCache>;

const sharedCache = createPageCache();

/** A week of the link's open time from `from`, or from the first bookable Day. */
export async function readBookingPage(
  config: BookingConfig,
  { from }: { from?: string },
  deps: Deps = defaultDeps,
  cache: PageCache = sharedCache,
): Promise<PageRead> {
  if (from !== undefined && !DAY_PATTERN.test(from))
    return { status: "closed" };
  const { source } = config;
  switch (source.kind) {
    case "off":
      return { status: "closed" };
    case "fixture":
      return { status: "open", page: fixturePage(from, deps.now()) };
    case "remote":
      return cache.read(`${config.slug}|${from ?? ""}`, deps.now(), () =>
        fetchPage(source.baseUrl, config.slug, from, deps),
      );
  }
}

async function fetchPage(
  baseUrl: string,
  slug: string,
  from: string | undefined,
  deps: Deps,
): Promise<PageRead> {
  const url = new URL(`${baseUrl}/book/${encodeURIComponent(slug)}`);
  url.searchParams.set("days", String(WEEK));
  if (from) url.searchParams.set("from", from);
  try {
    const response = await deps.fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404 || response.status === 503) {
      return { status: "closed" };
    }
    if (!response.ok) return { status: "unavailable" };
    const parsed = bookingPageSchema.safeParse(await response.json());
    return parsed.success
      ? { status: "open", page: parsed.data }
      : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * The visitor's address: Vercel's `x-forwarded-for` first entry, else
 * `x-real-ip`. Vercel sets both itself, so a visitor can't choose them.
 */
// Vercel's edge sets x-real-ip and overwrites any the visitor sends, so it
// leads. x-forwarded-for's first entry is the fallback off Vercel.
export function clientIpFrom(headers: Headers): string | undefined {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  return nonEmpty(headers.get("x-forwarded-for")?.split(",")[0]?.trim());
}

function nonEmpty(value: string | null | undefined): string | undefined {
  return value === "" || value === null ? undefined : value;
}

export const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type ChallengeResult =
  | { ok: true }
  | { ok: false; code: "challenge" | "closed" | "unavailable" };

/**
 * Checks a Turnstile token with Cloudflare. Without a secret, development
 * skips the check and production refuses, so a misconfigured deployment
 * never books unguarded.
 */
export async function verifyTurnstile(
  config: BookingConfig,
  token: string | undefined,
  remoteIp: string | undefined,
  deps: Pick<Deps, "fetch"> = defaultDeps,
): Promise<ChallengeResult> {
  if (!config.turnstileSecret) {
    return config.production ? { ok: false, code: "closed" } : { ok: true };
  }
  if (!token) return { ok: false, code: "challenge" };
  const body = new URLSearchParams({
    secret: config.turnstileSecret,
    response: token,
  });
  if (remoteIp) body.set("remoteip", remoteIp);
  try {
    const response = await deps.fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { ok: false, code: "unavailable" };
    const answer = (await response.json()) as { success?: unknown };
    return answer.success === true
      ? { ok: true }
      : { ok: false, code: "challenge" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export type BookingRequest = BookingFields & {
  requestId: string;
  turnstileToken?: string;
};

const CHALLENGE_MESSAGES = {
  challenge: MESSAGES.challenge,
  closed: MESSAGES.closed,
  unavailable: MESSAGES.unavailable,
} as const;

/** Books through the deployment, after the person check. */
export async function submitBooking(
  config: BookingConfig,
  request: BookingRequest,
  clientIp: string | undefined,
  deps: Deps = defaultDeps,
  cache: PageCache = sharedCache,
): Promise<BookResult> {
  const { source } = config;
  if (source.kind === "off") {
    return { ok: false, code: "closed", message: MESSAGES.closed };
  }
  if (!REQUEST_ID.test(request.requestId)) {
    return {
      ok: false,
      code: "invalid",
      message: "Send the booking again.",
    };
  }
  const challenge = await verifyTurnstile(
    config,
    request.turnstileToken,
    clientIp,
    deps,
  );
  if (!challenge.ok) {
    return {
      ok: false,
      code: challenge.code,
      message: CHALLENGE_MESSAGES[challenge.code],
    };
  }
  const result =
    source.kind === "fixture"
      ? fixtureBook(request, deps.now())
      : await postBooking(source.baseUrl, config, request, clientIp, deps);
  // A booking, or a time someone else just took, changes the open time.
  if (result.ok || result.code === "taken") cache.forget(config.slug);
  return result;
}

/** The headers Daybreak trusts a visitor's address from. */
export function proxyHeaders(
  config: Pick<BookingConfig, "proxySecret">,
  clientIp: string | undefined,
): Record<string, string> {
  if (!config.proxySecret) return {};
  return {
    "X-Daybreak-Booking-Proxy": config.proxySecret,
    ...(clientIp ? { "X-Daybreak-Booking-Client": clientIp } : {}),
  };
}

async function postBooking(
  baseUrl: string,
  config: BookingConfig,
  request: BookingRequest,
  clientIp: string | undefined,
  deps: Deps,
): Promise<BookResult> {
  const linkedin = request.linkedin?.trim();
  try {
    const response = await deps.fetch(
      `${baseUrl}/book/${encodeURIComponent(config.slug)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...proxyHeaders(config, clientIp),
        },
        body: JSON.stringify({
          start: request.start,
          length: request.length,
          name: request.name,
          email: request.email,
          about: request.about,
          ...(linkedin ? { linkedin } : {}),
          requestId: request.requestId,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      },
    );
    const body: unknown = await response.json().catch(() => null);
    return readBookingAnswer(response.status, body);
  } catch {
    return { ok: false, code: "unavailable", message: MESSAGES.unavailable };
  }
}
