type DesktopLensGeometry = {
  viewportWidth: number;
  navRightPx: number;
  /** The visible card column's left edge, or null while details are closed. */
  detailsLeftPx: number | null;
};

/** Normalized x-coordinate for the desktop tilt-shift's clear vertical line. */
export function desktopLensCenter({
  viewportWidth,
  navRightPx,
  detailsLeftPx,
}: DesktopLensGeometry) {
  if (viewportWidth <= 0 || navRightPx <= 0) return 0.5;

  const navRight = Math.min(Math.max(navRightPx, 0), viewportWidth);
  const detailsLeft = Math.min(
    Math.max(detailsLeftPx ?? viewportWidth, navRight),
    viewportWidth,
  );

  return (navRight + detailsLeft) / 2 / viewportWidth;
}

export function desktopLensLine(geometry: DesktopLensGeometry) {
  const center = desktopLensCenter(geometry);
  return {
    start: [center, 0] as [number, number],
    end: [center, 1] as [number, number],
  };
}

export function captureLensCenterFromSearch(search: string) {
  const raw = new URLSearchParams(search).get("og-lens-center");
  if (raw == null) return null;
  const center = Number(raw);
  return Number.isFinite(center) && center >= 0 && center <= 1 ? center : null;
}

export function sideLensPlan({
  seated,
  captureCenter,
  ...geometry
}: DesktopLensGeometry & {
  seated: boolean;
  captureCenter: number | null;
}) {
  const center = captureCenter ?? desktopLensCenter(geometry);
  return {
    line: {
      start: [center, 0] as [number, number],
      end: [center, 1] as [number, number],
    },
    blur: seated ? 0.018 : 0.105,
    // The OG crop has no reading dock. Widen its clear band so the shelf stays
    // legible while both outer edges retain the authored side softness.
    taper: seated ? 0.86 : captureCenter == null ? 0.6 : 1,
  };
}
