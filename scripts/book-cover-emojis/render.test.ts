import { EMOJI_SIZE, containBox, renderCoverEmoji } from "./render";
import { faultsFor, measure } from "./verify-assets";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

/** A solid rectangle standing in for a jacket scan. */
async function jacket(width: number, height: number, format: "jpeg" | "png" = "jpeg") {
  const image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 60, b: 40 },
    },
  });
  return format === "png" ? image.png().toBuffer() : image.jpeg().toBuffer();
}

describe("containBox", () => {
  it("fills the long axis exactly and centers the short one", () => {
    const box = containBox(1000, 1500);
    expect(box.height).toBe(EMOJI_SIZE);
    expect(box.width).toBe(341);
    // 171 px of padding split across two sides: sharp gives the extra pixel
    // to the right, so the art starts at 85 rather than 86.
    expect(box.left).toBe(85);
    expect(box.top).toBe(0);
  });

  it("fills both axes for a square cover", () => {
    expect(containBox(800, 800)).toEqual({
      width: EMOJI_SIZE,
      height: EMOJI_SIZE,
      left: 0,
      top: 0,
    });
  });

  it("pins the long axis for a landscape cover too", () => {
    const box = containBox(1600, 900);
    expect(box.width).toBe(EMOJI_SIZE);
    expect(box.height).toBeLessThan(EMOJI_SIZE);
    expect(box.top).toBeGreaterThan(0);
  });

  it("enlarges a cover smaller than the square rather than leaving it small", () => {
    expect(containBox(120, 180).height).toBe(EMOJI_SIZE);
  });

  it("never stretches: the output ratio matches the source ratio", () => {
    for (const [w, h] of [
      [1000, 1500],
      [333, 500],
      [640, 480],
      [512, 512],
    ] as const) {
      const box = containBox(w, h);
      expect(box.width / box.height).toBeCloseTo(w / h, 2);
    }
  });

  it("refuses a cover with no dimensions", () => {
    expect(() => containBox(0, 500)).toThrow();
  });
});

describe("renderCoverEmoji", () => {
  it("writes a 512x512 RGBA PNG with the art centered and the pad transparent", async () => {
    const rendered = await renderCoverEmoji(await jacket(1000, 1500));
    // The art box the renderer computed from the source dimensions is the
    // independent claim; the pixels are checked against it, not against
    // themselves.
    const measured = await measure(rendered.png, rendered.art);
    expect(measured.width).toBe(EMOJI_SIZE);
    expect(measured.height).toBe(EMOJI_SIZE);
    expect(measured.channels).toBe(4);
    expect(measured.art.height).toBe(EMOJI_SIZE);
    expect(measured.paddingAlphaPixels).toBe(0);
    expect(faultsFor("portrait", measured, rendered.art)).toEqual([]);
  });

  it("reports the art box it actually produced", async () => {
    const rendered = await renderCoverEmoji(await jacket(1000, 1500));
    const measured = await measure(rendered.png, rendered.art);
    expect(rendered.art.width).toBe(measured.art.width);
    expect(rendered.art.height).toBe(measured.art.height);
    expect(rendered.source).toMatchObject({ width: 1000, height: 1500 });
  });

  it("leaves a square cover with no transparent padding at all", async () => {
    const rendered = await renderCoverEmoji(await jacket(900, 900));
    const measured = await measure(rendered.png, rendered.art);
    expect(measured.art).toEqual({
      left: 0,
      top: 0,
      width: EMOJI_SIZE,
      height: EMOJI_SIZE,
    });
  });

  it("keeps a cover that already has an alpha channel transparent", async () => {
    const transparent = await sharp({
      create: {
        width: 400,
        height: 600,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    const rendered = await renderCoverEmoji(transparent);
    const stats = await sharp(rendered.png).stats();
    expect(stats.channels).toHaveLength(4);
  });

  it("fails loudly on bytes that are not an image", async () => {
    await expect(renderCoverEmoji(Buffer.from("not an image"))).rejects.toThrow();
  });
});

describe("the padding audit", () => {
  /** A correct emoji with one stray mark dropped into its transparent pad. */
  async function withMarkInPadding(alpha: number) {
    const rendered = await renderCoverEmoji(await jacket(1000, 1500));
    const mark = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: alpha / 255 },
      },
    })
      .png()
      .toBuffer();
    const png = await sharp(rendered.png)
      .composite([{ input: mark, left: 6, top: 6, blend: "over" }])
      .png()
      .toBuffer();
    return { png, claimed: rendered.art };
  }

  it("catches an opaque mark outside the claimed art box", async () => {
    const { png, claimed } = await withMarkInPadding(255);
    const measured = await measure(png, claimed);
    expect(measured.paddingAlphaPixels).toBeGreaterThan(0);
    const faults = faultsFor("marked", measured, claimed);
    expect(faults.join(" ")).toMatch(/not fully transparent/);
  });

  it("catches a mark too faint to move the measured art box", async () => {
    // Alpha 3 is below the floor that decides what counts as art, so the
    // measured box does not move. The old check compared the padding against
    // that measured box and could never report anything; this one compares it
    // against the claim and demands alpha exactly 0.
    const { png, claimed } = await withMarkInPadding(3);
    const measured = await measure(png, claimed);
    expect(measured.art).toEqual(claimed);
    expect(measured.paddingAlphaPixels).toBeGreaterThan(0);
    expect(measured.maxPaddingAlpha).toBeLessThan(8);
    expect(faultsFor("faint", measured, claimed).join(" ")).toMatch(
      /not fully transparent/,
    );
  });

  it("reports pixels that disagree with the claimed geometry", async () => {
    const rendered = await renderCoverEmoji(await jacket(1000, 1500));
    const wrongClaim = { width: 200, height: 512, left: 156, top: 0 };
    const measured = await measure(rendered.png, wrongClaim);
    expect(faultsFor("mismatch", measured, wrongClaim).join(" ")).toMatch(
      /but the pixels say/,
    );
  });

  it("reports no padding count when nothing was claimed", async () => {
    const rendered = await renderCoverEmoji(await jacket(1000, 1500));
    const measured = await measure(rendered.png);
    expect(measured.paddingAlphaPixels).toBeNull();
    expect(faultsFor("unclaimed", measured)).toEqual([]);
  });
});
