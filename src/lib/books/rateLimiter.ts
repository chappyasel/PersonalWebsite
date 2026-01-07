import PQueue from "p-queue";

// Notion allows 2700 API calls per 15 minutes (3 req/sec average)
// Use parallel processing with concurrency limit for faster syncing
const notionQueue = new PQueue({
  concurrency: 20, // Process up to 20 requests in parallel
  // No interval/intervalCap - let requests run freely
  // Notion will rate limit us if we exceed 2700/15min, and we'll backoff
});

/**
 * Fetch with exponential backoff for rate limit errors
 */
export async function fetchWithBackoff<T>(
  fetchFn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await notionQueue.add(fetchFn);
    } catch (error: unknown) {
      lastError = error;

      // Check if it's a rate limit error (429)
      const isRateLimited =
        (error as { code?: string }).code === "rate_limited" ||
        (error as { status?: number }).status === 429;

      if (isRateLimited) {
        const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
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
}

export { notionQueue };
