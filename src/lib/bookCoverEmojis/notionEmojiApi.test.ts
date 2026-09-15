import {
  NotionAuthError,
  listCustomEmojis,
  setPageCustomEmoji,
} from "./notionEmojiApi";
import { describe, expect, it, vi } from "vitest";

const TOKEN = "ntn_FAKEfake1234567890abcdefGHIJKL";
const noSleep = () => Promise.resolve();

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

const page = (results: unknown[], next: string | null = null) =>
  json({ results, next_cursor: next });

describe("listCustomEmojis", () => {
  it("follows pagination and keys the library by name", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([{ id: "1", name: "book-a", url: "u1" }], "cursor-2"))
      .mockResolvedValueOnce(page([{ id: "2", name: "book-b", url: "u2" }]));
    const library = await listCustomEmojis({ token: TOKEN, fetchImpl, sleep: noSleep });
    expect([...library.keys()]).toEqual(["book-a", "book-b"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const second = fetchImpl.mock.calls[1]?.[0] as string;
    expect(second).toContain("start_cursor=cursor-2");
  });

  it("sends the token as a bearer header, never in the URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(page([]));
    await listCustomEmojis({ token: TOKEN, fetchImpl, sleep: noSleep });
    const [url, init] = fetchImpl.mock.calls[0]! as [string, RequestInit];
    expect(url).not.toContain(TOKEN);
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
  });
});

describe("rate limiting", () => {
  it("waits exactly as long as Retry-After says", async () => {
    const waits: number[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "retry-after": "7" } }),
      )
      .mockResolvedValueOnce(page([]));
    await listCustomEmojis({
      token: TOKEN,
      fetchImpl,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(waits).toEqual([7000]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falls back to its own backoff when the header is missing or junk", async () => {
    const waits: number[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "retry-after": "soon" } }),
      )
      .mockResolvedValueOnce(page([]));
    await listCustomEmojis({
      token: TOKEN,
      fetchImpl,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(waits).toEqual([1000, 2000]);
  });

  it("gives up after the attempt budget rather than hammering", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 429, headers: { "retry-after": "1" } }));
    await expect(
      listCustomEmojis({ token: TOKEN, fetchImpl, sleep: noSleep, maxAttempts: 3 }),
    ).rejects.toThrow(/429/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries a 500 but not a 400", async () => {
    const server = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(page([]));
    await listCustomEmojis({ token: TOKEN, fetchImpl: server, sleep: noSleep });
    expect(server).toHaveBeenCalledTimes(2);

    const client = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 400 }));
    await expect(
      listCustomEmojis({ token: TOKEN, fetchImpl: client, sleep: noSleep }),
    ).rejects.toThrow(/http 400/);
    expect(client).toHaveBeenCalledTimes(1);
  });
});

describe("credential failures", () => {
  it("stops immediately on 401 rather than retrying a bad token", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 401 }));
    await expect(
      listCustomEmojis({ token: TOKEN, fetchImpl, sleep: noSleep }),
    ).rejects.toBeInstanceOf(NotionAuthError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops immediately on 403 too", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 403 }));
    await expect(
      setPageCustomEmoji("page-1", "e1", { token: TOKEN, fetchImpl, sleep: noSleep }),
    ).rejects.toBeInstanceOf(NotionAuthError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("setPageCustomEmoji", () => {
  it("patches the page with a custom_emoji icon, by id", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ id: "page-1", icon: {} }));
    await setPageCustomEmoji("page-1", "emoji-9", { token: TOKEN, fetchImpl, sleep: noSleep });
    const [url, init] = fetchImpl.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://api.notion.com/v1/pages/page-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      icon: { type: "custom_emoji", custom_emoji: { id: "emoji-9" } },
    });
  });
});
