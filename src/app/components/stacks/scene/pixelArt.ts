/**
 * Pixel-art finish.
 *
 * The composer already renders the room as a photograph; this pass redraws
 * that photograph the way a 1990s paint program would have saved it. Three
 * steps, all in one final Effect so SMAA cannot soften the result afterward:
 *
 *  1. Block sample. Every output pixel inside an N×N block (N in CSS pixels,
 *     so the grid stays put while the DPR ladder moves) reads the same
 *     box-filtered colour from the middle of the block.
 *  2. Ordered dither. A 4×4 Bayer threshold indexed by BLOCK, not by screen
 *     pixel, so the pattern is anchored to the art grid and one art pixel is
 *     one dither cell.
 *  3. Quantise in display space, either to L levels per channel (L=6 is the
 *     216-colour web palette, the classic dithered-GIF look) or to a fixed
 *     32-colour palette (DawnBringer 32) by nearest colour.
 *
 * Two looks ship, one per circuit board on the Projects shelf (owner picks,
 * 2026-08-23): the Arduino switches "8-bit", the green card "16-bit".
 * Clicking the lit board again switches the finish off. The Effect wipes
 * between looks from the board that was clicked, each side of the front on
 * its own grid: 8-bit is the coarser of the two, the way the consoles were.
 *
 * `?pixel` still seeds the finish at load for screenshots and tuning; the
 * extra `pixelLevels` / `pixelDither` / `pixelPalette` switches override the
 * preset it would otherwise use.
 */

export type PixelLook = "off" | "levels" | "palette";

export type PixelArtPlan = Readonly<{
  /** Art pixel edge in CSS pixels. */
  blockCss: number;
  /** Quantisation levels per channel in display space. Ignored by palette. */
  levels: number;
  /** Dither amplitude in quantisation steps. 0 disables the Bayer pattern. */
  dither: number;
  /** Snap to the fixed palette instead of per-channel levels. */
  palette: boolean;
}>;

export const PIXEL_LOOK_PLANS: Readonly<
  Record<Exclude<PixelLook, "off">, PixelArtPlan>
> = Object.freeze({
  // "8-bit": eight levels a channel (512 colours) under a six-tenths dither
  // on a 5 px grid. The sky bands like the reference painting and flat
  // surfaces stay flat.
  levels: Object.freeze({
    blockCss: 5,
    levels: 8,
    dither: 0.6,
    palette: false,
  }),
  // "16-bit": DawnBringer 32 by nearest colour on a finer 4 px grid. The
  // strongest console feel; the dark sky settles into one indigo with stars
  // instead of speckle. A quarter finer than 8-bit, enough to feel like the
  // next machine up without the looks drifting apart.
  palette: Object.freeze({
    blockCss: 4,
    levels: 8,
    dither: 0.5,
    palette: true,
  }),
});

/** Seconds for the wipe to cross the frame, either direction. */
export const PIXEL_WIPE_SECONDS = 1.1;

function numberParam(
  params: URLSearchParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const raw = params.get(key);
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function searchParams(search: string | URLSearchParams) {
  return typeof search === "string" ? new URLSearchParams(search) : search;
}

/** Which look `?pixel` asks for at load, or "off" without it. */
export function pixelLookFromSearch(
  search: string | URLSearchParams,
): PixelLook {
  const params = searchParams(search);
  if (!params.has("pixel")) return "off";
  const palette = params.get("pixelPalette");
  return palette != null && palette !== "0" && palette !== "off"
    ? "palette"
    : "levels";
}

/**
 * The plan a look renders with. Without `?pixel` this is the preset; with it,
 * `?pixel=6`, `pixelLevels`, `pixelDither` override the preset's numbers so a
 * URL can still tune the finish in place.
 */
export function pixelArtPlanFor(
  look: Exclude<PixelLook, "off">,
  search: string | URLSearchParams = "",
): PixelArtPlan {
  const preset = PIXEL_LOOK_PLANS[look];
  const params = searchParams(search);
  if (!params.has("pixel")) return preset;
  const rawBlock = params.get("pixel");
  const blockCss =
    rawBlock === "" || rawBlock === null
      ? preset.blockCss
      : numberParam(params, "pixel", preset.blockCss, 1, 32);
  return {
    blockCss,
    levels: Math.round(
      numberParam(params, "pixelLevels", preset.levels, 2, 32),
    ),
    dither: numberParam(params, "pixelDither", preset.dither, 0, 2),
    palette: preset.palette,
  };
}

/** Block edge in framebuffer pixels. Rounded so every art pixel covers the
 * same integer number of device pixels; a 4.4 px block would alternate 4 and
 * 5 px cells and the grid would read as uneven. */
export function pixelArtBlockPixels(blockCss: number, pixelRatio: number) {
  return Math.max(1, Math.round(blockCss * pixelRatio));
}

/** The look a board click lands on: its own look, or off if already lit. */
export function nextPixelLook(
  current: PixelLook,
  board: Exclude<PixelLook, "off">,
): PixelLook {
  return current === board ? "off" : board;
}

/**
 * Radius the wipe has to reach, in aspect-corrected uv units, to cover every
 * corner of the frame from `origin` (uv, y up). The far corner is always one
 * of the four, so this is the max of four distances.
 */
export function pixelWipeCoverRadius(
  origin: readonly [number, number],
  aspect: number,
) {
  let far = 0;
  for (const cx of [0, 1])
    for (const cy of [0, 1]) {
      const dx = (cx - origin[0]) * aspect;
      const dy = cy - origin[1];
      far = Math.max(far, Math.hypot(dx, dy));
    }
  return far;
}

/** DawnBringer 32, in display (sRGB) space, as GLSL `vec3(...)` literals. */
export const DB32_PALETTE: ReadonlyArray<readonly [number, number, number]> =
  Object.freeze(
    [
      "000000",
      "222034",
      "45283c",
      "663931",
      "8f563b",
      "df7126",
      "d9a066",
      "eec39a",
      "fbf236",
      "99e550",
      "6abe30",
      "37946e",
      "4b692f",
      "524b24",
      "323c39",
      "3f3f74",
      "306082",
      "5b6ee1",
      "639bff",
      "5fcde4",
      "cbdbfc",
      "ffffff",
      "9badb7",
      "847e87",
      "696a6a",
      "595652",
      "76428a",
      "ac3232",
      "d95763",
      "d77bba",
      "8f974a",
      "8a6f30",
    ].map(
      (hex) =>
        [
          parseInt(hex.slice(0, 2), 16) / 255,
          parseInt(hex.slice(2, 4), 16) / 255,
          parseInt(hex.slice(4, 6), 16) / 255,
        ] as const,
    ),
  );

export function paletteGlsl(
  palette: ReadonlyArray<readonly [number, number, number]>,
) {
  return palette
    .map(
      ([r, g, b]) => `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`,
    )
    .join(",\n    ");
}
