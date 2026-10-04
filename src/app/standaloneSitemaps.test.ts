import { config, proxy } from "../proxy";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import booksSitemap from "./books/sitemap";
import liftingSitemap from "./weightlifting/sitemap";

// Synthetic records only. Importing this suite never loads the DB module.
vi.mock("~/server/db", () => ({
  db: {
    query: {
      books: {
        findMany: vi.fn(async () => [
          {
            id: "example-book",
            lastEditedTime: new Date("2026-01-01T00:00:00Z"),
          },
        ]),
      },
    },
  },
}));
vi.mock("~/env", () => ({ env: { DAD_CONTENT_PASSWORD: "test-only" } }));

describe("standalone sitemap discovery", () => {
  it.each(["books", "weightlifting"])(
    "routes the advertised %s sitemap to its section",
    async (site) => {
      const url = `https://${site}.chappyasel.com/sitemap.xml`;
      expect(
        unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }),
      ).toBe(true);
      const response = await proxy(new NextRequest(url));
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        `https://${site}.chappyasel.com/${site}/sitemap.xml`,
      );
      expect(readFileSync("public/robots.txt", "utf8")).toContain(
        `Sitemap: ${url}`,
      );
    },
  );

  it("keeps ordinary static assets outside the proxy and the main sitemap on www", async () => {
    for (const path of [
      "/robots.txt",
      "/images/cover.jpg",
      "/_next/static/chunk.js",
      "/favicon.ico",
    ]) {
      expect(
        unstable_doesMiddlewareMatch({
          config,
          nextConfig: {},
          url: `https://books.chappyasel.com${path}`,
        }),
      ).toBe(false);
    }
    const response = await proxy(
      new NextRequest("https://www.chappyasel.com/sitemap.xml"),
    );
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("lists canonical roots and synthetic book details on their own hosts", async () => {
    const books = await booksSitemap();
    expect(books.map(({ url }) => url)).toEqual([
      "https://books.chappyasel.com",
      "https://books.chappyasel.com/example-book",
    ]);
    expect(books[0]).not.toHaveProperty("lastModified");
    expect(books[1]?.lastModified).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(liftingSitemap()).toEqual([
      {
        url: "https://weightlifting.chappyasel.com/",
        changeFrequency: "daily",
        priority: 1,
      },
    ]);
  });
});
