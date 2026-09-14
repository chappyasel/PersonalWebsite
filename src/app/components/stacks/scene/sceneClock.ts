import type { RootState } from "@react-three/fiber";

const protectedClocks = new WeakSet<RootState["clock"]>();

/** R3F resets elapsedTime when changing frameloop. Modal and route pauses
 * should stop animation without restarting clouds, birds, or camera sway. */
export function preserveSceneClock(state: RootState) {
  if (protectedClocks.has(state.clock)) return;
  protectedClocks.add(state.clock);
  const setFrameloop = state.setFrameloop;
  const preservedFrameloop: RootState["setFrameloop"] = (mode) => {
    const { clock } = state.get();
    const elapsedTime = clock.elapsedTime;
    setFrameloop(mode);
    clock.elapsedTime = elapsedTime;
    // R3F's automatic loop still renders pending invalidations in "never"
    // mode. It would treat that rAF's milliseconds as manual elapsed seconds.
    // Drop queued frames as we freeze; explicit resize repaints use advance().
    if (mode === "never") state.get().internal.frames = 0;
  };
  state.set({ setFrameloop: preservedFrameloop });
  // Keep the wrapper for this renderer's lifetime. Activity can detach layout
  // effects while the retained room is parked, precisely when it needs this.
}

/** advance() in a frozen R3F scene expects elapsed seconds, not rAF's
 * wall-clock milliseconds. Repaint with zero animation delta. */
export function repaintFrozenScene(
  state: Pick<RootState, "advance" | "clock">,
) {
  state.advance(state.clock.elapsedTime, false);
}
