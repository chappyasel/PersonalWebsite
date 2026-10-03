import {
  MutationCache,
  QueryCache,
  QueryClient,
  defaultShouldDehydrateQuery,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

/** Called once per query or mutation that fails after its retries. */
export type RequestFailureHandler = (
  error: unknown,
  key: readonly unknown[] | undefined,
  source: "query" | "mutation",
) => void;

/**
 * The browser passes `onRequestFailure` to report failures; the server
 * renders without it, since its own failures surface through the render.
 */
export const createQueryClient = (onRequestFailure?: RequestFailureHandler) =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) =>
        onRequestFailure?.(error, query.queryKey, "query"),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        onRequestFailure?.(error, mutation.options.mutationKey, "mutation"),
    }),
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
        // 24 hours - prevents garbage collection before persistence can save
        gcTime: 1000 * 60 * 60 * 24,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
