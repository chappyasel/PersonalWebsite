import { afterEach, describe, expect, it, vi } from "vitest";

import { setStacksSheetDismissed, useStacks } from "./store";

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
  useStacks.getState().setPanelState("closed");
  useStacks.getState().setSheetDismissed(false);
  vi.unstubAllGlobals();
});

describe("mobile sheet boundary state", () => {
  it("dismisses the sheet and closes an expanded panel together", () => {
    const back = vi.fn();
    vi.stubGlobal("window", { history: { back } });
    useStacks.getState().setPanelState("open");

    setStacksSheetDismissed(true);

    expect(useStacks.getState().sheetDismissed).toBe(true);
    expect(useStacks.getState().panelState).toBe("closing");
    expect(back).toHaveBeenCalledOnce();
  });
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
