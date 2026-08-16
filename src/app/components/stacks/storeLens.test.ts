import { afterEach, describe, expect, it } from "vitest";

import { useStacks } from "./store";

type LensState = {
  desktopNavRightPx: number;
  desktopDetailsLeftPx: number | null;
  setDesktopNavRightPx: (value: number) => void;
  setDesktopDetailsLeftPx: (value: number | null) => void;
};

const lensState = () => useStacks.getState() as Partial<LensState>;

afterEach(() => {
  lensState().setDesktopNavRightPx?.(0);
  lensState().setDesktopDetailsLeftPx?.(null);
});

describe("desktop lens boundary state", () => {
  it("publishes sidebar hide/show changes to canvas subscribers", () => {
    const updates: Array<number | null | undefined> = [];
    const unsubscribe = useStacks.subscribe((state) => {
      updates.push((state as Partial<LensState>).desktopDetailsLeftPx);
    });
    const state = lensState();

    expect(state.setDesktopDetailsLeftPx).toBeTypeOf("function");
    state.setDesktopDetailsLeftPx?.(900);
    state.setDesktopDetailsLeftPx?.(null);
    unsubscribe();

    expect(updates).toEqual([900, null]);
  });
});
