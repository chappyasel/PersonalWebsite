/**
 * Bounded cover download.
 *
 * Jackets come from a spread of third-party hosts, none of them ours, so every
 * request carries a deadline and a byte ceiling, and every failure comes back
 * as a value rather than an exception. A cover that will not load is a
 * "failed" row in the manifest; it never becomes a drawn placeholder.
 */

export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_COVER_BYTES = 8 * 1024 * 1024;
export const DEFAULT_ATTEMPTS = 3;

export type FetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  attempts?: number;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected in tests so retry backoff costs no wall clock. */
  sleep?: (ms: number) => Promise<void>;
};

export type CoverFetchResult =
  | { ok: true; bytes: Buffer; contentType: string | null; attempts: number }
  | { ok: false; reason: string; attempts: number };

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One attempt. Separated so the retry loop stays readable and so the size
 * ceiling is enforced in exactly one place.
 */
async function attemptFetch(
  url: string,
  timeoutMs: number,
  maxBytes: number,
  fetchImpl: typeof fetch,
): Promise<
  | { ok: true; bytes: Buffer; contentType: string | null }
  | { ok: false; reason: string; retryable: boolean }
> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        // Some jacket hosts 403 a bare fetch agent.
        "user-agent":
          "chappyasel-book-cover-emojis/1.0 (+https://books.chappyasel.com)",
        accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `request failed: ${reason}`, retryable: true };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: `http ${response.status}`,
      retryable: RETRYABLE_STATUS.has(response.status),
    };
  }

  const advertised = Number(response.headers.get("content-length") ?? 0);
  if (advertised > maxBytes) {
    return {
      ok: false,
      reason: `too large (${advertised} bytes advertised)`,
      retryable: false,
    };
  }

  // Read the body in chunks and stop the moment it passes the ceiling, so a
  // host that lies in (or omits) content-length cannot make us buffer a file
  // we would only throw away.
  const body = response.body;
  if (!body) {
    return { ok: false, reason: "response had no body", retryable: true };
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel("over size ceiling").catch(() => undefined);
        return {
          ok: false,
          reason: `too large (over ${maxBytes} bytes)`,
          retryable: false,
        };
      }
      chunks.push(value);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `body read failed: ${reason}`, retryable: true };
  }
  if (received === 0) {
    return { ok: false, reason: "empty response body", retryable: true };
  }
  return {
    ok: true,
    bytes: Buffer.concat(chunks),
    contentType: response.headers.get("content-type"),
  };
}

export async function fetchCover(
  url: string,
  options: FetchOptions = {},
): Promise<CoverFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_COVER_BYTES;
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  let last = "no attempt made";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await attemptFetch(url, timeoutMs, maxBytes, fetchImpl);
    if (result.ok) {
      return {
        ok: true,
        bytes: result.bytes,
        contentType: result.contentType,
        attempts: attempt,
      };
    }
    last = result.reason;
    if (!result.retryable || attempt === attempts) {
      return { ok: false, reason: last, attempts: attempt };
    }
    await sleep(400 * attempt);
  }
  return { ok: false, reason: last, attempts };
}
