/**
 * The two Notion endpoints this feature needs that the SDK does not type.
 *
 * `GET /v1/custom_emojis` is real and paginated, and it is the only way to
 * learn whether an emoji already exists. The SDK exposes no method for it, so
 * these are raw fetches, the same route the proven uploader takes.
 *
 * Reading the library is also the crash-safety mechanism. The browser can
 * finish an upload and the process can die before a receipt is written; on the
 * next run the emoji is simply found by name and reused, so a retry never
 * creates a duplicate.
 */

/**
 * Custom emoji endpoints need a recent API version. 2022-06-28 does not serve
 * /v1/custom_emojis; this is the version the proven uploader uses and the
 * preflight probe confirms against the live API.
 */
export const NOTION_VERSION = "2026-03-11";

export type CustomEmoji = { id: string; name: string; url: string };

export type NotionFetch = typeof fetch;

export type EmojiApiOptions = {
  token: string;
  fetchImpl?: NotionFetch;
  /** Injected in tests so backoff costs no wall clock. */
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  timeoutMs?: number;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class NotionAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionAuthError";
  }
}

/**
 * One request, with Notion's own pacing honored.
 *
 * A 429 carries Retry-After in seconds. Waiting exactly that long is the
 * difference between backing off and being told to back off again, so the
 * header wins over any local guess whenever it is present. A 401 or 403 stops
 * immediately: retrying a credential problem only turns one clear failure into
 * a slow one.
 */
async function request<T>(
  path: string,
  init: RequestInit,
  options: EmojiApiOptions,
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = options.maxAttempts ?? 4;
  const timeoutMs = options.timeoutMs ?? 30_000;

  let lastError = "no attempt made";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(`https://api.notion.com${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          authorization: `Bearer ${options.token}`,
          "notion-version": NOTION_VERSION,
          "content-type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === maxAttempts) break;
      await sleep(500 * attempt);
      continue;
    }

    if (response.ok) return (await response.json()) as T;

    if (response.status === 401 || response.status === 403) {
      throw new NotionAuthError(
        `Notion rejected the integration token (http ${response.status})`,
      );
    }

    if (response.status === 429) {
      const header = response.headers.get("retry-after");
      const seconds = header ? Number(header) : Number.NaN;
      const waitMs = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 1000 * attempt;
      lastError = `http 429, retry-after ${header ?? "absent"}`;
      if (attempt === maxAttempts) break;
      await sleep(waitMs);
      continue;
    }

    lastError = `http ${response.status}`;
    if (response.status < 500 || attempt === maxAttempts) break;
    await sleep(500 * attempt);
  }
  throw new Error(`Notion request failed: ${path}: ${lastError}`);
}

/** Every custom emoji in the workspace the token belongs to, by name. */
export async function listCustomEmojis(
  options: EmojiApiOptions,
): Promise<Map<string, CustomEmoji>> {
  const found = new Map<string, CustomEmoji>();
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const page = await request<{
      results: CustomEmoji[];
      next_cursor: string | null;
    }>(`/v1/custom_emojis?${query.toString()}`, { method: "GET" }, options);
    for (const emoji of page.results) found.set(emoji.name, emoji);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return found;
}

export type NotionParent =
  | { type: "data_source_id"; data_source_id: string }
  | { type: "database_id"; database_id: string }
  | { type: "page_id"; page_id: string }
  | { type: "workspace"; workspace: true }
  | { type: string };

export type NotionPage = {
  id: string;
  /** Raw icon JSON exactly as the API returns it. Decode before use. */
  icon: unknown;
  parent?: NotionParent;
  in_trash?: boolean;
  archived?: boolean;
};

export async function getPage(
  pageId: string,
  options: EmojiApiOptions,
): Promise<NotionPage> {
  return request<NotionPage>(`/v1/pages/${pageId}`, { method: "GET" }, options);
}

export async function setPageCustomEmoji(
  pageId: string,
  emojiId: string,
  options: EmojiApiOptions,
): Promise<NotionPage> {
  return request<NotionPage>(
    `/v1/pages/${pageId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        icon: { type: "custom_emoji", custom_emoji: { id: emojiId } },
      }),
    },
    options,
  );
}

/** Who the token is, and which workspace it can see. */
export async function whoAmI(
  options: EmojiApiOptions,
): Promise<{ workspace_name?: string; workspace_id?: string; name?: string }> {
  const me = await request<{
    bot?: { workspace_name?: string; workspace_id?: string };
    name?: string;
  }>("/v1/users/me", { method: "GET" }, options);
  return {
    workspace_name: me.bot?.workspace_name,
    workspace_id: me.bot?.workspace_id,
    name: me.name,
  };
}
