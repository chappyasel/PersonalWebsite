import { proxy } from "../proxy";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Read the real layout metadata without loading providers or server queries.
vi.mock("~/env", () => ({ env: { DAD_CONTENT_PASSWORD: "test-only" } }));
vi.mock("~/lib/site/pageCards", () => ({ loadSitePageCards: vi.fn() }));
vi.mock("~/trpc/books-provider", () => ({ BooksTRPCProvider: vi.fn() }));
vi.mock("~/trpc/react", () => ({ TRPCReactProvider: vi.fn() }));
vi.mock("./books/components/BooksLayoutWrapper", () => ({
  BooksLayoutWrapper: vi.fn(),
}));
vi.mock("./books/components/ModalHost", () => ({ ModalHost: vi.fn() }));
vi.mock("./books/contexts/BookPreviewContext", () => ({
  BookPreviewProvider: vi.fn(),
}));
vi.mock("~/components/site/SitePageCards", () => ({
  SitePageCardsProvider: vi.fn(),
}));

const layouts = {
  manual: () => import("./manual/layout"),
  routine: () => import("./routine/layout"),
  books: () => import("./books/layout"),
  weightlifting: () => import("./weightlifting/layout"),
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("section entry metadata", () => {
  it.each(["manual", "routine"] as const)(
    "gives %s the canonical URL its production HTML redirect serves",
    async (section) => {
      vi.stubEnv("NODE_ENV", "production");
      const { metadata } = await layouts[section]();
      const response = await proxy(
        new NextRequest(`https://${section}.chappyasel.com/`, {
          headers: { accept: "text/html" },
        }),
      );
      const canonical = `https://www.chappyasel.com/${section}`;
      expect(response.headers.get("location")).toBe(canonical);
      expect(metadata.alternates?.canonical).toBe(canonical);
      expect(metadata.openGraph?.url).toBe(canonical);
      // Deep pages and file-based images still resolve on their existing host.
      expect(metadata.metadataBase).toEqual(
        new URL(`https://${section}.chappyasel.com`),
      );
    },
  );

  it.each(["books", "weightlifting"] as const)(
    "serves %s at its canonical subdomain without a redirect",
    async (section) => {
      vi.stubEnv("NODE_ENV", "production");
      const { metadata } = await layouts[section]();
      const origin = `https://${section}.chappyasel.com`;
      const response = await proxy(
        new NextRequest(origin, { headers: { accept: "text/html" } }),
      );
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        `${origin}/${section}`,
      );
      expect(metadata.metadataBase).toEqual(new URL(origin));
      expect(metadata.alternates?.canonical).toBe("/");
      expect(metadata.openGraph?.url).toBe("/");
    },
  );

  it("uses the local main app for development entry metadata", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PORT", "3019");
    const { metadata } = await layouts.manual();
    expect(metadata.alternates?.canonical).toBe("http://localhost:3019/manual");
    expect(metadata.metadataBase).toEqual(
      new URL("http://manual.localhost:3019"),
    );
  });
});
