import { afterEach, expect, it, vi } from "vitest";

import { fetchBookCover } from "./coverFetcher";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("takes Google's first volume matching the title and surname when Amazon has none", async () => {
  vi.stubEnv("GOOGLE_BOOKS_API_KEY", "books-key");
  const fetcher = vi.fn(async (url: string) => {
    if (!url.includes("googleapis")) return new Response("", { status: 404 });
    return new Response(
      JSON.stringify({
        items: [
          {
            volumeInfo: {
              title: "Summary of A World Without Email",
              authors: ["Book Summaries"],
              imageLinks: { thumbnail: "http://books.google.com/summary" },
            },
          },
          {
            volumeInfo: {
              title: "A World Without Email: Reimagining Work",
              authors: ["Cal Newport"],
              imageLinks: {
                thumbnail:
                  "http://books.google.com/books/content?id=a&zoom=1&edge=curl",
              },
            },
          },
        ],
      }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  expect(await fetchBookCover("A World Without Email", "Cal Newport")).toBe(
    "https://books.google.com/books/content?id=a&zoom=5",
  );
  const google = new URL(
    fetcher.mock.calls
      .map(([url]) => url)
      .find((url) => url.includes("googleapis"))!,
  );
  expect(google.searchParams.get("q")).toBe(
    '"A World Without Email" "Cal Newport"',
  );
  expect(google.searchParams.get("key")).toBe("books-key");
});
