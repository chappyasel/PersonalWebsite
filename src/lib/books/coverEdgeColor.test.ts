import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { coverColorFamily } from "./coverColor";
import { extractCoverColor } from "./coverColor.server";
import {
  fallbackCoverEdgeColor,
  readingBookMaterialColors,
} from "./coverEdgeColor";
import {
  createCoverEdgeColorResolver,
  extractCoverEdgeColor,
  readingBookEdgeColors,
} from "./coverEdgeColor.server";

async function borderedCover(edge: string, center: string) {
  const centerBuffer = await sharp({
    create: { width: 48, height: 64, channels: 3, background: center },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: 64, height: 80, channels: 3, background: edge },
  })
    .composite([{ input: centerBuffer, left: 8, top: 8 }])
    .png()
    .toBuffer();
}

async function whiteCoverWithEdgeInk(accent: string) {
  const stripe = await sharp({
    create: { width: 8, height: 54, channels: 3, background: accent },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: 64, height: 80, channels: 3, background: "#f8f8f5" },
  })
    .composite([{ input: stripe, left: 3, top: 13 }])
    .png()
    .toBuffer();
}

describe("cover perimeter colors", () => {
  it("prefers the jacket edge over a different dominant center", async () => {
    const cover = await borderedCover("#1769aa", "#d84838");
    const color = await extractCoverEdgeColor(cover);
    expect(color).toBe("#1060a0");
  });

  it("keeps pale edges pale when colored ink sits inside the border", async () => {
    const [teal, orange, red] = await Promise.all(
      ["#147a83", "#ed5210", "#a91822"].map(async (accent) =>
        extractCoverEdgeColor(await whiteCoverWithEdgeInk(accent)),
      ),
    );
    expect(teal).toBe("#f0f0f0");
    expect(orange).toBe("#f0f0f0");
    expect(red).toBe("#f0f0f0");
  });

  it("falls back deterministically when image loading or decoding fails", async () => {
    expect(fallbackCoverEdgeColor("other-minds")).toBe(
      fallbackCoverEdgeColor("other-minds"),
    );
    expect(fallbackCoverEdgeColor("other-minds")).not.toBe(
      fallbackCoverEdgeColor("behave"),
    );

    const resolver = createCoverEdgeColorResolver(async () => null);
    await expect(resolver("bad-url", "other-minds")).resolves.toEqual({
      edge: fallbackCoverEdgeColor("other-minds"),
      source: "fallback",
    });
  });

  it("deduplicates concurrent work and memoizes successful colors", async () => {
    const cover = await borderedCover("#287a48", "#f5e7cc");
    let calls = 0;
    const resolver = createCoverEdgeColorResolver(async () => {
      calls += 1;
      return cover;
    });

    const [first, second] = await Promise.all([
      resolver("cover-url", "one"),
      resolver("cover-url", "one"),
    ]);
    const third = await resolver("cover-url", "one");

    expect(first).toEqual(second);
    expect(third).toEqual(first);
    expect(calls).toBe(1);
  });

  it.each(["#d4dcd8", "#fcf8f8", "#3c4430", "#100020", "#f6f3e9"])(
    "preserves the sampled jacket color %s in both themes",
    (edge) => {
      for (const dark of [false, true]) {
        const colors = readingBookMaterialColors(
          edge,
          dark ? "#c7bda9" : "#f2e8d5",
          dark,
        );
        expect(colors.cover).toBe(edge);
        expect(colors.pages).toMatch(/^#[0-9a-f]{6}$/);
      }
    },
  );
});

describe("readingBookEdgeColors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the red perimeter for boards while the white face stays in the white sort family", async () => {
    const white = await sharp({
      create: {
        width: 44,
        height: 60,
        channels: 3,
        background: "#fafafa",
      },
    })
      .png()
      .toBuffer();
    const cover = await sharp({
      create: {
        width: 48,
        height: 64,
        channels: 3,
        background: "#b81b2b",
      },
    })
      .composite([{ input: white, left: 2, top: 2 }])
      .png()
      .toBuffer();
    const coverColor = await extractCoverColor(cover);
    expect(coverColorFamily(coverColor)).toBe("White");
    const fetchCover = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array(cover)));
    vi.stubGlobal("fetch", fetchCover);
    const books = [
      {
        id: "red-framed",
        coverUrl: "https://example.test/red-framed.jpg",
        coverColor,
      },
    ];
    const colors = await readingBookEdgeColors(books);
    expect(colors["red-framed"]).toEqual({ edge: "#b01020", source: "edge" });
    expect(books[0]!.coverColor).toBe(coverColor);
    expect(fetchCover).toHaveBeenCalledOnce();
  });

  it("does not treat a stored face color as an edge when sampling fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const books = [
      {
        id: "offline",
        coverUrl: "https://example.test/offline.jpg",
        coverColor: "#ffffff",
      },
      { id: "missing", coverUrl: null, coverColor: "#ffffff" },
    ];
    const colors = await readingBookEdgeColors(books);
    for (const book of books) {
      expect(colors[book.id]).toEqual({
        edge: fallbackCoverEdgeColor(book.id),
        source: "fallback",
      });
    }
  });
});
