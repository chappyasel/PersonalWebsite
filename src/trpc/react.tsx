"use client";

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { type QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { loggerLink, unstable_httpBatchStreamLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import SuperJSON from "superjson";

import { type AppRouter } from "~/server/api/root";

import { createQueryClient } from "./query-client";

let clientQueryClientSingleton: QueryClient | undefined = undefined;
const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return createQueryClient();
  }
  // Browser: use singleton pattern to keep the same query client
  return (clientQueryClientSingleton ??= createQueryClient());
};

export const api = createTRPCReact<AppRouter>();

// Create persister for localStorage (client-side only)
// Must use SuperJSON to match our React Query serialization
const persister =
  typeof window !== "undefined"
    ? createSyncStoragePersister({
        storage: window.localStorage,
        key: "BOOKS_CACHE",
        serialize: SuperJSON.stringify,
        deserialize: SuperJSON.parse,
      })
    : undefined;

/**
 * Inference helper for inputs.
 *
 * @example type HelloInput = RouterInputs['example']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 *
 * @example type HelloOutput = RouterOutputs['example']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        unstable_httpBatchStreamLink({
          transformer: SuperJSON,
          url: getBaseUrl() + "/api/trpc",
          headers: () => {
            const headers = new Headers();
            headers.set("x-trpc-source", "nextjs-react");
            return headers;
          },
        }),
      ],
    }),
  );

  // Persistence options - cache books queries except individual book details
  const persistOptions = persister
    ? {
        persister,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        buster: "v1", // Change to invalidate old caches
        dehydrateOptions: {
          shouldDehydrateQuery: (query: {
            queryKey: unknown;
            state: { status: string };
          }) => {
            // Persist all books queries EXCEPT getById (which has large markdown notes)
            const queryKey = query.queryKey as unknown[];
            return (
              query.state.status === "success" &&
              Array.isArray(queryKey) &&
              Array.isArray(queryKey[0]) &&
              queryKey[0][0] === "books" &&
              queryKey[0][1] !== "getById"
            );
          },
        },
      }
    : undefined;

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions ?? { persister: undefined as never }}
    >
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {props.children}
      </api.Provider>
    </PersistQueryClientProvider>
  );
}

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
