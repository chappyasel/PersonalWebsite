import type { Instrumentation } from "next";

/**
 * Next calls this for every error that escapes a server render, route
 * handler, server action, or the proxy. Errors a route catches itself (the
 * cron jobs, tRPC) report from their own catch blocks.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  _request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportServerError } = await import("~/server/errorReporting");
  const digest =
    error instanceof Error && "digest" in error
      ? String(error.digest)
      : undefined;
  // The route pattern, never the request path: a Dad journal path names the
  // entry, and a pattern locates the failure as well.
  await reportServerError(error, {
    source: "request",
    route: context.routePath,
    label: context.routeType,
    digest,
  });
};
