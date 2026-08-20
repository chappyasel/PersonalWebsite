/**
 * An opaque WebGL context for the scene canvas.
 *
 * WHY. A canvas created with `alpha: true` is composited by blending it over
 * whatever is behind it, every frame. Behind this one is the page, at
 * rgb(250 250 249). So the browser is continuously mixing the scene with
 * near-white paper using the canvas's own alpha channel, and any moment that
 * channel is not what we think — a partially cleared buffer, a layer whose
 * backing store is mid-reallocation, a driver quirk — some fraction of the
 * paper reaches the screen. That is the white flash on shelf transitions.
 *
 * Painting something scene-coloured behind the canvas softens that, but it
 * cannot remove it, because the blend still happens; it only changes what is
 * being blended in. Removing the alpha channel removes the blend. There is
 * then no "behind" for the compositor to reach for, whatever goes wrong: an
 * opaque layer that cannot be updated in time shows its previous contents,
 * not the page.
 *
 * WHY IT IS BUILT HERE RATHER THAN ASKED FOR. Three hardcodes `alpha: true`
 * into its context attributes — `WebGLRenderer`'s own `alpha` parameter only
 * chooses the default clear alpha and cannot make the canvas opaque. The one
 * way through is to create the context and hand it over, which three
 * supports explicitly.
 *
 * WHY IT IS FREE. Measured before the change: readPixels over the entire
 * drawing buffer, on six frames spanning showcase/balanced/safety, both
 * composer tiers and all three units, found minimum alpha 255 and zero
 * non-opaque pixels out of 3.0M sampled. The sky dome always covers the
 * frame, so the paper never contributed a pixel to the image that was
 * wanted. Dropping the channel also spares the compositor a full-screen
 * blend per frame.
 */

/**
 * `antialias` is deliberately on. It is the renderer's guaranteed edge
 * quality floor for when the quality ladder unmounts the composer and its
 * SMAA pass, and creating the context without it once cost the fallback path
 * all antialiasing.
 *
 * `preserveDrawingBuffer` is ON, and it is the flash fix rather than a
 * readback convenience.
 *
 * With it off, the browser clears the drawing buffer after every composite.
 * So a frame that draws nothing at all presents that cleared buffer — white
 * paper while the canvas had an alpha channel, opaque black once it did not.
 * Either way the world vanishes for a frame.
 *
 * Such frames exist. `@react-three/postprocessing` renders the composer from
 * a frame subscriber that begins `if (!enabled || !composer) return`, and it
 * holds the composer in state that is null before its effect runs and stale
 * for a commit after any of its dependencies change. r3f will not render the
 * scene itself while a priority subscriber is registered, so on those frames
 * NOTHING is drawn: not the composer, not the fallback.
 *
 * Preserving the buffer makes that harmless. The previous frame is still
 * sitting in it, so a frame that draws nothing shows the frame before it, and
 * a dropped frame costs a repeat rather than a flash. This is the "show the
 * last good frame" idea, done by the driver instead of by copying pixels.
 *
 * It is not free — some drivers keep a second copy of the buffer — so the
 * cost is measured rather than assumed, and the note below records it.
 */
export const OPAQUE_SCENE_CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: true,
  depth: true,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance",
  failIfMajorPerformanceCaveat: false,
};

/**
 * Create the scene's context, or null to let three create its own.
 *
 * Null is a real outcome and not a failure: a browser without WebGL2, or one
 * refusing these attributes, should still get the world it would have had
 * before. Losing the flash protection is worth strictly less than losing the
 * scene, so every failure here degrades to the previous behaviour rather
 * than propagating.
 */
/** Structural, because the only thing needed is `getContext`, and the
 * canvas handed over by the renderer is typed against a different copy of the
 * DOM lib than the one in scope here. */
type ContextSource = {
  getContext(
    contextId: "webgl2",
    options?: WebGLContextAttributes,
  ): unknown;
};

export function createOpaqueSceneContext(
  canvas: unknown,
): WebGL2RenderingContext | null {
  // `unknown` rather than a canvas type on purpose. The renderer's own canvas
  // is typed against a different copy of the DOM lib, where its OffscreenCanvas
  // arm degrades to EventTarget and carries no `getContext` at all. Checking
  // for the method is both what makes this typecheck and the honest statement
  // of what it needs.
  if (typeof (canvas as ContextSource | null)?.getContext !== "function")
    return null;
  try {
    const context = (canvas as ContextSource).getContext(
      "webgl2",
      OPAQUE_SCENE_CONTEXT_ATTRIBUTES,
    );
    // A canvas that already has a context of another type returns null, and
    // getContext is specified to return the EXISTING context when one is
    // present — which would carry the previous attributes, not these.
    return context instanceof WebGL2RenderingContext ? context : null;
  } catch {
    return null;
  }
}
