import { Client } from "@notionhq/client";

import { fetchWithBackoff } from "./rateLimiter";
import { env } from "~/env";

class BookNotionClient extends Client {
  override request<ResponseBody extends object>(
    ...args: Parameters<Client["request"]>
  ): Promise<ResponseBody> {
    // Queue individual API calls, including nested block pagination. Retrying
    // a whole page-to-Markdown conversion repeats all its successful requests.
    return fetchWithBackoff(() => super.request<ResponseBody>(...args));
  }
}

/**
 * The shared-queue client. A caller may pin a newer API version for an
 * endpoint that needs one; the default stays the SDK's.
 */
export function createBookNotionClient(notionVersion?: string): Client {
  return new BookNotionClient({
    auth: env.NOTION_API_KEY,
    notionVersion,
    timeoutMs: 15_000,
    fetch: (url, init) =>
      fetch(url, {
        ...init,
        signal: AbortSignal.timeout(15_000),
      }),
  });
}
