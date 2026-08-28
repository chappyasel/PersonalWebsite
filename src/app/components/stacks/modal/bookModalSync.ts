type JumpTo = (unit: number) => void;

type BookHashLocation = Pick<Location, "hash" | "pathname" | "search">;
type BookHashHistory = Pick<History, "pushState" | "replaceState">;

/** Give a directly-arrived-at book its own history entry — the current entry
 * becomes the bare scene URL, the book path stacks on top — so modal close
 * (history.back) stays onsite. Also upgrades legacy #book- hash links to the
 * real path in the address bar. */
export function ownDirectBookHistory(
  history: BookHashHistory,
  location: BookHashLocation,
  bookPath: string,
) {
  const baseUrl = `${location.pathname}${location.search}`;
  history.replaceState(null, "", baseUrl);
  history.pushState({ stacksBook: true }, "", bookPath);
}

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
