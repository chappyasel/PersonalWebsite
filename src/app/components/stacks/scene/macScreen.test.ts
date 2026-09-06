import { describe, expect, it } from "vitest";

import {
  MAC_AUTOMATON_RULES,
  MAC_BOOT_COLLAPSE_END,
  MAC_BOOT_DARK_END,
  MAC_BOOT_HOLD_MAX_SECONDS,
  MAC_BOOT_HOLD_MIN_SECONDS,
  MAC_BOOT_SECONDS,
  MAC_LIFE_BACKGROUND,
  MAC_LIFE_DIM,
  MAC_LIFE_PALETTE,
  MAC_RASTER_ASPECT,
  MAC_SCREEN_CELL,
  MAC_SCREEN_COLS,
  MAC_SCREEN_HEIGHT,
  MAC_SCREEN_ROWS,
  MAC_SCREEN_WIDTH,
  MAC_STILL_RULE,
  type MacAutomaton,
  type MacScreenPainter,
  createIconicRuleStill,
  createMacAutomaton,
  macAutomatonRule,
  macBootHoldSeconds,
  nextMacScreenPhase,
  paintHappyMac,
  paintMacAutomaton,
  paintMacBoot,
  stepMacAutomaton,
} from "./macScreen";

function row(a: MacAutomaton, r: number): number[] {
  return Array.from(a.cells.subarray(r * a.cols, (r + 1) * a.cols));
}

function recorder() {
  const rects: Array<[number, number, number, number, string]> = [];
  const alphas: number[] = [];
  const ctx = {
    fillStyle: "" as string,
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push([x, y, w, h, ctx.fillStyle]);
      alphas.push(ctx.globalAlpha);
    },
    save() {
      // The recorder has no transform stack; scale() is a no-op below too.
    },
    restore() {
      // See save().
    },
    scale() {
      // Coordinates are recorded on the authored 64-texel grid.
    },
    translate() {
      // See scale().
    },
  } satisfies MacScreenPainter;
  return { ctx, rects, alphas };
}

describe("the Mac screen automaton", () => {
  it("advances rule 30 from the single seed the old page started from", () => {
    const a = createMacAutomaton(30, 9, 8, 2);
    expect(row(a, 7)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    stepMacAutomaton(a);
    expect(row(a, 7)).toEqual([0, 0, 0, 1, 1, 1, 0, 0, 0]);
    // The previous bottom row has scrolled up one.
    expect(row(a, 6)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    stepMacAutomaton(a);
    expect(row(a, 7)).toEqual([0, 0, 1, 1, 0, 0, 1, 0, 0]);
    expect(a.generation).toBe(2);
  });

  it("wraps the rule horizontally", () => {
    const a = createMacAutomaton(30, 5, 3, 0, false);
    a.cells[2 * 5 + 0] = 1;
    stepMacAutomaton(a);
    // Rule 30 turns a lone cell into three; the left one wraps to the end.
    expect(row(a, 2)).toEqual([1, 1, 0, 0, 1]);
  });

  it("runs Life in the top band and feeds the seam row from the scroll", () => {
    const a = createMacAutomaton(30, 9, 8, 3, false);
    // A vertical blinker in the band.
    a.cells[0 * 9 + 4] = 1;
    a.cells[1 * 9 + 4] = 1;
    a.cells[2 * 9 + 4] = 1;
    stepMacAutomaton(a);
    expect(row(a, 0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(row(a, 1)).toEqual([0, 0, 0, 1, 1, 1, 0, 0, 0]);
    expect(row(a, 2)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    stepMacAutomaton(a);
    expect(row(a, 1)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
  });

  it("feeds the rule's output through the seam row into Life", () => {
    const a = createMacAutomaton(30, 9, 7, 3);
    // The seed is on row 6. Rule 30 makes it a three-cell line, and that
    // line climbs one row per generation. A lone cell reaching the seam dies
    // under Life; the line that follows it survives as a blinker, so its
    // middle stands on the seam and a cell is born above it.
    for (let i = 0; i < 4; i++) stepMacAutomaton(a);
    expect(row(a, 3)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(row(a, 2)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    // Below the seam nothing is evaluated, only scrolled.
    expect(row(a, 4)).toEqual([0, 0, 1, 1, 0, 0, 1, 0, 0]);
  });

  it("only lists rules that keep the Life band alive", () => {
    // Mean live cells in the band, seam excluded, over generations 100..600
    // from the single seed. The nested rules the old page also drew from,
    // 22 and 150, starve Life: their rows never hand it enough to build on.
    function bandOccupancy(rule: number): number {
      const a = createMacAutomaton(rule);
      const band = a.lifeRows * a.cols;
      let sum = 0;
      let samples = 0;
      for (let g = 1; g <= 600; g++) {
        stepMacAutomaton(a);
        if (g < 100) continue;
        let live = 0;
        for (let i = 0; i < band; i++) live += a.cells[i]!;
        sum += live;
        samples++;
      }
      return sum / samples / band;
    }
    for (const rule of MAC_AUTOMATON_RULES)
      expect(bandOccupancy(rule), `rule ${rule}`).toBeGreaterThan(0.05);
    for (const rule of [22, 150])
      expect(bandOccupancy(rule), `rule ${rule}`).toBeLessThan(0.05);
  });

  it("picks one of Wolfram's interesting rules for any random draw", () => {
    expect(macAutomatonRule(0)).toBe(MAC_AUTOMATON_RULES[0]);
    expect(macAutomatonRule(0.999)).toBe(MAC_AUTOMATON_RULES.at(-1));
    expect(macAutomatonRule(1)).toBe(MAC_AUTOMATON_RULES.at(-1));
    for (const draw of [0.1, 0.37, 0.5, 0.82])
      expect(MAC_AUTOMATON_RULES).toContain(macAutomatonRule(draw));
  });

  it("fills the raster exactly with square cells", () => {
    expect(MAC_SCREEN_COLS * MAC_SCREEN_CELL).toBe(MAC_SCREEN_WIDTH);
    expect(MAC_SCREEN_ROWS * MAC_SCREEN_CELL).toBe(MAC_SCREEN_HEIGHT);
    expect(MAC_RASTER_ASPECT).toBe(MAC_SCREEN_WIDTH / MAC_SCREEN_HEIGHT);
    // The bezel opening is 0.0392 × 0.0315; an even margin inside it wants
    // something near 1.3, and the Happy Mac's 64-square must centre on a
    // whole texel.
    expect(MAC_RASTER_ASPECT).toBeGreaterThan(1.25);
    expect(MAC_RASTER_ASPECT).toBeLessThan(1.35);
    expect(((MAC_SCREEN_WIDTH - MAC_SCREEN_HEIGHT) / 2) % 1).toBe(0);
    const a = createMacAutomaton(30);
    expect(a.cells.length).toBe(MAC_SCREEN_COLS * MAC_SCREEN_ROWS);
  });
});

describe("the boot face", () => {
  const idle = { hovered: false, near: false, bootSeconds: 0, holdSeconds: 6 };

  it("holds for its drawn time unless a pointer or the approach interrupts", () => {
    expect(nextMacScreenPhase("face", { ...idle, activeSeconds: 2 })).toBe(
      "face",
    );
    expect(nextMacScreenPhase("face", { ...idle, activeSeconds: 6 })).toBe(
      "booting",
    );
    expect(
      nextMacScreenPhase("face", { ...idle, activeSeconds: 1, hovered: true }),
    ).toBe("booting");
    expect(
      nextMacScreenPhase("face", { ...idle, activeSeconds: 1, near: true }),
    ).toBe("booting");
  });

  it("draws the hold between five and ten seconds", () => {
    expect(macBootHoldSeconds(0)).toBe(MAC_BOOT_HOLD_MIN_SECONDS);
    expect(macBootHoldSeconds(1)).toBe(MAC_BOOT_HOLD_MAX_SECONDS);
    expect(macBootHoldSeconds(0.5)).toBe(7.5);
    expect(macBootHoldSeconds(-1)).toBe(MAC_BOOT_HOLD_MIN_SECONDS);
    expect(macBootHoldSeconds(2)).toBe(MAC_BOOT_HOLD_MAX_SECONDS);
    expect(MAC_BOOT_HOLD_MIN_SECONDS).toBe(5);
    expect(MAC_BOOT_HOLD_MAX_SECONDS).toBe(10);
  });

  it("boots for its full length, then stays booted", () => {
    expect(
      nextMacScreenPhase("booting", {
        ...idle,
        activeSeconds: 9,
        bootSeconds: MAC_BOOT_SECONDS / 2,
      }),
    ).toBe("booting");
    expect(
      nextMacScreenPhase("booting", {
        ...idle,
        activeSeconds: 9,
        bootSeconds: MAC_BOOT_SECONDS,
      }),
    ).toBe("life");
    expect(nextMacScreenPhase("life", { ...idle, activeSeconds: 0 })).toBe(
      "life",
    );
  });
});

describe("the painters", () => {
  it("paints the automaton in the Cofactory palette over black", () => {
    const a = createMacAutomaton(30, 4, 4, 1, false);
    a.cells[0] = 1;
    a.cells[1 * 4 + 1] = 1;
    a.cells[15] = 1;
    const { ctx, rects } = recorder();
    paintMacAutomaton(ctx, a);
    expect(rects[0]).toEqual([
      0,
      0,
      MAC_SCREEN_WIDTH,
      MAC_SCREEN_HEIGHT,
      MAC_LIFE_BACKGROUND,
    ]);
    const cells = rects.filter(
      ([, , w, h]) => w === MAC_SCREEN_CELL && h === MAC_SCREEN_CELL,
    );
    // Every cell is drawn, live in its tile colour, dead in the matching dim.
    expect(cells.length).toBe(16);
    const at = (r: number, c: number) =>
      cells.find(([x, y]) => x === c * 2 && y === r * 2)![4];
    expect(at(0, 0)).toBe(MAC_LIFE_PALETTE[0][0]);
    expect(at(1, 1)).toBe(MAC_LIFE_PALETTE[1][1]);
    expect(at(3, 3)).toBe(MAC_LIFE_PALETTE[0][0]);
    expect(at(0, 1)).toBe(MAC_LIFE_DIM[0][1]);
    expect(at(2, 2)).toBe(MAC_LIFE_DIM[2][2]);
    // Every other texel row is a scan line.
    const scanlines = rects.filter(
      ([, , w, h]) => w === MAC_SCREEN_WIDTH && h === 1,
    );
    expect(scanlines.length).toBe(MAC_SCREEN_HEIGHT / 2);
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });

  it("keeps the Happy Mac on its 64-texel grid and lets the blink close the eyes", () => {
    const open = recorder();
    paintHappyMac(open.ctx, 1, -1, false);
    const shut = recorder();
    paintHappyMac(shut.ctx, 0, 0, true);
    // Pupils sit in the 20..24 band; the mouth and nose are lower or taller.
    const eyes = (rects: typeof open.rects) =>
      rects.filter(
        ([x, y, w, h]) =>
          ((x >= 26 && x <= 27) || (x >= 36 && x <= 37)) &&
          y >= 20 &&
          y <= 24 &&
          w === 3 &&
          (h === 3 || h === 1),
      );
    expect(eyes(open.rects).every(([, , , h]) => h === 3)).toBe(true);
    expect(eyes(shut.rects).every(([, , , h]) => h === 1)).toBe(true);
    // The gaze moved both pupils by the same offset.
    expect(eyes(open.rects).map(([x, y]) => [x, y])).toEqual([
      [27, 20],
      [37, 20],
    ]);
  });

  it("boots in three acts: the face whites out, the screen goes dark, Life fades up", () => {
    const a = createMacAutomaton(30, 4, 4, 1);
    const full = [0, 0, MAC_SCREEN_WIDTH, MAC_SCREEN_HEIGHT] as const;

    const collapse = recorder();
    paintMacBoot(collapse.ctx, a, MAC_BOOT_COLLAPSE_END * 0.9, 0, 0);
    expect(collapse.rects[0]).toEqual([...full, MAC_LIFE_BACKGROUND]);
    // The face is drawn (its screen blue fill) and a near-white wash sits on
    // top with a strong alpha, so the last collapse frame is a bright bar.
    expect(collapse.rects.some(([, , , , c]) => c === "#79a6e8")).toBe(true);
    const wash = collapse.rects.findIndex(
      ([x, y, w, h, c]) =>
        x === 0 && y === 0 && w === full[2] && h === full[3] && c === "#e8f0e3",
    );
    expect(wash).toBeGreaterThan(0);
    expect(collapse.alphas[wash]).toBeGreaterThan(0.7);
    expect(collapse.ctx.globalAlpha).toBe(1);

    const dark = recorder();
    paintMacBoot(
      dark.ctx,
      a,
      (MAC_BOOT_COLLAPSE_END + MAC_BOOT_DARK_END) / 2,
      0,
      0,
    );
    expect(dark.rects).toEqual([[...full, MAC_LIFE_BACKGROUND]]);

    const rising = recorder();
    paintMacBoot(rising.ctx, a, (MAC_BOOT_DARK_END + 1) / 2, 0, 0);
    const cells = rising.rects.filter(([, , w, h]) => w === 2 && h === 2);
    expect(cells.length).toBe(16);
    const cellAlpha = rising.alphas[rising.rects.length - 1]!;
    expect(cellAlpha).toBeGreaterThan(0);
    expect(cellAlpha).toBeLessThan(1);
    expect(rising.ctx.globalAlpha).toBe(1);
  });
});

describe("the iconic still", () => {
  it("is rule 22 from one seed, tip at the top, every generation below it", () => {
    expect(MAC_STILL_RULE).toBe(22);
    const still = createIconicRuleStill();
    expect(still.cols).toBe(MAC_SCREEN_COLS);
    expect(still.rows).toBe(MAC_SCREEN_ROWS);
    const centre = Math.floor(still.cols / 2);
    const top = row(still, 0);
    expect(top.filter((cell) => cell === 1)).toHaveLength(1);
    expect(top[centre]).toBe(1);
    // Rule 22's first generations: 1, 111, 10001. The hollow triangle.
    expect(row(still, 1).slice(centre - 1, centre + 2)).toEqual([1, 1, 1]);
    expect(row(still, 2).slice(centre - 2, centre + 3)).toEqual([
      1, 0, 0, 0, 1,
    ]);
    expect(row(still, 1).filter((cell) => cell === 1)).toHaveLength(3);
    expect(row(still, 2).filter((cell) => cell === 1)).toHaveLength(2);
  });

  it("shows the infinite line clipped by the bezel, not a wrapped one", () => {
    const still = createIconicRuleStill();
    const centre = Math.floor(still.cols / 2);
    for (let r = 0; r < still.rows; r++) {
      const cells = row(still, r);
      // The light cone's edges are always live under rule 22 (001 and 100
      // both map to 1), and nothing lives outside the cone. Checked while
      // each edge is still on the screen; past that the bezel clips it.
      const left = centre - r;
      const right = centre + r;
      if (left >= 0) {
        expect(cells[left], `row ${r} left edge`).toBe(1);
        expect(cells.slice(0, left).every((cell) => cell === 0)).toBe(true);
      }
      if (right <= still.cols - 1) {
        expect(cells[right], `row ${r} right edge`).toBe(1);
        expect(cells.slice(right + 1).every((cell) => cell === 0)).toBe(true);
      }
    }
    // The picture reaches the bottom of the screen with something on it.
    expect(row(still, still.rows - 1).some((cell) => cell === 1)).toBe(true);
    // Wrapping would put live cells at the far edges before the cone gets
    // there; a 41-wide screen at row 10 has a 21-wide cone and dead margins.
    const narrow = createIconicRuleStill(MAC_STILL_RULE, 41, 12);
    expect(
      row(narrow, 10)
        .slice(0, 10)
        .every((cell) => cell === 0),
    ).toBe(true);
    expect(
      row(narrow, 10)
        .slice(31)
        .every((cell) => cell === 0),
    ).toBe(true);
  });

  it("is symmetric about the seed and deterministic", () => {
    const still = createIconicRuleStill(MAC_STILL_RULE, 41, 20);
    for (let r = 0; r < still.rows; r++) {
      const cells = row(still, r);
      expect(cells, `row ${r}`).toEqual([...cells].reverse());
    }
    const again = createIconicRuleStill(MAC_STILL_RULE, 41, 20);
    expect(Array.from(again.cells)).toEqual(Array.from(still.cells));
  });
});
