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
const MATRIX_WRAPPED = Symbol.for("stacks.sceneMatrixCost.wrapped");

type InstrumentedRenderer = WebGLRenderer & { [WRAPPED]?: true };
type InstrumentedScene = Object3D & { [MATRIX_WRAPPED]?: true };

/**
 * State lives on `globalThis`, not in module scope.
 *
 * This module is imported by the canvas chunk AND the diagnostics chunk, and
 * the bundler emits its code into more than one chunk — `grep -l` on the
 * built output finds the wrapper symbol in two of them. Module-scope `let`
 * therefore risks giving each importer its own copy, where the writer and the
 * reader never see each other.
 *
 * Two things depended on that crossing and were silently dead: the overlay
 * read `readSceneMatrixMs()` and always got zero ("matrix cost not
 * measured"), and `markSceneFrameInstrumented` is called from the perch
 * diagnostics while `takeSceneFrameInstrumented` is called from the canvas —
 * so the fix that stopped the controller adapting to its own instrumentation
 * could never fire.
 *
 * A single well-known key makes duplication harmless: however many copies of
 * this module exist, they all read and write one object.
 */
type FrameCostStore = {
  frameStartedAt: number;
  lastFrameCpuMs: number;
  lastMatrixMs: number;
  frameWasInstrumented: boolean;
};

const STORE_KEY = "__stacksSceneFrameCost";

const store: FrameCostStore = ((
  globalThis as unknown as Record<string, FrameCostStore | undefined>
)[STORE_KEY] ??= {
  frameStartedAt: 0,
  lastFrameCpuMs: 0,
  lastMatrixMs: 0,
  frameWasInstrumented: false,
});

/** Called by the earliest frame subscriber, before any scene work runs. */
export function markSceneFrameStart(now: number) {
  store.frameStartedAt = now;
}

/** Main-thread milliseconds for the most recently submitted frame. */
export function readSceneFrameCpuMs() {
  return store.lastFrameCpuMs;
}

/**
 * Declare that this frame carried development-only diagnostic work, so its
 * cost is not evidence about the scene.
 *
 * The perch diagnostics sweep every perch at 4 Hz in development, searching
 * over a hundred candidate landing curves. That is roughly eight expensive
 * frames in a 120-frame window — 6.7 percent, which is precisely where p95
 * lands. Measured through the real summariser, the same scene reads
 * `p95 16 ms / cpu 5 ms / unknown` clean and `p95 32 ms / cpu 28 ms / cpu`
 * with the sweep running. The controller was adapting to its own
 * instrumentation, in a build where none of that code ships.
 *
 * Excluding the frames is better than disabling the overlay: the diagnostics
 * keep working, `yarn check:perches` keeps its continuous catalogue, and any
 * future dev-only overlay gets the same protection by calling this.
 */
export function markSceneFrameInstrumented() {
  store.frameWasInstrumented = true;
}

/** Whether the frame just measured carried diagnostic work. Reading clears
 * it, so each frame is judged on its own. Same one-frame lag as the cost. */
export function takeSceneFrameInstrumented() {
  const value = store.frameWasInstrumented;
  store.frameWasInstrumented = false;
  return value;
}

/** Milliseconds the last frame spent recomputing world matrices. */
export function readSceneMatrixMs() {
  return store.lastMatrixMs;
}

/**
 * Time the scene graph's world-matrix traversal by wrapping the method the
 * renderer already calls.
 *
 * `WebGLRenderer.render` begins with `if (scene.matrixWorldAutoUpdate)
 * scene.updateMatrixWorld()`, which is after every `useFrame` callback has
 * moved whatever it moves. An earlier attempt measured this by turning the
 * flag off and running the traversal from the earliest frame subscriber
 * instead — which is BEFORE those callbacks, so everything that moved during
 * a frame rendered with the previous frame's world matrix. Wrapping keeps
 * three's own ordering and changes nothing but the timer.
 *
 * Only the scene's own call is wrapped. The recursion into children goes
 * through `Object3D.prototype`, so one call still covers the whole traversal.
 * Anything calling it a second time in a frame overwrites the reading, same
 * last-write-wins rule as the render wrapper.
 */
export function instrumentSceneMatrixCost(scene: Object3D) {
  const target = scene as InstrumentedScene;
  if (target[MATRIX_WRAPPED]) return noRestore;

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = scene.updateMatrixWorld;
  const ownProperty = Object.prototype.hasOwnProperty.call(
    scene,
    "updateMatrixWorld",
  );

  function wrapped(this: Object3D, force?: boolean) {
    const started = performance.now();
    original.call(this, force);
    store.lastMatrixMs = performance.now() - started;
  }

  scene.updateMatrixWorld = wrapped;
  target[MATRIX_WRAPPED] = true;

  return () => {
    if (!target[MATRIX_WRAPPED]) return;
    if (ownProperty) scene.updateMatrixWorld = original;
    else delete (scene as Partial<Object3D>).updateMatrixWorld;
    delete target[MATRIX_WRAPPED];
    store.lastMatrixMs = 0;
  };
}

export function resetSceneFrameCost() {
  store.frameStartedAt = 0;
  store.lastFrameCpuMs = 0;
  store.lastMatrixMs = 0;
  store.frameWasInstrumented = false;
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
    if (store.frameStartedAt > 0) store.lastFrameCpuMs = performance.now() - store.frameStartedAt;
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
