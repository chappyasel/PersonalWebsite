import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { getImageDimensions, getTextColorAndOverlay } from "./ogImageUtils";

describe("getTextColorAndOverlay", () => {
  it("uses 90% black over light cover art", () => {
    expect(getTextColorAndOverlay(0.8)).toMatchObject({
      textColor: "rgba(0, 0, 0, 0.9)",
      usesDarkText: true,
    });
  });

  it("uses 90% white over dark cover art", () => {
    expect(getTextColorAndOverlay(0.2)).toMatchObject({
      textColor: "rgba(255, 255, 255, 0.9)",
      usesDarkText: false,
    });
  });
});

describe("getImageDimensions", () => {
  it("reads a raster's pixel size", async () => {
    const png = await sharp({
      create: {
        width: 40,
        height: 60,
        channels: 3,
        background: { r: 200, g: 120, b: 40 },
      },
    })
      .png()
      .toBuffer();
    const buffer = new ArrayBuffer(png.byteLength);
    new Uint8Array(buffer).set(png);

    await expect(getImageDimensions(buffer)).resolves.toEqual({
      width: 40,
      height: 60,
    });
  });

  it("returns null for bytes sharp cannot decode", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      getImageDimensions(new TextEncoder().encode("not an image").buffer),
    ).resolves.toBeNull();
    spy.mockRestore();
  });
});
