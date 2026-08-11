import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  fallbackCoverEdgeColor,
  readingBookMaterialColors,
} from "./coverEdgeColor";
import {
  createCoverEdgeColorResolver,
  extractCoverEdgeColor,
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

  it("uses real perimeter ink instead of making white-ground covers identical", async () => {
    const [teal, orange, red] = await Promise.all(
      ["#147a83", "#ed5210", "#a91822"].map(async (accent) =>
        extractCoverEdgeColor(await whiteCoverWithEdgeInk(accent)),
      ),
    );
    expect(teal).toBe("#107080");
    expect(orange).toBe("#e05010");
    expect(red).toBe("#a01020");
    expect(new Set([teal, orange, red]).size).toBe(3);
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

  it("keeps cloth boards distinct from cream pages in both themes", () => {
    for (const dark of [false, true]) {
      const colors = readingBookMaterialColors(
        "#f6f3e9",
        dark ? "#c7bda9" : "#f2e8d5",
        dark,
      );
      expect(contrastRatio(colors.cover, colors.pages)).toBeGreaterThan(1.35);
    }
  });
});
