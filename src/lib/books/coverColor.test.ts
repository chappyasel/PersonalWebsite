import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  COLOR_FAMILIES,
  UNKNOWN_COLOR_LABEL,
  compareColorLabels,
  coverBackdropColor,
  coverColorFamily,
  coverColorLabel,
  hexToHsl,
  hexToOklab,
  oklabDistance,
  oklabToRgb,
  orderByCoverColor,
  parseHex,
  pathLength,
  rgbToHex,
  rgbToOklab,
  smoothPath,
} from "./coverColor";
import { extractCoverColor } from "./coverColor.server";

async function solid(background: string, width = 40, height = 60) {
  return sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer();
}

/** A `ground` cover with a `share` (0..1) block of `ink` across the top. */
async function twoTone(ground: string, ink: string, share: number) {
  const width = 40;
  const height = 60;
  const block = await sharp({
    create: {
      width,
      height: Math.max(1, Math.round(height * share)),
      channels: 3,
      background: ink,
    },
  })
    .png()
    .toBuffer();
  return sharp({ create: { width, height, channels: 3, background: ground } })
    .composite([{ input: block, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

const book = (coverColor: string | null, id = coverColor ?? "none") => ({
  id,
  coverColor,
});

describe("cover color families", () => {
  it("maps named swatches to the family a reader would call them", () => {
    expect(coverColorFamily("#c0392b")).toBe("Red");
    expect(coverColorFamily("#e67e22")).toBe("Orange");
    expect(coverColorFamily("#f1c40f")).toBe("Yellow");
    expect(coverColorFamily("#27ae60")).toBe("Green");
    expect(coverColorFamily("#16a085")).toBe("Teal");
    expect(coverColorFamily("#2980b9")).toBe("Blue");
    expect(coverColorFamily("#8e44ad")).toBe("Purple");
    expect(coverColorFamily("#e84393")).toBe("Pink");
  });

  it("sends dark and muted oranges to brown", () => {
    expect(coverColorFamily("#8b4513")).toBe("Brown"); // saddle brown
    expect(coverColorFamily("#d2b48c")).toBe("Brown"); // tan
    expect(coverColorFamily("#d8c498")).toBe("Brown"); // beige jacket ground
    expect(coverColorFamily("#a0522d")).toBe("Brown"); // sienna
    expect(coverColorFamily("#5c2a1a")).toBe("Brown");
    expect(coverColorFamily("#ff8c00")).toBe("Orange"); // stays orange
    expect(coverColorFamily("#cc5500")).toBe("Orange"); // burnt orange too
    expect(coverColorFamily("#c06824")).toBe("Orange"); // The Martian's jacket
  });

  it("keeps crimson with the reds, hot pink with the pinks", () => {
    expect(coverColorFamily("#780c2c")).toBe("Red"); // wine, ~342°
    expect(coverColorFamily("#dc143c")).toBe("Red"); // crimson
    expect(coverColorFamily("#ff69b4")).toBe("Pink"); // hot pink, ~330°
    expect(coverColorFamily("#ff00ff")).toBe("Pink"); // magenta
  });

  it("treats near-black, gray, and cream as neutrals", () => {
    expect(coverColorFamily("#101820")).toBe("Black");
    expect(coverColorFamily("#1a1a1a")).toBe("Black");
    expect(coverColorFamily("#808080")).toBe("Gray");
    expect(coverColorFamily("#f5f0e1")).toBe("White"); // cream
    expect(coverColorFamily("#fafafa")).toBe("White");
  });

  it("keeps navy as blue rather than black", () => {
    expect(coverColorFamily("#0b1a33")).toBe("Blue");
  });

  it("labels missing or malformed colors as Other", () => {
    expect(coverColorFamily(null)).toBeNull();
    expect(coverColorFamily("blue")).toBeNull();
    expect(coverColorLabel(null)).toBe(UNKNOWN_COLOR_LABEL);
  });

  it("orders section labels the way the shelf runs", () => {
    const labels = ["Other", "Blue", "Red", "White"];
    expect(labels.sort((a, b) => compareColorLabels(a, b, "asc"))).toEqual([
      "Red",
      "Blue",
      "White",
      "Other",
    ]);
    expect(
      ["Other", "Blue", "Red"].sort((a, b) => compareColorLabels(a, b, "desc")),
    ).toEqual(["Blue", "Red", "Other"]);
  });
});

describe("OKLab", () => {
  it("round-trips sRGB within a step", () => {
    for (const hex of ["#c0392b", "#2980b9", "#f5f0e1", "#101820", "#8b4513"]) {
      const rgb = parseHex(hex)!;
      const back = oklabToRgb(rgbToOklab(rgb));
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1);
    }
    expect(rgbToHex({ r: 255, g: 0, b: 128 })).toBe("#ff0080");
  });

  it("scores a small tint change as closer than a lightness jump", () => {
    const blue = hexToOklab("#2980b9")!;
    const tint = hexToOklab("#2a86c0")!;
    const navy = hexToOklab("#0b1a33")!;
    expect(oklabDistance(blue, tint)).toBeLessThan(oklabDistance(blue, navy));
  });
});

describe("smoothPath", () => {
  it("keeps the anchors and visits every point once", () => {
    const points = ["#ff0000", "#ff4000", "#ff8000", "#ffbf00", "#ffff00"].map(
      (hex) => hexToOklab(hex)!,
    );
    const path = smoothPath(points, 4, 0);
    expect(path[0]).toBe(4);
    expect(path.at(-1)).toBe(0);
    expect([...path].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("straightens a scrambled gradient", () => {
    const gradient = Array.from({ length: 12 }, (_, i) => {
      const t = i / 11;
      return rgbToOklab({ r: 20 + t * 200, g: 40 + t * 120, b: 180 - t * 60 });
    });
    const scrambled = [7, 2, 11, 0, 5, 9, 1, 8, 3, 10, 6, 4].map(
      (i) => gradient[i]!,
    );
    const path = smoothPath(scrambled, 3, 2); // indices of gradient 0 and 11
    const walked = path.map((i) => scrambled[i]!);
    expect(walked).toEqual(gradient);
  });
});

describe("orderByCoverColor", () => {
  const rainbow = [
    "#c0392b", // red
    "#8b4513", // brown
    "#e67e22", // orange
    "#f1c40f", // yellow
    "#27ae60", // green
    "#16a085", // teal
    "#2980b9", // blue
    "#8e44ad", // purple
    "#e84393", // pink
    "#1a1a1a", // black
    "#808080", // gray
    "#fafafa", // white
  ];

  it("runs the families red through white, unknown last", () => {
    const items = [book(null), ...[...rainbow].reverse().map((hex) => book(hex))];
    const ordered = orderByCoverColor(items, "asc");
    expect(ordered.map((item) => item.coverColor)).toEqual([...rainbow, null]);
    expect(ordered.map((item) => coverColorFamily(item.coverColor))).toEqual([
      ...COLOR_FAMILIES,
      null,
    ]);
  });

  it("reverses the run for descending but keeps unknown last", () => {
    const items = [book(null), ...rainbow.map((hex) => book(hex))];
    const ordered = orderByCoverColor(items, "desc");
    expect(ordered.map((item) => item.coverColor)).toEqual([
      ...[...rainbow].reverse(),
      null,
    ]);
  });

  it("enters a family at its near hue edge and leaves at its far edge", () => {
    // Blues from teal-ish (~200°) to violet-ish (~250°), shuffled
    const blues = ["#3a6ea5", "#2a9dbf", "#1f3a93", "#5b6fd6", "#2d7fa9"];
    const ordered = orderByCoverColor(
      blues.map((hex) => book(hex)),
      "asc",
    ).map((item) => hexToHsl(item.coverColor!)!.h);
    expect(ordered[0]).toBe(Math.min(...ordered));
    expect(ordered.at(-1)).toBe(Math.max(...ordered));
  });

  it("walks a shorter path than a plain hue sort inside a family", () => {
    // A cloud of blues with lightness scattered on purpose
    const blues: string[] = [];
    for (let i = 0; i < 24; i++) {
      const h = 200 + (i * 37) % 55;
      const l = 0.25 + ((i * 53) % 60) / 100;
      const s = 0.45 + ((i * 29) % 40) / 100;
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = l - c / 2;
      const [r, g, b] =
        h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
      blues.push(
        rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }),
      );
    }
    const byHue = [...blues].sort(
      (a, b) => hexToHsl(a)!.h - hexToHsl(b)!.h,
    );
    const smooth = orderByCoverColor(
      blues.map((hex) => book(hex)),
      "asc",
    ).map((item) => item.coverColor!);
    expect(new Set(smooth).size).toBe(blues.length);
    expect(pathLength(smooth)).toBeLessThan(pathLength(byHue));
  });

  it("starts the next family next to where the last one ended", () => {
    const reds = ["#c0392b", "#7b241c", "#f1948a"];
    // Pumpkin (~24°), carrot (~28°), pale peach (~28°), saffron (~37°): the
    // saffron is the exit anchor, so the entry is the nearest of the rest
    const oranges = ["#d35400", "#e67e22", "#f5cba7", "#f39c12"];
    const ordered = orderByCoverColor(
      [...oranges, ...reds].map((hex) => book(hex)),
      "asc",
    ).map((item) => item.coverColor!);
    const lastRed = ordered[reds.length - 1]!;
    const firstOrange = ordered[reds.length]!;
    const lastOrange = ordered.at(-1)!;
    const lastRedLab = hexToOklab(lastRed)!;
    const nearestOrange = oranges
      .filter((hex) => hex !== "#f39c12")
      .reduce((best, hex) =>
        oklabDistance(lastRedLab, hexToOklab(hex)!) <
        oklabDistance(lastRedLab, hexToOklab(best)!)
          ? hex
          : best,
      );
    expect(coverColorFamily(lastRed)).toBe("Red");
    expect(lastOrange).toBe("#f39c12");
    expect(firstOrange).toBe(nearestOrange);
  });

  it("runs the neutral tail dark to light", () => {
    const neutrals = ["#fafafa", "#404040", "#1a1a1a", "#c0c0c0", "#0a0a0a"];
    const ordered = orderByCoverColor(
      neutrals.map((hex) => book(hex)),
      "asc",
    ).map((item) => hexToHsl(item.coverColor!)!.l);
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
  });

  it("anchors on vivid books, not a dull outlier at the hue edge", () => {
    // Four vivid blues plus one muddy blue-gray (240°) whose hue is the
    // family's largest; the exit must still be a vivid blue.
    const blues = ["#2255dd", "#3366ff", "#1f3a93", "#4b5fc9", "#5c5c80"];
    const ordered = orderByCoverColor(
      blues.map((hex) => book(hex)),
      "asc",
    ).map((item) => item.coverColor!);
    expect(coverColorFamily("#5c5c80")).toBe("Blue");
    expect(ordered.at(-1)).not.toBe("#5c5c80");
    expect(ordered[0]).not.toBe("#5c5c80");
  });

  it("does not depend on input order", () => {
    const hexes = [
      "#c0392b",
      "#2980b9",
      "#e67e22",
      "#3a6ea5",
      "#f1948a",
      "#1f3a93",
      "#fafafa",
      "#5b6fd6",
    ];
    const a = orderByCoverColor(
      hexes.map((hex) => book(hex)),
      "asc",
    ).map((item) => item.id);
    const b = orderByCoverColor(
      [...hexes].reverse().map((hex) => book(hex)),
      "asc",
    ).map((item) => item.id);
    expect(a).toEqual(b);
  });
});

describe("coverBackdropColor", () => {
  it("pins every jacket to a dark wash that keeps its hue", () => {
    for (const hex of ["#e0cc18", "#1c4444", "#cc4430", "#f5f0e1", "#e5e5e5"]) {
      const backdrop = coverBackdropColor(hex)!;
      const lab = hexToOklab(backdrop)!;
      expect(lab.L).toBeGreaterThan(0.2);
      expect(lab.L).toBeLessThan(0.36);
    }
    const yellow = hexToHsl(coverBackdropColor("#e0cc18")!)!;
    expect(yellow.h).toBeGreaterThan(40);
    expect(yellow.h).toBeLessThan(75);
    expect(coverBackdropColor(null)).toBeNull();
    expect(coverBackdropColor("nope")).toBeNull();
  });
});

describe("extractCoverColor", () => {
  it("returns the family of a solid jacket", async () => {
    expect(coverColorFamily(await extractCoverColor(await solid("#c0392b")))).toBe(
      "Red",
    );
    expect(coverColorFamily(await extractCoverColor(await solid("#0b1a33")))).toBe(
      "Blue",
    );
  });

  it("keeps a white cover with a small red title white", async () => {
    const color = await extractCoverColor(await twoTone("#f8f8f5", "#c0392b", 0.1));
    expect(coverColorFamily(color)).toBe("White");
  });

  it("tints a white cover toward its accent so whites run by accent", async () => {
    const red = await extractCoverColor(await twoTone("#f8f8f5", "#c0392b", 0.12));
    const blue = await extractCoverColor(await twoTone("#f8f8f5", "#2980b9", 0.12));
    const plain = await extractCoverColor(await solid("#f8f8f5"));
    expect(coverColorFamily(red)).toBe("White");
    expect(coverColorFamily(blue)).toBe("White");
    expect(red).not.toBe(blue);
    const redLab = hexToOklab(red!)!;
    const blueLab = hexToOklab(blue!)!;
    expect(redLab.a).toBeGreaterThan(0); // toward red
    expect(blueLab.b).toBeLessThan(0); // toward blue
    // Faint: within a whisker of the plain paper
    expect(oklabDistance(redLab, hexToOklab(plain!)!)).toBeLessThan(0.05);
    // And the shelf keeps the two red-accent whites together, with the
    // blue-accent one at an end (the two reds may round to the same hex)
    const red2 = await extractCoverColor(await twoTone("#f8f8f5", "#e74c3c", 0.12));
    const ordered = orderByCoverColor(
      [blue, red, red2].map((hex) => book(hex)),
      "asc",
    ).map((item) => item.coverColor);
    expect(ordered[0] === blue || ordered[2] === blue).toBe(true);
    expect(ordered[1] === red || ordered[1] === red2).toBe(true);
  });

  it("keeps a black cover with white type black and tints it by accent", async () => {
    const color = await extractCoverColor(await twoTone("#111111", "#c0392b", 0.15));
    expect(coverColorFamily(color)).toBe("Black");
    expect(hexToOklab(color!)!.a).toBeGreaterThan(0);
  });

  it("calls a mostly blue cover blue even with a white band", async () => {
    const color = await extractCoverColor(await twoTone("#f8f8f5", "#2980b9", 0.6));
    expect(coverColorFamily(color)).toBe("Blue");
  });

  it("counts a jacket as colored only from about a third upward", async () => {
    const quarter = await extractCoverColor(await twoTone("#f8f8f5", "#2980b9", 0.25));
    const third = await extractCoverColor(await twoTone("#f8f8f5", "#2980b9", 0.36));
    expect(coverColorFamily(quarter)).toBe("White");
    expect(coverColorFamily(third)).toBe("Blue");
  });

  it("stores a blue block on white as a paler blue than the solid jacket", async () => {
    const solidBlue = await extractCoverColor(await solid("#2980b9"));
    const blockOnWhite = await extractCoverColor(
      await twoTone("#f8f8f5", "#2980b9", 0.4),
    );
    expect(coverColorFamily(blockOnWhite)).toBe("Blue");
    expect(hexToOklab(blockOnWhite!)!.L).toBeGreaterThan(
      hexToOklab(solidBlue!)!.L + 0.15,
    );
    // Hue survives the lightness change
    const solidHue = hexToHsl(solidBlue!)!.h;
    const pale = hexToHsl(blockOnWhite!)!.h;
    expect(Math.abs(pale - solidHue)).toBeLessThan(12);
  });

  it("picks the dominant lightness band for a black-and-white cover", async () => {
    const black = await extractCoverColor(await twoTone("#111111", "#f8f8f5", 0.3));
    expect(coverColorFamily(black)).toBe("Black");
    const white = await extractCoverColor(await twoTone("#f8f8f5", "#111111", 0.3));
    expect(coverColorFamily(white)).toBe("White");
  });

  it("chooses the larger hue block on a two-color jacket", async () => {
    const color = await extractCoverColor(await twoTone("#27ae60", "#c0392b", 0.35));
    expect(coverColorFamily(color)).toBe("Green");
  });

  it("returns null for bytes that are not an image", async () => {
    expect(await extractCoverColor(Buffer.from("not an image"))).toBeNull();
  });
});
