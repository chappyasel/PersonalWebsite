import { NextResponse } from "next/server";

import { reportServerErrorAfterResponse } from "~/server/errorReporting";

/**
 * What every route under `src/app/api/weight-log/` sends: owner data, so no
 * cache keeps it and no search engine indexes it. Refusals carry the same
 * headers.
 */
export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
};

export function reply(body: unknown, status = 200, extra: HeadersInit = {}) {
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...extra },
  });
}

/**
 * A handler that refuses its method with 405 and the methods the route
 * serves. Each route exports it for every method it doesn't serve, OPTIONS
 * included, because Next's own answers for those carry none of the headers
 * above: OPTIONS would be a bare 204 and the rest a bare 405.
 */
export function refuseMethod(allow: string, error: string) {
  return () => reply({ error }, 405, { Allow: allow });
}

/**
 * Log and report what failed with only the step and the error's code, never
 * the error itself: a Postgres error's detail can quote the row it refused,
 * weight included. The report is a fresh error holding the same line, sent
 * after the response so the Shortcut never waits on it.
 */
export function logFailure(route: string, step: string, error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "unknown";
  const line = `${route} route: ${step} failed (${code})`;
  console.error(line);
  reportServerErrorAfterResponse(new Error(line), {
    source: "request",
    route: `/api/weight-log/${route}`,
    label: step,
  });
}
