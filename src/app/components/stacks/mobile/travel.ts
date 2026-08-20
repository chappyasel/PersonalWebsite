export function nearestAuthoredStop(position: number, unitCount: number) {
  return Math.min(unitCount - 1, Math.max(0, Math.round(position)));
}

/** Manual framing is deliberately biased toward inspection. Pulling back is
 * only a small correction; portrait composition already shows the unit. */
export const WORLD_ZOOM_MIN = -0.75;
export const WORLD_ZOOM_MAX = 5.5;

export function clampWorldZoom(value: number) {
  return Math.min(WORLD_ZOOM_MAX, Math.max(WORLD_ZOOM_MIN, value));
}

/** Upward movement moves closer. A full-height phone drag spans most of the
 * range while leaving enough precision for small framing corrections. */
export function worldZoomFromVerticalDrag(start: number, deltaY: number) {
  return clampWorldZoom(start - deltaY * 0.0065);
}

export function authoredTravelStops(
  unitCount: number,
  additionalStops: readonly number[] = [],
) {
  return [
    ...Array.from({ length: unitCount }, (_, unit) => unit),
    ...additionalStops,
  ].sort((a, b) => a - b);
}

export function projectedInertiaDistance(
  velocityPxMs: number,
  decay = 0.92,
  frameMs = 16.7,
) {
  if (decay <= 0 || decay >= 1) return 0;
  return (velocityPxMs * frameMs) / (1 - decay);
}

export function shouldSettleInterruptedTravel(
  inertiaFrame: number | null,
  settledUnit: number | null,
  atAuthoredStop: boolean,
  reason: "new-contact" | "cleanup",
) {
  return (
    reason === "new-contact" &&
    (inertiaFrame !== null || (settledUnit === null && !atAuthoredStop))
  );
}

export function isAtAuthoredTravelStop(
  position: number,
  unitCount: number,
  additionalStops: readonly number[] = [],
  tolerance = 0.015,
) {
  return authoredTravelStops(unitCount, additionalStops).some(
    (stop) => Math.abs(position - stop) <= tolerance,
  );
}

export function unitForScrollPosition(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  unitCount: number,
) {
  const max = Math.max(1, scrollWidth - clientWidth);
  return nearestAuthoredStop((scrollLeft / max) * (unitCount - 1), unitCount);
}
