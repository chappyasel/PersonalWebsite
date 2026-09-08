/**
 * Depth layers for the painted skyline.
 *
 * The dome draws every landmark from one azimuth, `atan(dir) + uPan`, so the
 * whole painting sits at one infinite distance and the only thing that ever
 * slides it is the scroll pan. These offsets give the three painted masses
 * their own azimuth so they slide against each other: the city nearest, the
 * SF hills behind it, the Golden Gate farthest, which is the order the dome
 * already composites them in. Two sources, each behind its own console
 * switch so they can be judged separately:
 *
 * - Traverse: the near layer pans faster than the base pan by `spread` and
 *   the far layer slower by the same, anchored at the About stop (pan delta
 *   zero) so the boot frame and the OG card do not move. Across the row the
 *   near and far layers part by 2 · spread · PAN_SPAN.
 * - Pointer: the pointer's own head turn (parallax swing plus orbit, in
 *   radians, positive to the right) slides the layers by
 *   `turn · spread · gain`. A turn moves every far thing the same amount in
 *   real optics; this adds the 2.5D exaggeration that makes a mouse move
 *   read as depth.
 *
 * Offsets are ADDED to the base pan: increasing an azimuth offset moves a
 * drawn feature left on screen, which is the way a nearer thing goes as the
 * eye travels right or the head turns right.
 */
export type SkyDepthState = Readonly<{
  traverse: boolean;
  pointer: boolean;
  /** Pan-rate spread between layers: near 1 + spread, far 1 − spread. */
  spread: number;
  /** Multiplier on the pointer turn before the spread is applied. */
  gain: number;
}>;

export const SKY_DEPTH_DEFAULT: SkyDepthState = Object.freeze({
  traverse: false,
  pointer: false,
  spread: 0.15,
  gain: 2,
});

export const SKY_DEPTH_SPREAD_RANGE = Object.freeze({ min: 0, max: 0.5 });
export const SKY_DEPTH_GAIN_RANGE = Object.freeze({ min: 0, max: 6 });

export type SkyLayerPanOffsets = Readonly<{
  city: number;
  hills: number;
  bridge: number;
}>;

const ZERO_OFFSETS: SkyLayerPanOffsets = Object.freeze({
  city: 0,
  hills: 0,
  bridge: 0,
});

const finite = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

/** Per-layer azimuth offsets over the base pan, in radians.
 * `panDelta` is the base pan measured from the About stop (uPan + PAN_BIAS);
 * `turn` is the pointer's head turn in radians, positive to the right. */
export function skyLayerPanOffsets({
  panDelta,
  turn,
  state,
}: {
  panDelta: number;
  turn: number;
  state: SkyDepthState;
}): SkyLayerPanOffsets {
  const spread = Math.min(
    SKY_DEPTH_SPREAD_RANGE.max,
    Math.max(SKY_DEPTH_SPREAD_RANGE.min, finite(state.spread, 0)),
  );
  const gain = Math.min(
    SKY_DEPTH_GAIN_RANGE.max,
    Math.max(SKY_DEPTH_GAIN_RANGE.min, finite(state.gain, 0)),
  );
  const traverseTerm = state.traverse ? finite(panDelta, 0) * spread : 0;
  const pointerTerm = state.pointer ? finite(turn, 0) * spread * gain : 0;
  const slide = traverseTerm + pointerTerm;
  if (slide === 0) return ZERO_OFFSETS;
  return { city: slide, hills: 0, bridge: -slide };
}

/** The pointer's head turn this frame, radians, positive to the right.
 * Written by CameraRig, read by the sky dome; transient like progressRef. */
export const skyPointerTurn = { current: 0 };

export function createSkyDepthController(initial = SKY_DEPTH_DEFAULT) {
  let snapshot: SkyDepthState = initial;
  const listeners = new Set<() => void>();

  const publish = (next: SkyDepthState) => {
    if (
      snapshot.traverse === next.traverse &&
      snapshot.pointer === next.pointer &&
      snapshot.spread === next.spread &&
      snapshot.gain === next.gain
    )
      return snapshot;
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
    return snapshot;
  };

  return {
    getSnapshot: () => snapshot,

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setTraverse: (traverse: boolean) => publish({ ...snapshot, traverse }),

    setPointer: (pointer: boolean) => publish({ ...snapshot, pointer }),

    setSpread: (spread: number) =>
      publish({
        ...snapshot,
        spread: Math.min(
          SKY_DEPTH_SPREAD_RANGE.max,
          Math.max(
            SKY_DEPTH_SPREAD_RANGE.min,
            finite(spread, SKY_DEPTH_DEFAULT.spread),
          ),
        ),
      }),

    setGain: (gain: number) =>
      publish({
        ...snapshot,
        gain: Math.min(
          SKY_DEPTH_GAIN_RANGE.max,
          Math.max(
            SKY_DEPTH_GAIN_RANGE.min,
            finite(gain, SKY_DEPTH_DEFAULT.gain),
          ),
        ),
      }),

    reset: () => publish(SKY_DEPTH_DEFAULT),
  };
}

export const skyDepthController = createSkyDepthController();
