import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { coverBackdropColor, parseHex } from "~/lib/books/coverColor";
import type * as OgImageUtils from "~/lib/books/ogImageUtils";

/**
 * The card with its cover host down. Before the sampled jacket color existed
 * the fallback was an <svg> whose text the renderer could not draw, so a dead
 * host shipped a blank gray board on a gray wash. Now the board is the
 * jacket's own color carrying the title, on a dark wash of the same hue.
 */

vi.mock("~/lib/books/ogImageUtils", async (importOriginal) => {
  const actual = await importOriginal<typeof OgImageUtils>();
  return { ...actual, fetchExternalImage: async () => null };
});

const JACKET = "#1c4444";

vi.mock("~/lib/books/ogDataAccess", () => ({
  getBookForOG: async () => ({
    id: "the-dark-forest",
    notionId: "notion-the-dark-forest",
    title: "The Dark Forest",
    author: "Cixin Liu",
    publicationYear: 2008,
    started: "2026-05-01T00:00:00.000Z",
    finished: "2026-05-20T00:00:00.000Z",
    abandoned: null,
    abandonedAtMin: null,
    rating: 4,
    audioLengthMin: 720,
    pageCount: 400,
    tags: [],
    hasNotes: true,
    hasSummary: true,
    isAutomated: false,
    isFeatured: false,
    coverUrl: "https://example.invalid/cover.jpg",
    coverColor: JACKET,
    audibleUrl: null,
    notionUrl: "https://notion.so/x",
  }),
}));

async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png)
    .extract({ left: x, top: y, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0]!, g: data[1]!, b: data[2]!, channels: info.channels };
}

function near(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  tolerance = 6,
) {
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance
  );
}

describe("book OG card with the cover host down", () => {
  it("paints the board in the jacket color on a dark wash of the same hue", async () => {
    const { default: Image } = await import("./opengraph-image");
    const response = await Image({
      params: Promise.resolve({ bookId: "the-dark-forest" }),
    });
    const png = Buffer.from(await response.arrayBuffer());

    // A corner of the board (the title sits in its middle)
    const board = await pixel(png, 90, 110);
    expect(near(board, parseHex(JACKET)!)).toBe(true);

    // Open ground, bottom right, well clear of the text column
    const ground = await pixel(png, 1150, 600);
    expect(near(ground, parseHex(coverBackdropColor(JACKET)!)!)).toBe(true);

    // And the wash is darker than the board, not a lighter tint of it
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) =>
      0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(luminance(ground)).toBeLessThan(luminance(board));
  }, 30_000);
});
