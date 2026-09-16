import { describe, expect, it } from "vitest";

import { bookCardPalette } from "./cardPalette";
import { hexToHsl } from "./coverColor";

function channels(hex: string) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function luminance(rgb: number[]) {
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}

describe("book card palette", () => {
  it.each(["#f87c40", "#f04084"])(
    "preserves the vivid cover hue from the screenshot: %s",
    (coverColor) => {
      const original = hexToHsl(coverColor)!;
      const wash = hexToHsl(bookCardPalette(coverColor).wash)!;
      expect(Math.abs(wash.h - original.h)).toBeLessThan(1);
      expect(wash.s).toBeGreaterThan(original.s * 0.9);
    },
  );

  it("uses dark text over orange instead of turning the cover brown", () => {
    const palette = bookCardPalette("#f87c40");
    expect(palette.tone).toBe("light");
    expect(luminance(channels(palette.wash))).toBeGreaterThanOrEqual(0.44);
  });
  it("keeps pale jackets light and dark jackets dark", () => {
    expect(bookCardPalette("#f5f0e1").tone).toBe("light");
    expect(bookCardPalette("#ffe047").tone).toBe("light");
    expect(bookCardPalette("#122544").tone).toBe("dark");
    expect(bookCardPalette("#a83135").tone).toBe("dark");
    expect(bookCardPalette("#122544").wash).not.toBe(
      bookCardPalette("#a83135").wash,
    );
  });

  it("uses a stable dark fallback for missing or invalid samples", () => {
    expect(bookCardPalette(null).tone).toBe("dark");
    expect(bookCardPalette("invalid")).toEqual(bookCardPalette(null));
  });

  it.each(["#facc15", "#ffd700", "#d9bd37", "#e8ac40"])(
    "softens the star color only when a gold wash would conceal yellow stars: %s",
    (coverColor) => {
      expect(bookCardPalette(coverColor).starOverride).toBe(
        "rgb(36 35 31 / 0.72)",
      );
    },
  );

  it.each([
    null,
    "#f5f0e1",
    "#ffffff",
    "#ff7a00",
    "#ffff00",
    "#122544",
    "#a83135",
  ])(
    "keeps standard yellow stars outside the narrow gold range: %s",
    (coverColor) => {
      expect(bookCardPalette(coverColor).starOverride).toBeUndefined();
    },
  );

  it("keeps all text above 4.5:1 even over opposite-color artwork with blur off", () => {
    // Test the least opaque part of the wash behind text. Black and white
    // bound every possible backdrop, including covers with split colors.
    const values = [0, 51, 102, 153, 204, 255];
    for (const r of values) {
      for (const g of values) {
        for (const b of values) {
          const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
          const palette = bookCardPalette(hex);
          for (const backdrop of [0, 255]) {
            const background = luminance(
              channels(palette.wash).map(
                (v) =>
                  v * palette.washOpacity +
                  backdrop * (1 - palette.washOpacity),
              ),
            );
            for (const text of [palette.foreground, palette.secondary]) {
              const foreground = luminance(channels(text));
              const contrast =
                (Math.max(background, foreground) + 0.05) /
                (Math.min(background, foreground) + 0.05);
              expect(
                contrast,
                `${hex} with ${text} over ${backdrop}`,
              ).toBeGreaterThanOrEqual(4.5);
            }
          }
        }
      }
    }
  });
});
