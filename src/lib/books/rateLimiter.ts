import PQueue from "p-queue";

// All book clients share one queue. Space individual requests below Notion's
// three-per-second limit and hold the queue during a server-requested cooldown.
const notionQueue = new PQueue({
  concurrency: 1,
  intervalCap: 1,
  interval: 350,
});

/**
 * Fetch with exponential backoff for rate limit errors
 */
export async function fetchWithBackoff<T>(
  fetchFn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  return notionQueue.add(async () => {
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fetchFn();
      } catch (error: unknown) {
        lastError = error;

        // Check if it's a rate limit error (429), possibly wrapped by a caller
        // that rethrew with `{ cause }`.
        const rateLimit = findRateLimitError(error);

        if (rateLimit) {
          if (attempt === maxRetries - 1) throw error;
          // Notion says how long the window lasts; guessing 1s/2s/4s under it
          // burns every retry inside the same window and the call fails anyway.
          const backoffMs =
            retryAfterMs(rateLimit) ?? Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          console.warn(
            `Rate limited, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        // Non-rate-limit error, throw immediately
        throw error;
      }
    }

    throw lastError;
  });
}

/**
 * The Notion 429 behind an error, walking `cause` links, or undefined when
 * the failure is something else.
 */
export function findRateLimitError(error: unknown): unknown {
  for (let e = error, depth = 0; e && depth < 5; depth++) {
    const { code, status, cause } = e as {
      code?: string;
      status?: number;
      cause?: unknown;
    };
    if (code === "rate_limited" || status === 429) return e;
    e = cause;
  }
  return undefined;
}

/**
 * The wait Notion asked for on a 429, padded so the retry lands just past
 * the window. Notion puts it in the error body (`additional_data.retry_after`,
 * whole seconds); the `Retry-After` header is the fallback because the SDK
 * has been seen surfacing an empty header set. Undefined when neither is
 * usable.
 */
export function retryAfterMs(error: unknown): number | undefined {
  const { additional_data, headers } = error as {
    additional_data?: { retry_after?: string | number };
    headers?: { get?: (name: string) => string | null };
  };
  const seconds = Number(
    additional_data?.retry_after ?? headers?.get?.("retry-after"),
  );
  return Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000 + 250
    : undefined;
}

export { notionQueue };
