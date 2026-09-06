// The compact Mac's screen, in two acts.
//
// Act one is the pixel Happy Mac boot face, which tracks the pointer and
// blinks. Act two is the cellular automaton that ran as the full-page
// background of the previous version of this site (GameOfLife.tsx on the flat
// homepage until January 2026): a one-dimensional elementary rule scrolls up
// from the bottom row, and a band of Conway's Life along the top eats whatever
// arrives. The rule is one of Wolfram's interesting seven, picked per load,
// and the colours are the Cofactory landing page's, not the boot face's blue.
//
// Everything here is pure so the simulation can be tested without a canvas.
// The React side (MacScreen in units/UnitProjects.tsx) owns the texture, the
// clock, and the decision of when the boot face gives way.

/** The raster's proportion is the model's bezel opening (0.0392 × 0.0315
 * inside the rim) less an even margin, not the real machine's 3:2: on this
 * opening a 3:2 picture leaves twice the margin above and below that it does
 * at the sides. One canvas serves both distances: mipmapped minification
 * averages it to a soft flicker from the shelf, and the nearest magnifier
 * keeps the cells square when the Mac is brought to the camera. */
export const MAC_SCREEN_WIDTH = 168;
export const MAC_SCREEN_HEIGHT = 128;
export const MAC_RASTER_ASPECT = MAC_SCREEN_WIDTH / MAC_SCREEN_HEIGHT;
/** Texels per automaton cell. */
export const MAC_SCREEN_CELL = 2;
export const MAC_SCREEN_COLS = MAC_SCREEN_WIDTH / MAC_SCREEN_CELL;
export const MAC_SCREEN_ROWS = MAC_SCREEN_HEIGHT / MAC_SCREEN_CELL;
/** Rows of Life across the top; the rest scrolls the one-dimensional rule.
 * The old page gave Life its top quarter. A 9-inch CRT is squarer than a
 * browser window, and the rule's triangles are the richer texture, so Life
 * gets a little more than a third here and the rule keeps the rest. */
export const MAC_LIFE_ROWS = 24;
/** Generations per second. The old background ran at six. */
export const MAC_SCREEN_STEP_HZ = 6;
export const MAC_SCREEN_STEP_SECONDS = 1 / MAC_SCREEN_STEP_HZ;
/** How long the Happy Mac face holds after arriving at Projects before the
 * screen boots into the automaton, unless a pointer rests on the machine or
 * it is brought to the camera first. Drawn once per arrival between the two
 * bounds so the shelf never feels metronomic. */
export const MAC_BOOT_HOLD_MIN_SECONDS = 5;
export const MAC_BOOT_HOLD_MAX_SECONDS = 10;
/** The boot itself. The face squeezes to a bright line the way a tube
 * switches off, the screen sits dark, then the automaton fades up. */
export const MAC_BOOT_SECONDS = 1.6;
/** Fractions of MAC_BOOT_SECONDS: the collapse ends, then the dark ends. */
export const MAC_BOOT_COLLAPSE_END = 0.22;
export const MAC_BOOT_DARK_END = 0.5;
/** Under reduced motion the automaton is painted once, this far in. */
export const MAC_STILL_GENERATIONS = 48;
/** https://plato.stanford.edu/entries/cellular-automata/supplement.html */
export const MAC_AUTOMATON_RULES = [22, 30, 45, 73, 86, 105, 150] as const;

/** The Happy Mac's own two tones, for the boot face. */
export const MAC_SCREEN_INK = {
  screen: "#79a6e8",
  light: "#e8f0e3",
  dark: "#14213a",
  scanline: "rgba(16, 30, 54, 0.08)",
} as const;

/** The automaton keeps the palette the Cofactory landing page ran it in: a
 * black screen, live cells coloured by their position in a repeating 3 × 3
 * tiling, dead cells a grey so dim it is only a hint that the grid is there
 * (that page drew them at a fifth of these greys over black; the products are
 * baked in here). */
export const MAC_LIFE_BACKGROUND = "#000000";
export const MAC_LIFE_PALETTE = [
  ["#ff0000", "#ff00ff", "#8000ff"],
  ["#ff8000", "#ffffff", "#0000ff"],
  ["#ffff00", "#00ff00", "#00ffff"],
] as const;
export const MAC_LIFE_DIM = [
  ["#0d0d0d", "#131313", "#101010"],
  ["#101010", "#161616", "#0d0d0d"],
  ["#131313", "#0d0d0d", "#131313"],
] as const;

export type MacAutomaton = {
  readonly cols: number;
  readonly rows: number;
  /** Rows 0..lifeRows inclusive run Life. Row `lifeRows` is the seam: the
   * scroll refills it every generation, so Life reads the rule's output as
   * a boundary that never stops changing. */
  readonly lifeRows: number;
  readonly rule: number;
  readonly kernel: Uint8Array;
  /** Row-major, one byte per cell. */
  readonly cells: Uint8Array;
  readonly nextRow: Uint8Array;
  readonly neighbours: Uint8Array;
  generation: number;
};

export function macAutomatonRule(random: number): number {
  const index = Math.min(
    MAC_AUTOMATON_RULES.length - 1,
    Math.max(0, Math.floor(random * MAC_AUTOMATON_RULES.length)),
  );
  return MAC_AUTOMATON_RULES[index]!;
}

export function createMacAutomaton(
  rule: number,
  cols = MAC_SCREEN_COLS,
  rows = MAC_SCREEN_ROWS,
  lifeRows = MAC_LIFE_ROWS,
  seed = true,
): MacAutomaton {
  const kernel = new Uint8Array(8);
  for (let i = 0; i < 8; i++) kernel[i] = (rule >> i) & 1;
  const cells = new Uint8Array(rows * cols);
  // The old page started from one live cell in the middle of the bottom row.
  if (seed) cells[(rows - 1) * cols + Math.floor(cols / 2)] = 1;
  return {
    cols,
    rows,
    lifeRows: Math.min(rows - 1, lifeRows),
    rule,
    kernel,
    cells,
    nextRow: new Uint8Array(cols),
    neighbours: new Uint8Array((Math.min(rows - 1, lifeRows) + 1) * cols),
    generation: 0,
  };
}

/** One generation: the rule advances the bottom row, everything above the
 * Life band scrolls up one row, and the band takes a Life step. */
export function stepMacAutomaton(a: MacAutomaton): void {
  const { cols, rows, lifeRows, kernel, cells, nextRow, neighbours } = a;
  const bottom = (rows - 1) * cols;

  for (let c = 0; c < cols; c++) {
    const left = cells[bottom + ((c - 1 + cols) % cols)]!;
    const centre = cells[bottom + c]!;
    const right = cells[bottom + ((c + 1) % cols)]!;
    nextRow[c] = kernel[left * 4 + centre * 2 + right]!;
  }
  if (lifeRows < rows - 1)
    cells.copyWithin(lifeRows * cols, (lifeRows + 1) * cols, rows * cols);
  cells.set(nextRow, bottom);

  // Life on rows 0..lifeRows. Horizontal wrap, dead above and below.
  neighbours.fill(0);
  for (let r = 0; r <= lifeRows; r++) {
    const row = r * cols;
    for (let c = 0; c < cols; c++) {
      if (cells[row + c] !== 1) continue;
      for (let dr = -1; dr <= 1; dr++) {
        const nr = r + dr;
        if (nr < 0 || nr > lifeRows) continue;
        const neighbourRow = nr * cols;
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          neighbours[neighbourRow + ((c + dc + cols) % cols)]!++;
        }
      }
    }
  }
  const bandEnd = (lifeRows + 1) * cols;
  for (let i = 0; i < bandEnd; i++) {
    const n = neighbours[i]!;
    if (cells[i] === 1) {
      if (n < 2 || n > 3) cells[i] = 0;
    } else if (n === 3) cells[i] = 1;
  }
  a.generation++;
}

export type MacScreenPhase = "face" | "booting" | "life";

export function macBootHoldSeconds(random: number): number {
  const t = Math.min(1, Math.max(0, random));
  return (
    MAC_BOOT_HOLD_MIN_SECONDS +
    t * (MAC_BOOT_HOLD_MAX_SECONDS - MAC_BOOT_HOLD_MIN_SECONDS)
  );
}

/** The boot face holds for `holdSeconds` after arriving at the shelf, or
 * until a pointer rests on the machine or it is brought to the camera; then
 * the boot runs for MAC_BOOT_SECONDS and the screen stays booted. Re-arrival
 * is the caller's decision, made by resetting the phase to "face". */
export function nextMacScreenPhase(
  phase: MacScreenPhase,
  input: {
    activeSeconds: number;
    holdSeconds: number;
    hovered: boolean;
    near: boolean;
    bootSeconds: number;
  },
): MacScreenPhase {
  if (phase === "life") return "life";
  if (phase === "booting")
    return input.bootSeconds >= MAC_BOOT_SECONDS ? "life" : "booting";
  return input.hovered || input.near || input.activeSeconds >= input.holdSeconds
    ? "booting"
    : "face";
}

/** The slice of a 2D context the painters need, so a test can hand in a
 * recorder instead of a canvas. */
export type MacScreenPainter = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  imageSmoothingEnabled: boolean;
  fillRect(x: number, y: number, width: number, height: number): void;
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  translate(x: number, y: number): void;
};

/** Faint scan lines sell glass without softening the pixel art. Every other
 * texel row, which with two-texel cells dims the lower half of every cell
 * the same amount. */
function paintScanlines(ctx: MacScreenPainter) {
  ctx.fillStyle = MAC_SCREEN_INK.scanline;
  for (let y = 1; y < MAC_SCREEN_HEIGHT; y += 2)
    ctx.fillRect(0, y, MAC_SCREEN_WIDTH, 1);
}

export function paintMacAutomaton(ctx: MacScreenPainter, a: MacAutomaton) {
  const cell = MAC_SCREEN_CELL;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = MAC_LIFE_BACKGROUND;
  ctx.fillRect(0, 0, MAC_SCREEN_WIDTH, MAC_SCREEN_HEIGHT);
  const { cols, rows, cells } = a;
  for (let r = 0; r < rows; r++) {
    const row = r * cols;
    const y = r * cell;
    const live = MAC_LIFE_PALETTE[r % 3]!;
    const dim = MAC_LIFE_DIM[r % 3]!;
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (cells[row + c] === 1 ? live : dim)[c % 3]!;
      ctx.fillRect(c * cell, y, cell, cell);
    }
  }
  paintScanlines(ctx);
}

/** Pixel Happy Mac boot mark, authored on a 64-texel square, scaled to the
 * raster's height and centred across its width so the art stays in whole
 * pixels. The GLB's own tiny face geometry is hidden under the screen tint;
 * this is what reads as switched on. */
export function paintHappyMac(
  ctx: MacScreenPainter,
  gazeX: number,
  gazeY: number,
  blink: boolean,
) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = MAC_SCREEN_INK.screen;
  ctx.fillRect(0, 0, MAC_SCREEN_WIDTH, MAC_SCREEN_HEIGHT);
  ctx.save();
  const unit = MAC_SCREEN_HEIGHT / 64;
  ctx.scale(unit, unit);
  ctx.translate((MAC_SCREEN_WIDTH / unit - 64) / 2, 0);

  // A tiny classic Macintosh silhouette, drawn in whole pixels.
  ctx.fillStyle = MAC_SCREEN_INK.dark;
  ctx.fillRect(14, 7, 36, 45);
  ctx.fillRect(11, 50, 42, 5);
  ctx.fillStyle = MAC_SCREEN_INK.light;
  ctx.fillRect(18, 11, 28, 35);
  ctx.fillRect(18, 46, 24, 4);

  // Recessed screen and the smiling boot face.
  ctx.fillStyle = MAC_SCREEN_INK.dark;
  ctx.fillRect(20, 14, 24, 22);
  ctx.fillStyle = MAC_SCREEN_INK.screen;
  ctx.fillRect(23, 17, 18, 16);
  ctx.fillStyle = MAC_SCREEN_INK.dark;
  if (blink) {
    ctx.fillRect(26, 23, 3, 1);
    ctx.fillRect(36, 23, 3, 1);
  } else {
    ctx.fillRect(26 + gazeX, 21 + gazeY, 3, 3);
    ctx.fillRect(36 + gazeX, 21 + gazeY, 3, 3);
  }
  ctx.fillRect(32, 23, 3, 5);
  ctx.fillRect(27, 28, 3, 3);
  ctx.fillRect(30, 30, 9, 3);
  ctx.fillRect(39, 27, 3, 3);

  // Floppy slot and power light complete the silhouette at scene scale.
  ctx.fillRect(31, 41, 12, 3);
  ctx.fillRect(42, 46, 3, 2);

  ctx.restore();
  paintScanlines(ctx);
}

/** One frame of the boot, `progress` in 0..1. The face is redrawn squeezed
 * toward the centre line and whitening until it is a bright bar, the screen
 * goes dark, and the automaton eases up from black. Whatever is painted here
 * is painted over the whole raster, so a frame never shows through another. */
export function paintMacBoot(
  ctx: MacScreenPainter,
  a: MacAutomaton,
  progress: number,
  gazeX: number,
  gazeY: number,
) {
  const W = MAC_SCREEN_WIDTH;
  const H = MAC_SCREEN_HEIGHT;
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.fillStyle = MAC_LIFE_BACKGROUND;
  ctx.fillRect(0, 0, W, H);
  if (progress < MAC_BOOT_COLLAPSE_END) {
    const t = Math.max(0, progress) / MAC_BOOT_COLLAPSE_END;
    const squash = Math.max(2 / H, 1 - t * t);
    ctx.save();
    ctx.translate(0, H / 2);
    ctx.scale(1, squash);
    ctx.translate(0, -H / 2);
    paintHappyMac(ctx, gazeX, gazeY, false);
    ctx.globalAlpha = t * t;
    ctx.fillStyle = MAC_SCREEN_INK.light;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }
  if (progress < MAC_BOOT_DARK_END) return;
  const t = Math.min(
    1,
    (progress - MAC_BOOT_DARK_END) / (1 - MAC_BOOT_DARK_END),
  );
  ctx.globalAlpha = t * t;
  paintMacAutomaton(ctx, a);
  ctx.globalAlpha = 1;
}
