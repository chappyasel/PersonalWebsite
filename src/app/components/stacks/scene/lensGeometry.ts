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
