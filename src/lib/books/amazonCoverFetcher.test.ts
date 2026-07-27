import { describe, expect, it, vi } from "vitest";

import {
  amazonProductMatchesBook,
  fetchAmazonPrintCover,
  isAcceptableCoverDimensions,
  isEligiblePrintEdition,
  normalizeAmazonImageUrl,
  parseAmazonPrintFormatAsins,
  parseAmazonProductPage,
  parseAmazonSearchResults,
} from "./amazonCoverFetcher";

const AMAZON_HTML = `
  <html>
    <head>
      <title>
        The Right It : Why So Many Ideas Fail: Alberto Savoia: Amazon.com: Books
      </title>
    </head>
    <body>
      <img
        alt="The Right It"
        data-old-hires="https://m.media-amazon.com/images/I/71Sal58LoYL._SL1500_.jpg"
        id="landingImage"
      />
    </body>
  </html>
`;

const AMAZON_SEARCH_HTML = `
  <div
    data-asin="B012345678"
    data-component-type="s-search-result"
  >
    <h2><span>The Right It: Why So Many Ideas Fail</span></h2>
    <p>by Alberto Savoia</p>
  </div>
`;

const AMAZON_AUDIOBOOK_HTML = `
  <html>
    <head>
      <title>
        The Right It (Audible Audio Edition): Alberto Savoia: Amazon.com: Books
      </title>
    </head>
    <body>
      <a href="/gp/aw/d/0062958232/ref=tmm_hrd_swatch_0">
        <span aria-label="Hardcover Format:">Hardcover</span>
      </a>
      <img
        data-old-hires="https://m.media-amazon.com/images/I/audible._SL500_.jpg"
        id="landingImage"
      />
    </body>
  </html>
`;

describe("Amazon print-cover parsing", () => {
  it("extracts and normalizes the original high-resolution image", () => {
    expect(parseAmazonProductPage(AMAZON_HTML)).toEqual({
      hiResUrl: "https://m.media-amazon.com/images/I/71Sal58LoYL._SL1500_.jpg",
      pageTitle:
        "The Right It : Why So Many Ideas Fail: Alberto Savoia: Amazon.com: Books",
    });
    expect(
      normalizeAmazonImageUrl(
        "https://m.media-amazon.com/images/I/71Sal58LoYL._SL1500_.jpg",
      ),
    ).toBe("https://m.media-amazon.com/images/I/71Sal58LoYL.jpg");
  });

  it("supports Amazon's mobile print-book image markup", () => {
    expect(
      parseAmazonProductPage(`
        <title>The Upstarts: Brad Stone: Amazon.com: Books</title>
        <img
          data-a-hires="https://m.media-amazon.com/images/I/81J77W0tBSL._AC_UF1000,1000_QL80_.jpg"
          id="main-image"
        />
      `),
    ).toEqual({
      hiResUrl:
        "https://m.media-amazon.com/images/I/81J77W0tBSL._AC_UF1000,1000_QL80_.jpg",
      pageTitle: "The Upstarts: Brad Stone: Amazon.com: Books",
    });
  });

  it("only accepts the requested book and rejects adjacent single-word titles", () => {
    expect(
      amazonProductMatchesBook(
        "The Right It: Alberto Savoia: Amazon.com: Books",
        "The Right It",
        "Alberto Savoia",
      ),
    ).toBe(true);
    expect(
      amazonProductMatchesBook(
        "7 Rules of Power: Jeffrey Pfeffer: Amazon.com: Books",
        "Power",
        "Jeffrey Pfeffer",
      ),
    ).toBe(false);
  });

  it("rejects non-print editions and foreign-language editions", () => {
    expect(
      isEligiblePrintEdition({
        languages: [{ key: "/languages/eng" }],
        physical_format: "paperback",
      }),
    ).toBe(true);
    expect(
      isEligiblePrintEdition({
        languages: [{ key: "/languages/eng" }],
        physical_format: "audio cd",
      }),
    ).toBe(false);
    expect(
      isEligiblePrintEdition({
        languages: [{ key: "/languages/por" }],
        physical_format: "paperback",
      }),
    ).toBe(false);
  });

  it("requires a high-resolution portrait image", () => {
    expect(isAcceptableCoverDimensions({ width: 1665, height: 2500 })).toBe(
      true,
    );
    expect(isAcceptableCoverDimensions({ width: 333, height: 500 })).toBe(
      false,
    );
    expect(isAcceptableCoverDimensions({ width: 1500, height: 1120 })).toBe(
      false,
    );
    expect(isAcceptableCoverDimensions({ width: 500, height: 500 })).toBe(
      false,
    );
  });

  it("finds matching search results and their print-format ASINs", () => {
    expect(
      parseAmazonSearchResults(
        AMAZON_SEARCH_HTML,
        "The Right It",
        "Alberto Savoia",
      ),
    ).toEqual([{ asin: "B012345678" }]);
    expect(parseAmazonPrintFormatAsins(AMAZON_AUDIOBOOK_HTML)).toEqual([
      "0062958232",
    ]);
  });
});

describe("fetchAmazonPrintCover", () => {
  it("resolves Amazon's relevant result to its print-edition image", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.startsWith("https://www.amazon.com/s?")) {
        return new Response(AMAZON_SEARCH_HTML);
      }
      if (url === "https://www.amazon.com/dp/B012345678") {
        return new Response(AMAZON_AUDIOBOOK_HTML);
      }
      if (url === "https://www.amazon.com/dp/0062958232") {
        return new Response(AMAZON_HTML);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    const probeImage = vi.fn(async () => ({ width: 999, height: 1500 }));

    await expect(
      fetchAmazonPrintCover("The Right It", "Alberto Savoia", {
        fetchImpl: fetchImpl as typeof fetch,
        probeImage,
      }),
    ).resolves.toBe("https://m.media-amazon.com/images/I/71Sal58LoYL.jpg");
    expect(probeImage).toHaveBeenCalledWith(
      "https://m.media-amazon.com/images/I/71Sal58LoYL._SL1500_.jpg",
      fetchImpl,
    );
  });

  it("does not inspect Amazon when Open Library only returns an audiobook", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.startsWith("https://www.amazon.com/s?")) {
        return new Response("");
      }
      if (url.startsWith("https://openlibrary.org/search.json?")) {
        return Response.json({
          docs: [
            {
              author_name: ["Iain McGilchrist"],
              isbn: ["1713526751"],
              title: "The Master and His Emissary",
            },
          ],
        });
      }
      if (url === "https://openlibrary.org/isbn/1713526751.json") {
        return Response.json({
          physical_format: "audio cd",
          title: "The Master and His Emissary",
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(
      fetchAmazonPrintCover("The Master and His Emissary", "Iain McGilchrist", {
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
