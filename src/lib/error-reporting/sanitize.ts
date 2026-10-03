/**
 * What an error report may carry. Every `$exception` sent to PostHog passes
 * through `buildErrorReport`, on the client and on the server.
 *
 * Dad and YouTube are private areas. A report from either keeps the error's
 * type, its stack frames, and the area root, and drops every message. A
 * message can quote a journal entry, a video title, or a search term, and
 * nothing at the call site can rule that out. Elsewhere the message is kept
 * once the parts that can carry data are scrubbed: SQL parameters, query
 * strings, URL credentials, emails, and tokens.
 *
 * Reports never carry a procedure's input or a request body.
 */

export const PRIVATE_AREAS = ["dad", "youtube"] as const;

export type ErrorSource =
  /** A React error boundary (an `error.tsx`). */
  | "boundary"
  /** A client tRPC query that still failed after its retries. */
  | "query"
  | "mutation"
  /** A tRPC procedure that failed on the server. */
  | "trpc"
  /** Next's `onRequestError`: renders, route handlers, actions, the proxy. */
  | "request"
  | "cron"
  /** `orEmpty` rendered a page without the data it failed to load. */
  | "degrade";

export type ErrorReportContext = {
  source: ErrorSource;
  /** A pathname or route pattern. Private paths collapse to the area root. */
  route?: string;
  /** The tRPC procedure path, for example "books.getById". */
  procedure?: string;
  /** The tRPC error code, for example "INTERNAL_SERVER_ERROR". */
  code?: string;
  /** Next's error digest, the "Error ID" the error screens show. */
  digest?: string;
  /** A fixed label from the caller: a boundary name, an `orEmpty` label. */
  label?: string;
  /** Drop the message outside the private areas too, for errors that may
   * quote credentials or signed URLs. */
  redactMessage?: boolean;
  /** Group every occurrence under one PostHog issue. Errors whose stacks all
   * end in the same library code (every failed query) need one, or they
   * collapse into a single issue. */
  fingerprint?: string;
  /** The issue's name in PostHog, used only when the issue is created. */
  issueName?: string;
};

export type ErrorReport = {
  error: Error;
  properties: Record<string, string | boolean>;
  /** Equal for repeats of one failure; the reporters throttle on it. */
  key: string;
};

const REDACTED = "[redacted]";
const MAX_MESSAGE_LENGTH = 500;
const MAX_CAUSE_DEPTH = 3;

/** Production reports by default; a dev server opts in for a test run. */
export function errorReportingEnabled(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_REPORT_DEV_ERRORS === "1"
  );
}

/** The path segments that name a section. API routes are named by the
 * segment after `/api`, so `/api/dad-images/...` belongs to `dad-images`. */
function rootSegments(pathname: string): string[] {
  const segments = pathname.split("/").filter(Boolean);
  return segments.slice(0, segments[0] === "api" ? 2 : 1);
}

/**
 * The section a path or tRPC procedure belongs to: "/books/abc" and
 * "books.getById" are both "books", and "/" is "home".
 */
export function errorArea(location: string | undefined): string | null {
  if (!location) return null;
  if (!location.startsWith("/")) return location.split(".")[0] ?? null;
  return rootSegments(location).at(-1) ?? "home";
}

export function isPrivateArea(area: string | null): boolean {
  return (
    area !== null &&
    PRIVATE_AREAS.some((root) => area === root || area.startsWith(`${root}-`))
  );
}

/** "/dad/journal/2003/some-entry" becomes "/dad". Public paths pass through. */
export function collapsePrivatePath(pathname: string): string {
  const root = rootSegments(pathname);
  return isPrivateArea(root.at(-1) ?? null) ? `/${root.join("/")}` : pathname;
}

function scrubUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return raw.split(/[?#]/)[0] ?? raw;
  }
}

/**
 * Removes what a message can carry besides the failure itself.
 *
 * Drizzle reports "Failed query: <sql>\nparams: <values>". The SQL is code
 * and stays; the bound values are the likeliest place for real data, so
 * everything after "params:" goes, whatever came before it. Postgres quotes
 * the offending value in double quotes ("invalid input syntax for type
 * uuid: \"...\""), so double-quoted text goes too, everywhere except
 * Drizzle's SQL, where the quotes hold identifiers.
 */
export function scrubErrorMessage(message: string): string {
  const params = message.search(/\bparams:/);
  const head = params === -1 ? message : message.slice(0, params);
  const kept = head.startsWith("Failed query:")
    ? head
    : head.replace(/"[^"\n]*"/g, `"${REDACTED}"`);
  const text = (params === -1 ? kept : `${kept}params: ${REDACTED}`)
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`]+/gi, scrubUrl)
    .replace(/[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\bBearer\s+\S+/gi, `Bearer ${REDACTED}`)
    .replace(/[A-Za-z0-9_-]{32,}/g, "[token]");
  return text.length > MAX_MESSAGE_LENGTH
    ? `${text.slice(0, MAX_MESSAGE_LENGTH)}…`
    : text;
}

const V8_FRAME = /^\s+at\s/;
const GECKO_FRAME = /@\S*:\d+(?::\d+)?$/;

/**
 * Just the frames. A V8 stack opens with "Name: message", and that header
 * can run over several lines, so the message would leak through the stack
 * even after it was redacted. Firefox and Safari stacks have no header.
 */
function stackFrames(stack: string): string[] {
  const lines = stack.split("\n");
  const firstV8 = lines.findIndex((line) => V8_FRAME.test(line));
  if (firstV8 !== -1) return lines.slice(firstV8);
  return lines.filter((line) => GECKO_FRAME.test(line.trim()));
}

/**
 * A copy of the error that is safe to send: its name, a scrubbed or
 * redacted message, its stack frames, and the same treatment for its causes.
 */
export function sanitizeError(
  error: unknown,
  redact: boolean,
  depth = 0,
): Error {
  const source = error instanceof Error ? error : null;
  const name = source ? source.name || "Error" : "NonErrorThrown";
  const message = redact
    ? REDACTED
    : scrubErrorMessage(source ? source.message : String(error));

  const clean = new Error(message);
  clean.name = name;
  const frames = source?.stack ? stackFrames(source.stack) : [];
  clean.stack = [`${name}: ${message}`, ...frames].join("\n");
  if (source?.cause != null && depth < MAX_CAUSE_DEPTH) {
    clean.cause = sanitizeError(source.cause, redact, depth + 1);
  }
  return clean;
}

export function buildErrorReport(
  error: unknown,
  context: ErrorReportContext,
  { runtime, environment }: { runtime: "browser" | "server"; environment: string },
): ErrorReport {
  const procedureArea = errorArea(context.procedure);
  const routeArea = errorArea(context.route);
  const isPrivate = isPrivateArea(procedureArea) || isPrivateArea(routeArea);
  const clean = sanitizeError(
    error,
    isPrivate || context.redactMessage === true,
  );
  const route = context.route ? collapsePrivatePath(context.route) : undefined;
  const area = procedureArea ?? routeArea;

  const properties: Record<string, string | boolean> = {
    error_source: context.source,
    error_runtime: runtime,
    error_private: isPrivate,
    environment,
  };
  if (area) properties.error_area = area;
  if (route) properties.error_route = route;
  if (context.procedure) properties.trpc_procedure = context.procedure;
  if (context.code) properties.trpc_code = context.code;
  if (context.digest) properties.error_digest = context.digest;
  if (context.label) properties.error_label = context.label;
  if (context.fingerprint) {
    properties.$exception_fingerprint = context.fingerprint;
  }
  if (context.issueName) properties.$issue_name = context.issueName;

  return {
    error: clean,
    properties,
    key: [
      context.source,
      context.procedure ?? route ?? "",
      context.code ?? "",
      clean.name,
      clean.message,
    ].join("|"),
  };
}

/** tRPC keys a query as `[["books", "getById"], { input, type }]`. Only the
 * path is kept; the input stays behind. */
export function procedureFromKey(
  key: readonly unknown[] | undefined,
): string | undefined {
  const path = key?.[0];
  return Array.isArray(path) &&
    path.length > 0 &&
    path.every((segment) => typeof segment === "string")
    ? path.join(".")
    : undefined;
}

/** The code and status a TRPCClientError carries from the server. A
 * response that never arrived has neither. */
export function trpcErrorFacts(error: unknown): {
  code?: string;
  httpStatus?: number;
} {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return {};
  }
  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return {};
  const { code, httpStatus } = data as { code?: unknown; httpStatus?: unknown };
  return {
    code: typeof code === "string" ? code : undefined,
    httpStatus: typeof httpStatus === "number" ? httpStatus : undefined,
  };
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      (error.cause instanceof Error && error.cause.name === "AbortError"))
  );
}

/**
 * Whether a failed client request is worth a report. A 4xx is the request's
 * fault (a wrong password, a missing book) and an offline browser is the
 * network's. Server faults and responses that never arrived are reported.
 */
export function isReportableRequestFailure(
  error: unknown,
  online: boolean,
): boolean {
  if (!online || isAbort(error)) return false;
  const { httpStatus } = trpcErrorFacts(error);
  return httpStatus === undefined || httpStatus >= 500;
}
