export const TOUCH_TRAVEL_COMMIT_PX = 36;
export const TOUCH_TRAVEL_MAX_STOP_JUMP = 3;

export type TouchTravelStop = {
  position: number;
  scrollLeft: number;
};

function nearestStopIndex(
  scrollLeft: number,
  stops: readonly TouchTravelStop[],
) {
  let nearest = 0;
  let distance = Infinity;
  for (let index = 0; index < stops.length; index += 1) {
    const next = Math.abs(stops[index]!.scrollLeft - scrollLeft);
    if (next < distance) {
      nearest = index;
      distance = next;
    }
  }
  return nearest;
}

export function touchSwipeScrollBounds({
  startScrollLeft,
  stops,
  maxStopJump = TOUCH_TRAVEL_MAX_STOP_JUMP,
}: {
  startScrollLeft: number;
  stops: readonly TouchTravelStop[];
  maxStopJump?: number;
}) {
  if (stops.length === 0) return null;
  const origin = nearestStopIndex(startScrollLeft, stops);
  return {
    min: stops[Math.max(0, origin - maxStopJump)]!.scrollLeft,
    max: stops[Math.min(stops.length - 1, origin + maxStopJump)]!.scrollLeft,
  };
}

/** A short, deliberate phone swipe should cross one authored stop even when
 * it does not cover half the viewport. Longer native momentum can still cross
 * several stops because the nearest final stop wins once it is farther away. */
export function touchSwipeDestination({
  startScrollLeft,
  endScrollLeft,
  stops,
  commitPx = TOUCH_TRAVEL_COMMIT_PX,
}: {
  startScrollLeft: number;
  endScrollLeft: number;
  stops: readonly TouchTravelStop[];
  commitPx?: number;
}) {
  if (stops.length === 0) return null;
  const nearestEnd = nearestStopIndex(endScrollLeft, stops);
  const delta = endScrollLeft - startScrollLeft;
  if (Math.abs(delta) < commitPx) return stops[nearestEnd]!.position;

  const origin = nearestStopIndex(startScrollLeft, stops);
  const minDestination = Math.max(0, origin - TOUCH_TRAVEL_MAX_STOP_JUMP);
  const maxDestination = Math.min(
    stops.length - 1,
    origin + TOUCH_TRAVEL_MAX_STOP_JUMP,
  );
  const adjacent = Math.min(
    maxDestination,
    Math.max(minDestination, origin + (delta > 0 ? 1 : -1)),
  );
  const destination =
    delta > 0
      ? Math.min(maxDestination, Math.max(adjacent, nearestEnd))
      : Math.max(minDestination, Math.min(adjacent, nearestEnd));
  return stops[destination]!.position;
}
