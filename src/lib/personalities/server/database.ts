import "server-only";

import { createDatabase } from "./store";
import { env } from "~/env";

const globalDatabase = globalThis as typeof globalThis & {
  personalityPostgres?: ReturnType<typeof createDatabase>;
};

export function db() {
  if (!globalDatabase.personalityPostgres) {
    // Development must opt into its own database, rather than silently writing
    // to the hosted DATABASE_URL used by the read-only Books mirror.
    const url =
      env.PERSONALITIES_DATABASE_URL ??
      (process.env.NODE_ENV === "production" ? env.DATABASE_URL : undefined);
    if (!url)
      throw new Error(
        "Configure PERSONALITIES_DATABASE_URL for local development.",
      );
    globalDatabase.personalityPostgres = createDatabase(url);
  }
  return globalDatabase.personalityPostgres;
}
