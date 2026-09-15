const DEFAULT: Readonly<{ enabled: boolean }> = Object.freeze({
  enabled: true,
});

/** Live, session-only control for 2D edge resistance. */
export const illustrationOverscrollController = (() => {
  let snapshot = DEFAULT;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setEnabled(enabled: boolean) {
      if (snapshot.enabled === enabled) return;
      snapshot = { enabled };
      for (const listener of listeners) listener();
    },
  };
})();

/** Frame-coalesced wheel resistance, with a non-oscillating return.
 * Only the inner artwork moves. The scroll range and clipping viewport stay fixed. */
export function createIllustrationOverscroll(content: HTMLElement) {
  // Scale the entire curve, so ordinary pulls also travel twice as far.
  const limit = 220;
  const resistance = 1.1;
  let offset = 0;
  let velocity = 0;
  let frame = 0;
  let previous: number | null = null;
  let paintedOffset = 0;
  let returning = false;
  let momentumTail = false;
  let lastInputAt = -Infinity;
  let lastInput = 0;
  let risingPulls = 0;
  let risingDistance = 0;
  const original = content.style.transform;
  const paint = () => {
    if (Math.abs(offset) < Math.abs(paintedOffset) - 0.01) returning = true;
    else if (Math.abs(offset) > Math.abs(paintedOffset) + 0.01)
      returning = false;
    paintedOffset = offset;
    // Keep the same transform context on the final frame. Removing it at
    // rest can change descendant positioning and fractional-pixel painting.
    content.style.transform = `translateX(${offset === 0 ? 0 : offset.toFixed(2)}px)`;
  };
  const tick = (now: number) => {
    const dt =
      previous === null ? 1 / 60 : Math.min((now - previous) / 1000, 1 / 30);
    previous = now;
    const frequency = 12;
    const decay = Math.exp(-frequency * dt);
    const carry = velocity + frequency * offset;
    const next = (offset + carry * dt) * decay;
    velocity = (velocity - frequency * carry * dt) * decay;
    // A reversal or a long momentum tail must never cross to the opposite edge.
    if (
      next * offset <= 0 ||
      (Math.abs(next) < 0.05 && Math.abs(velocity) < 0.5)
    ) {
      offset = 0;
      velocity = 0;
      previous = null;
      frame = 0;
      paint();
      return;
    }
    offset = next;
    paint();
    frame = requestAnimationFrame(tick);
  };
  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    offset = 0;
    velocity = 0;
    previous = null;
    paintedOffset = 0;
    returning = false;
    momentumTail = false;
    lastInputAt = -Infinity;
    lastInput = 0;
    risingPulls = 0;
    risingDistance = 0;
    paint();
  };
  return {
    isActive: () => frame !== 0,
    getOffset: () => offset,
    /** Consume inward travel against the stretch before moving into the room. */
    consume(delta: number) {
      if (offset === 0 || offset * delta <= 0) return delta;
      // An intentional inward reversal controls the stretch directly again.
      momentumTail = false;
      returning = false;
      risingPulls = 0;
      risingDistance = 0;
      lastInput = delta;
      lastInputAt = performance.now();
      const amount = Math.min(Math.abs(delta), Math.abs(offset) / resistance);
      offset -= Math.sign(offset) * amount * resistance;
      velocity = 0;
      if (Math.abs(offset) < 0.05) offset = 0;
      // The next frame paints this together with the spring step.
      return delta - Math.sign(delta) * amount;
    },
    push(delta: number) {
      if (!Number.isFinite(delta) || delta === 0) return;
      const now = performance.now();
      const magnitude = Math.abs(delta);
      // Packet size is not gesture intent: Chrome can batch a dwindling
      // momentum tail into alternating larger and smaller wheel events.
      const freshPull = now - lastInputAt > 180 || delta * lastInput < 0;
      if (!freshPull && momentumTail && magnitude > Math.abs(lastInput)) {
        risingPulls += 1;
        risingDistance += magnitude;
      } else {
        risingPulls = 0;
        risingDistance = 0;
      }
      // A second trackpad contact can arrive before the first swipe's tail
      // ends. Match Search's sustained ramp, not one larger batched packet.
      const renewed = risingPulls >= 3 && risingDistance >= 48;
      if (freshPull || renewed) {
        returning = false;
        momentumTail = false;
        risingPulls = 0;
        risingDistance = 0;
        velocity = 0;
      } else if (returning && magnitude < Math.abs(lastInput)) {
        momentumTail = true;
      }
      lastInputAt = now;
      lastInput = delta;
      // Once the artwork is returning, declining same-direction wheel input
      // is the trackpad's momentum tail. It must not pull the spring outward
      // again, even when Chrome delivers those events several frames apart.
      // Only a new gesture or a direction reversal takes control again.
      if (momentumTail) return;
      // Invert the resistance curve so successive input remains continuous.
      const stretch = Math.min(Math.abs(offset), limit - 0.01);
      const raw =
        (Math.sign(offset) * (limit * stretch)) /
          (resistance * (limit - stretch)) -
        delta;
      offset =
        (Math.sign(raw) * (limit * resistance * Math.abs(raw))) /
        (limit + resistance * Math.abs(raw));
      // Wheel events only update simulation state. Painting here fights the
      // return between frames and turns a fading momentum tail into jitter.
      if (!frame) frame = requestAnimationFrame(tick);
    },
    reset,
    dispose() {
      reset();
      content.style.transform = original;
    },
  };
}
