import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { type NextRequest } from "next/server";

import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { reportServerErrorAfterResponse } from "~/server/errorReporting";

import { env } from "~/env";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError: ({ path, error, type }) => {
      // A 4xx is the caller's mistake (no access cookie, a missing book).
      // Only server faults are logged in production and reported.
      const serverFault = getHTTPStatusCodeFromError(error) >= 500;
      if (env.NODE_ENV === "development" || serverFault) {
        console.error(
          `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`,
        );
      }
      if (!serverFault) return;
      // tRPC wraps a thrown error in a TRPCError; the original carries the
      // type and stack worth grouping on. The input is never sent.
      reportServerErrorAfterResponse(
        error.cause instanceof Error ? error.cause : error,
        {
          source: "trpc",
          procedure: path,
          code: error.code,
          label: type,
        },
      );
    },
  });

export { handler as GET, handler as POST };
