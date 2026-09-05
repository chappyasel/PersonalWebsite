/**
 * Wheel zoom for the ride's chase camera.
 *
 * A wheel notch or trackpad scroll changes how far the eye sits from the
 * car's rear face. The zoom is a multiplier on that distance, kept in
 * natural-log units so a notch in and a notch out cancel exactly and the
 * bounds are symmetric, and the camera follows its target with frame-rate
 * independent exponential damping so a flick of the wheel reads as one slow
 * glide rather than a series of steps. Wheel forward (negative deltaY, the
 * map convention) closes in.
 *
 * Pure so the bounds, the per-notch step, the damping curve and the
 * direction are all assertable without a renderer; the world owns the
 * listener and the refs.
 */
export const VISION_RIDE_ZOOM = {
  /** Farthest the wheel can push the eye out, as a multiplier on the
   * distance to the car's rear; wheel-in closes to the reciprocal. 1.6, up
   * from a first cut at 1.25 the owner found too tight. Wheel-in at the
   * breath's crest with the brake held would put the eye a metre off the
   * bumper, which is where the frame's own floor (`nearestChaseDepth`)
   * takes over; wheel-out with the accelerator held in portrait puts the
   * eye 12.3 m behind the settle point, which the landscape mesh covers
   * with the grid's near margin to spare. */
  reach: 1.6,
  /** Natural-log change per pixel of wheel travel. A mouse notch (100 px)
   * moves the distance 4 %; the full range is about 24 notches. */
  logPerPixel: 0.0004,
  /** Exponential damping toward the wheel's target, per second: a notch
   * covers 84 % of its travel in the first second and settles in two. */
  dampingPerSecond: 1.8,
  /** Pixels per line for wheel events reported in lines (Firefox with a
   * mouse); page-mode events scale by the viewport height. */
  linePixels: 33,
} as const;

export const VISION_RIDE_ZOOM_LOG_BOUND = Math.log(VISION_RIDE_ZOOM.reach);

/** Log-zoom change for one wheel event: positive out, negative in. */
export function wheelZoomDelta(
  event: Pick<WheelEvent, "deltaY" | "deltaMode">,
  viewportHeight: number,
) {
  const pixels =
    event.deltaMode === 1
      ? event.deltaY * VISION_RIDE_ZOOM.linePixels
      : event.deltaMode === 2
        ? event.deltaY * Math.max(0, viewportHeight)
        : event.deltaY;
  if (!Number.isFinite(pixels)) return 0;
  return pixels * VISION_RIDE_ZOOM.logPerPixel;
}

export function clampZoomLog(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(
    -VISION_RIDE_ZOOM_LOG_BOUND,
    Math.min(VISION_RIDE_ZOOM_LOG_BOUND, value),
  );
}

/** One damping step of the live log-zoom toward its target over `delta`
 * seconds. Exponential against time, not a per-frame factor, so the glide
 * is the same at 60 and 120 Hz. */
export function advanceZoom(current: number, target: number, delta: number) {
  const seconds = Math.max(0, delta);
  const blend = 1 - Math.exp(-VISION_RIDE_ZOOM.dampingPerSecond * seconds);
  const next = current + (target - current) * blend;
  // Land exactly so the camera stops moving instead of creeping forever.
  return Math.abs(target - next) < 1e-5 ? target : next;
}

/** Multiplier on the distance to the car's rear face for a log-zoom. */
export function zoomDistanceScale(logZoom: number) {
  return Math.exp(clampZoomLog(logZoom));
}
