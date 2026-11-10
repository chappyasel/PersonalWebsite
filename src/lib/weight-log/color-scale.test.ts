import { describe, expect, it } from "vitest";

import {
  contrast,
  hexToRgb,
  median,
  mix,
  rgbToHex,
  signedScale,
  targetScale,
  weekTableColors,
  weighInScale,
} from "./color-scale";

// Invented numbers. None of them is the owner's.

describe("color math", () => {
  it("round-trips hex and mixes each channel linearly, rounded", () => {
    expect(rgbToHex(hexToRgb("#5A8AC6"))).toBe("#5a8ac6");
    const white = hexToRgb("#FCFCFF");
    const green = hexToRgb("#63BE7B");
    expect(rgbToHex(mix(white, green, 0))).toBe("#fcfcff");
    expect(rgbToHex(mix(white, green, 1))).toBe("#63be7b");
    // 252 + (99 - 252) / 2 = 175.5, which rounds up.
    expect(mix(white, green, 0.5)).toEqual([176, 221, 189]);
    expect(mix(white, green, 2)).toEqual(mix(white, green, 1));
  });

  it("takes the median as the 50th percentile", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(() => median([])).toThrow();
  });
});

describe("weighInScale", () => {
  it("runs white to green from the lowest weigh-in to the highest", () => {
    const scale = weighInScale([100, 104, 102]);
    expect(scale(100)?.light.background).toBe("#fcfcff");
    expect(scale(104)?.light.background).toBe("#63be7b");
    expect(scale(102)?.light.background).toBe("#b0ddbd");
  });

  it("starts from the dark card in dark mode and keeps the green end", () => {
    const scale = weighInScale([100, 104]);
    expect(scale(100)?.dark.background).toBe("#262626");
    expect(scale(104)?.dark.background).toBe("#63be7b");
  });

  it("gives one distinct value the low color and an empty range nothing", () => {
    expect(weighInScale([150, 150])(150)?.light.background).toBe("#fcfcff");
    expect(weighInScale([])(150)).toBeNull();
  });
});

describe("targetScale", () => {
  // Median 103: below it blue to white, above it white to red.
  const scale = targetScale([100, 102, 104, 110]);

  it("runs blue through white at the median to red", () => {
    expect(scale(100)?.light.background).toBe("#5a8ac6");
    expect(scale(103)?.light.background).toBe("#fcfcff");
    expect(scale(110)?.light.background).toBe("#f8696b");
    expect(scale(101.5)?.light.background).toBe("#abc3e3");
  });

  it("passes through the dark card in dark mode and keeps both ends", () => {
    expect(scale(100)?.dark.background).toBe("#5a8ac6");
    expect(scale(103)?.dark.background).toBe("#262626");
    expect(scale(110)?.dark.background).toBe("#f8696b");
  });

  it("gives a range of one value the middle color", () => {
    expect(targetScale([120])(120)?.light.background).toBe("#fcfcff");
  });
});

describe("signedScale", () => {
  // The largest distance from zero is 2, so -2 and +2 are the full ends.
  const scale = signedScale([-2, -0.5, 0, 1]);

  it("runs blue below zero, white at zero, and red above", () => {
    expect(scale(-2)?.light.background).toBe("#5a8ac6");
    expect(scale(0)?.light.background).toBe("#fcfcff");
    expect(scale(2)?.light.background).toBe("#f8696b");
    // Half of 2, halfway from white to red.
    expect(scale(1)?.light.background).toBe("#fab3b5");
  });

  it("gives a drop and a rise of the same size the same strength", () => {
    // -1 sits halfway to blue, as +1 sits halfway to red.
    expect(scale(-1)?.light.background).toBe("#abc3e3");
  });

  it("passes through the dark card in dark mode", () => {
    expect(scale(0)?.dark.background).toBe("#262626");
    expect(scale(-2)?.dark.background).toBe("#5a8ac6");
  });

  it("keeps zero white when every value is zero, and colors nothing in an empty column", () => {
    expect(signedScale([0, 0])(0)?.light.background).toBe("#fcfcff");
    expect(signedScale([])(1)).toBeNull();
  });
});

describe("text on fills", () => {
  it("keeps 4.5:1 contrast on every fill in both themes", () => {
    const values = Array.from({ length: 101 }, (_, index) => 100 + index / 10);
    const fills = [
      ...values.map(weighInScale(values)),
      ...values.map(targetScale(values)),
      ...values.map((value) =>
        signedScale(values.map((v) => v - 105))(value - 105),
      ),
    ];
    for (const fill of fills) {
      for (const theme of [fill!.light, fill!.dark]) {
        expect(
          contrast(hexToRgb(theme.background), hexToRgb(theme.text)),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("weekTableColors", () => {
  const row = (
    weights: (number | null)[],
    average: number | null,
    target: number | null,
    originalTarget: number | null,
    excludedDays: number[] = [],
  ) => ({
    weights,
    excludedDays,
    average,
    target,
    originalTarget,
    change: null,
    gapToTarget: null,
    poundsPerWeek: null,
    gapToOriginalTarget: null,
  });
  const empty = [null, null, null, null, null];

  it("colors days over the phase and leaves blanks and excluded days unfilled", () => {
    const colors = weekTableColors([
      row([100, 140, 102, null, ...empty.slice(2)], 101, 101, 101, [1]),
      row([104, ...empty, null], 104, 102, null),
    ]);
    expect(colors[0]!.days.map((day) => day?.light.background ?? null)).toEqual(
      ["#fcfcff", null, "#b0ddbd", null, null, null, null],
    );
    // The excluded 140 stays out of the range, so 104 is the top.
    expect(colors[1]!.days[0]?.light.background).toBe("#63be7b");
  });

  it("shares one scale across Average, Target, and Original target", () => {
    const colors = weekTableColors([
      row(Array<number | null>(7).fill(null), 100, 102, 104),
      row(Array<number | null>(7).fill(null), 104, 100, null),
    ]);
    expect(colors[0]!.originalTarget).toEqual(colors[1]!.average);
    expect(colors[0]!.average).toEqual(colors[1]!.target);
    expect(colors[0]!.average?.light.background).toBe("#5a8ac6");
    expect(colors[0]!.originalTarget?.light.background).toBe("#f8696b");
    expect(colors[1]!.originalTarget).toBeNull();
  });

  it("colors each signed column on its own scale around zero", () => {
    const blank = Array<number | null>(7).fill(null);
    const colors = weekTableColors([
      { ...row(blank, 100, 100, 100), change: -1, gapToTarget: 0.5 },
      { ...row(blank, 99, 99.5, 100), change: 0.5, gapToTarget: -0.25 },
    ]);
    // Change reaches 1, so -1 is full blue and 0.5 is half red.
    expect(colors[0]!.change?.light.background).toBe("#5a8ac6");
    expect(colors[1]!.change?.light.background).toBe("#fab3b5");
    // Gap reaches only 0.5, so its own 0.5 is full red.
    expect(colors[0]!.gapToTarget?.light.background).toBe("#f8696b");
    expect(colors[0]!.poundsPerWeek).toBeNull();
  });
});
