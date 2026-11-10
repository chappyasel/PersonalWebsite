import { TRPCClientError } from "@trpc/client";

/**
 * The server's own refusal, such as a week with weigh-ins in the way or a
 * stale plan, or a plain fallback. Refusals name dates, never weights, and a
 * validation dump from zod never reaches the page.
 */
export function failure(error: unknown, fallback: string) {
  if (
    error instanceof TRPCClientError &&
    !(error.data as { zodError?: unknown } | undefined)?.zodError &&
    ["BAD_REQUEST", "NOT_FOUND", "CONFLICT"].includes(
      (error.data as { code?: string } | undefined)?.code ?? "",
    )
  ) {
    return error.message;
  }
  return fallback;
}

/** The server refused an edit made from a plan or list that has changed since. */
export const isConflict = (error: unknown) =>
  error instanceof TRPCClientError &&
  (error.data as { code?: string } | undefined)?.code === "CONFLICT";
