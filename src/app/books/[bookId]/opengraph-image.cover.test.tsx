import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as OgImageUtils from "~/lib/books/ogImageUtils";

/**
 * The common case: the cover host answers. Every book with a cover takes this
 * path, and it is the one the fallback test never exercises. The card and the
 * tab icon leave their fallback board unpainted here, and the renderer must
 * accept that: satori throws on a style whose value is undefined, and it
 * throws while the response body streams, after the route's try/catch has
 * already returned. That took every book card and icon on production down
 * as a 500. These render through the real renderer, so a style the cover
 * path leaves undefined fails here first.
 */

const COVER = { r: 180, g: 40, b: 60 };

const served = vi.hoisted(() => ({ format: "jpeg" as "jpeg" | "png" }));

/**
 * The cover as its host serves it: a small JPEG, the common case, or a PNG
 * larger than the routes pass through whole. Plurality's cover is a
 * 5100×6600 PNG, and while the routes labeled every cover as JPEG, satori
 * could not read its size and drew nothing where it belonged.
 */
async function fetchedCover(): Promise<ArrayBuffer> {
  const png = served.format === "png";
  const image = sharp({
    create: {
      width: png ? 1300 : 120,
      height: png ? 1800 : 180,
      channels: 3,
      background: COVER,
    },
  });
  const bytes = png
    ? await image.png().toBuffer()
    : await image.jpeg({ quality: 100 }).toBuffer();
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

vi.mock("~/lib/books/ogImageUtils", async (importOriginal) => {
  const actual = await importOriginal<typeof OgImageUtils>();
  return { ...actual, fetchExternalImage: fetchedCover };
});

vi.mock("~/lib/books/ogDataAccess", () => ({
  getBookForOG: async () => ({
    id: "solaris",
    notionId: "notion-solaris",
    title: "Solaris",
    author: "Stanisław Lem",
    publicationYear: 1961,
    started: "2026-08-01T00:00:00.000Z",
    finished: "2026-08-14T00:00:00.000Z",
    abandoned: null,
    abandonedAtMin: null,
    rating: 5,
    audioLengthMin: 470,
    pageCount: 204,
    tags: [],
    hasNotes: true,
    hasSummary: true,
    isAutomated: false,
    isFeatured: false,
    coverUrl: "https://example.invalid/solaris.jpg",
    coverColor: "#7a2030",
    audibleUrl: null,
    notionUrl: "https://notion.so/x",
  }),
}));

async function pixel(png: Buffer, x: number, y: number) {
  const { data } = await sharp(png)
    .extract({ left: x, top: y, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0]!, g: data[1]!, b: data[2]! };
}

function near(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  tolerance = 8,
) {
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance
  );
}

describe.each(["jpeg", "png"] as const)("a %s cover", (format) => {
  beforeEach(() => {
    served.format = format;
  });

  it("renders on the OG card, where the board would be", async () => {
    const { default: Image } = await import("./opengraph-image");
    const response = await Image({
      params: Promise.resolve({ bookId: "solaris" }),
    });
    const png = Buffer.from(await response.arrayBuffer());
    const { width, height } = await sharp(png).metadata();
    expect({ width, height }).toEqual({ width: 1200, height: 630 });

    // Middle of the cover slot: the fetched cover, not a board or a hole
    expect(near(await pixel(png, 213, 315), COVER)).toBe(true);
  }, 30_000);

  it("renders on the tab icon, over its blurred copy", async () => {
    const { bookCoverIconImage } = await import("../bookCoverIcon");
    const { ICON_FRAME } = await import("./iconLayout");
    const response = await bookCoverIconImage(
      {
        title: "Solaris",
        coverUrl: "https://example.invalid/solaris.jpg",
        coverColor: "#7a2030",
      },
      ICON_FRAME,
    );
    const png = Buffer.from(await response.arrayBuffer());
    const { width, height } = await sharp(png).metadata();
    expect({ width, height }).toEqual({
      width: ICON_FRAME,
      height: ICON_FRAME,
    });

    // Dead centre is the cover itself
    const centre = Math.floor(ICON_FRAME / 2);
    expect(near(await pixel(png, centre, centre), COVER)).toBe(true);
  }, 30_000);
});
