import type { Object3D, WebGLRenderer } from "three";

// Main-thread cost of a frame, measured from the start of the animation frame
// callback to the return of the last render submission.
//
// WHY THIS EXISTS. The quality controller used to see only the interval
// between animation frames, which is the same number whether the main thread
// is saturated or the GPU is. Those want opposite responses: a busy main
// thread needs less geometry and less per-frame work, a busy GPU needs fewer
// pixels. Measuring submission cost beside the interval is what lets the
// controller tell them apart.
//
// WHY IT IS SPLIT THIS WAY. The frame's start is marked from the earliest
// `useFrame` subscriber, because r3f sorts subscribers ascending by priority
// and the adaptive probe already owns the only negative priority in the
// scene. The frame's end has to come from a wrapper on the renderer, because
// once the composer mounts it is the composer, not r3f, that submits. The
// composer calls `render` once per pass, so the last call of the frame is the
// one that closes out main-thread work — hence "last write wins" rather than
// accumulate.
//
// The reading therefore lags by one frame: the probe runs before the render
// it would be measuring, so it reports the previous frame's cost. Over a
// two-second window that shifts the sample by one frame and changes no
// decision.

const WRAPPED = Symbol.for("stacks.sceneFrameCost.wrapped");

type InstrumentedRenderer = WebGLRenderer & { [WRAPPED]?: true };

let frameStartedAt = 0;
let lastFrameCpuMs = 0;
let lastMatrixMs = 0;

/** Called by the earliest frame subscriber, before any scene work runs. */
export function markSceneFrameStart(now: number) {
  frameStartedAt = now;
}

/** Main-thread milliseconds for the most recently submitted frame. */
export function readSceneFrameCpuMs() {
  return lastFrameCpuMs;
}

/** Milliseconds the last frame spent recomputing world matrices. */
export function readSceneMatrixMs() {
  return lastMatrixMs;
}

/**
 * Run the scene graph's world-matrix update here instead of inside the
 * renderer, so its cost can be attributed.
 *
 * `WebGLRenderer.render` begins with `if (scene.matrixWorldAutoUpdate)
 * scene.updateMatrixWorld()`. With that flag off and this called from the
 * earliest frame subscriber, the same traversal happens in the same order at
 * nearly the same moment — the only difference is that it is now timed.
 *
 * This is a measurement, not the freeze. Freezing means not doing the
 * traversal at all for the static majority of the graph, and there is no
 * point attempting that before knowing what the traversal costs.
 */
export function measureSceneMatrixCost(scene: Object3D) {
  const started = performance.now();
  scene.updateMatrixWorld();
  lastMatrixMs = performance.now() - started;
}

export function resetSceneFrameCost() {
  frameStartedAt = 0;
  lastFrameCpuMs = 0;
  lastMatrixMs = 0;
}

/**
 * Wrap the renderer's `render` so the return of the last submission closes the
 * frame's main-thread measurement. Returns a restore function. Wrapping twice
 * is a no-op, so a hot reload cannot stack wrappers.
 *
 * The wrapper forwards `this` and every argument and returns the original
 * result unchanged, so rendered output is identical with it installed.
 */
/** Returned when there is nothing to undo. Named so it is not an empty
 * arrow literal at the call site. */
function noRestore() {
  return undefined;
}

export function instrumentRendererFrameCost(renderer: WebGLRenderer) {
  const target = renderer as InstrumentedRenderer;
  if (target[WRAPPED]) return noRestore;

  // Read unbound on purpose: the wrapper below forwards `this` through
  // `.apply`, so the method never loses its receiver.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = renderer.render;
  const ownProperty = Object.prototype.hasOwnProperty.call(renderer, "render");

  function wrapped(
    this: WebGLRenderer,
    ...args: Parameters<WebGLRenderer["render"]>
  ) {
    const result = original.apply(this, args);
    // A frame that never had its start marked (an off-loop render, such as a
    // manual capture) must not invent a cost from a stale timestamp.
    if (frameStartedAt > 0) lastFrameCpuMs = performance.now() - frameStartedAt;
    return result;
  }

  renderer.render = wrapped;
  target[WRAPPED] = true;

  return () => {
    if (!target[WRAPPED]) return;
    if (ownProperty) renderer.render = original;
    else delete (renderer as Partial<WebGLRenderer>).render;
    delete target[WRAPPED];
    resetSceneFrameCost();
  };
}
