export type CoordinationGlobeLegibility = Readonly<{
  baseLineOpacity: number;
  baseLineWidthPx: number;
  ditherBandCoverage: number;
  ditherCellPx: number;
  nodeScale: number;
  revealLineWidthPx: number;
}>;

const FULL_RESOLUTION: CoordinationGlobeLegibility = {
  baseLineOpacity: 0.27,
  baseLineWidthPx: 1,
  ditherBandCoverage: 0.7,
  ditherCellPx: 3.2,
  nodeScale: 1,
  revealLineWidthPx: 3.4,
};

const LOW_RESOLUTION: CoordinationGlobeLegibility = {
  baseLineOpacity: 0.41,
  baseLineWidthPx: 1.35,
  ditherBandCoverage: 0.82,
  ditherCellPx: 1.5,
  nodeScale: 1.55,
  revealLineWidthPx: 2.2,
};

const LOW_RESOLUTION_MEGAPIXELS = 0.4;
const FULL_RESOLUTION_MEGAPIXELS = 1;

function interpolate(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

/** Preserve the authored presentation above one megapixel. Below it, spend
 * the shrinking sample budget on graph contrast and finer edge cells instead
 * of allowing one reveal chord and coarse dither blocks to dominate. */
export function coordinationGlobeLegibility(
  renderMegapixels: number,
): CoordinationGlobeLegibility {
  const megapixels = Number.isFinite(renderMegapixels)
    ? Math.max(0, renderMegapixels)
    : FULL_RESOLUTION_MEGAPIXELS;
  const linear = Math.max(
    0,
    Math.min(
      1,
      (FULL_RESOLUTION_MEGAPIXELS - megapixels) /
        (FULL_RESOLUTION_MEGAPIXELS - LOW_RESOLUTION_MEGAPIXELS),
    ),
  );
  const lowResolutionAmount = linear * linear * (3 - 2 * linear);

  return {
    baseLineOpacity: interpolate(
      FULL_RESOLUTION.baseLineOpacity,
      LOW_RESOLUTION.baseLineOpacity,
      lowResolutionAmount,
    ),
    baseLineWidthPx: interpolate(
      FULL_RESOLUTION.baseLineWidthPx,
      LOW_RESOLUTION.baseLineWidthPx,
      lowResolutionAmount,
    ),
    ditherBandCoverage: interpolate(
      FULL_RESOLUTION.ditherBandCoverage,
      LOW_RESOLUTION.ditherBandCoverage,
      lowResolutionAmount,
    ),
    ditherCellPx: interpolate(
      FULL_RESOLUTION.ditherCellPx,
      LOW_RESOLUTION.ditherCellPx,
      lowResolutionAmount,
    ),
    nodeScale: interpolate(
      FULL_RESOLUTION.nodeScale,
      LOW_RESOLUTION.nodeScale,
      lowResolutionAmount,
    ),
    revealLineWidthPx: interpolate(
      FULL_RESOLUTION.revealLineWidthPx,
      LOW_RESOLUTION.revealLineWidthPx,
      lowResolutionAmount,
    ),
  };
}
