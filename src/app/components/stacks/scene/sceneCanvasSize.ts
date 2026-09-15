import type { RootState } from "@react-three/fiber";

const protectedSetters = new WeakSet<RootState["setSize"]>();

/** R3F 9.7's Canvas passes the full measured DOMRect to configure(), but
 * stores only width/height/top/left. The extra x/y/right/bottom keys make
 * its equality check fail on every parent commit. Publishing an identical
 * size then reconnects Drei's scroll effect and forces a scrollWidth read
 * just after the content panels have dirtied style. Keep genuine resizes
 * and canvas repositioning, without notifying subscribers for a no-op. */
export function preserveCanvasSize(state: RootState) {
  if (protectedSetters.has(state.setSize)) return;
  const setSize = state.setSize;
  const preservedSetSize: RootState["setSize"] = (
    width,
    height,
    top = 0,
    left = 0,
  ) => {
    const size = state.get().size;
    if (
      size.width === width &&
      size.height === height &&
      size.top === top &&
      size.left === left
    )
      return;
    setSize(width, height, top, left);
  };
  protectedSetters.add(preservedSetSize);
  state.set({ setSize: preservedSetSize });
  // Retain the guard for this renderer's lifetime, including Activity pauses.
}
