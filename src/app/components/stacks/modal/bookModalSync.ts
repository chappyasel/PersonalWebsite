type JumpTo = (unit: number) => void;

type JumpState = {
  jumpTo: JumpTo | null;
};

type JumpStore = {
  getState: () => JumpState;
  subscribe: (listener: (state: JumpState) => void) => () => void;
};

/** Jump immediately when the camera bridge exists, otherwise wait for it once.
 * The listener must detach before calling jumpTo: jumpTo synchronously writes
 * activeUnit to the same Zustand store, so detaching afterwards recursively
 * re-enters this listener until the browser stack overflows. */
export function jumpToUnitWhenReady(store: JumpStore, unit: number) {
  const ready = store.getState().jumpTo;
  if (ready) {
    ready(unit);
    return () => void 0;
  }

  let settled = false;
  let unsubscribe: () => void = () => void 0;
  unsubscribe = store.subscribe((state) => {
    if (settled || !state.jumpTo) return;
    settled = true;
    const jumpTo = state.jumpTo;
    unsubscribe();
    jumpTo(unit);
  });

  return () => {
    if (settled) return;
    settled = true;
    unsubscribe();
  };
}
