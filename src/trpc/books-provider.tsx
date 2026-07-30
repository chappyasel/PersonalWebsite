"use client";

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState } from "react";
import SuperJSON from "superjson";

import {
  api,
  createTRPCClient,
  getQueryClient,
} from "~/trpc/react";

const booksPersister =
  typeof window === "undefined"
    ? undefined
    : createSyncStoragePersister({
        storage: window.localStorage,
        key: "BOOKS_CACHE",
        serialize: SuperJSON.stringify,
        deserialize: SuperJSON.parse,
      });

export function BooksTRPCProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(createTRPCClient);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: booksPersister!,
        maxAge: 1000 * 60 * 60 * 24,
        buster: "v2-server-initial-data",
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
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
      }}
    >
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {children}
      </api.Provider>
    </PersistQueryClientProvider>
  );
}
