// @vitest-environment jsdom
import { WORLD_BOOT_POLICY as P } from "../boot/worldBootPolicy";
import { worldBoot } from "../boot/worldBootSession";
import { recordFieldNoteEvent } from "../fieldNotes/progress";
import { IllustratedTraverse } from "../illustration/IllustratedTraverse";
import { illustrationTravelStops } from "../illustration/illustrationTravelStops";
import { RAIL_RIGHT_PX_FALLBACK } from "../scene/worldLayout";
import { progressRef, railRightPxRef, useStacks } from "../store";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
} from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { dimensionTravel } from "./dimensionTravel";
import { requestRoomDimension, useRoomDimensionKeys } from "./roomDimensions";
import { worldNavigationUnit } from "./roomNavigationKeys";

vi.mock("../fieldNotes/progress", () => ({ recordFieldNoteEvent: vi.fn() }));
vi.mock("~/lib/universal-search/overlay", () => ({
  isUniversalSearchOpen: () => false,
}));

beforeEach(() => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(performance, "now").mockReturnValue(1000);
  // The traverse subscribes to its reduced-motion query rather than only
  // reading it, so the stub has to be a listenable MediaQueryList.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as never,
  );
  const storage = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
  };
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  history.replaceState(null, "", "/");
  worldBoot.scope().send({ type: "exit" });
  worldBoot.setDocumentActive(true);
  document.documentElement.dataset.roomIllustration = "enabled";
  useStacks.setState({
    modalOpen: false,
    dragging: null,
    panelState: "closed",
    visionRidePhase: "idle",
    activeUnit: 4,
  });
  worldBoot.start("hydrate");
  vi.mocked(recordFieldNoteEvent).mockClear();
});
afterEach(() => {
  cleanup();
  worldBoot.scope().send({ type: "exit" });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function promote(at = 1100) {
  const scope = worldBoot.scope();
  worldBoot.send({ type: "illustrationChanged", key: "shelf" }, at);
  scope.send(
    {
      type: "assetLoad",
      assets: { active: false, loaded: 1, total: 1, errors: 0 },
    },
    at,
  );
  scope.send({ type: "firstFrame" }, at);
  scope.send({ type: "meadowReady" }, at);
  if (worldBoot.getView().manual3D) {
    scope.send({ type: "dimensionFramePainted" }, at + P.assetSettleMs);
    worldBoot.send(
      { type: "tick" },
      at + P.assetSettleMs + P.flatRetireMs + 20,
    );
    scope.send(
      { type: "dimensionFramePainted" },
      at + P.assetSettleMs + P.flatRetireMs + 21,
    );
    return;
  }
  scope.send(
    { type: "illustrationRegistered", key: "shelf" },
    at + P.assetSettleMs,
  );
  worldBoot.send(
    { type: "tick" },
    at + P.assetSettleMs + P.illustrationTravelDelayMs,
  );
  scope.send(
    { type: "illustrationTravelCompleted", key: "shelf" },
    at + P.assetSettleMs + P.illustrationTravelDelayMs + 1,
  );
}

it("awards a completed explicit switch, preserves the shelf, and ignores automatic boot", () => {
  renderHook(() => useRoomDimensionKeys(true));
  act(() => promote());
  expect(recordFieldNoteEvent).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "r" });
  expect(worldBoot.getView().status).toBe("flattening");
  expect(recordFieldNoteEvent).not.toHaveBeenCalled();
  act(() => {
    worldBoot.send({ type: "tick" }, 1000 + P.flatRetireMs);
  });
  expect(worldBoot.getView().worldMounted).toBe(false);
  expect(useStacks.getState().activeUnit).toBe(4);
  expect(recordFieldNoteEvent).toHaveBeenCalledExactlyOnceWith({
    type: "dimension-transition-completed",
  });
  vi.mocked(recordFieldNoteEvent).mockClear();
  const epoch = worldBoot.getView().epoch;
  expect(worldBoot.getView().rendererRetained).toBe(true);
  fireEvent.keyDown(window, { key: "r" });
  expect(worldBoot.getView().epoch).toBe(epoch);
  expect(worldBoot.getView().status).toBe("booting");
  expect(recordFieldNoteEvent).not.toHaveBeenCalled();
  act(() => promote(2000));
  expect(recordFieldNoteEvent).toHaveBeenCalledExactlyOnceWith({
    type: "dimension-transition-completed",
  });
});

it("does not award cancelled loads or failed requests", () => {
  renderHook(() => useRoomDimensionKeys(true));
  fireEvent.keyDown(window, { key: "r" });
  expect(worldBoot.getView().worldMounted).toBe(false);
  expect(recordFieldNoteEvent).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "r" });
  act(() => {
    worldBoot.scope().send({ type: "runtimeError" });
  });
  expect(recordFieldNoteEvent).not.toHaveBeenCalled();
});

it("keeps pending awards out of a parked route", () => {
  promote();
  const hook = renderHook(({ active }) => useRoomDimensionKeys(active), {
    initialProps: { active: true },
  });
  fireEvent.keyDown(window, { key: "r" });
  hook.rerender({ active: false });
  act(() => {
    worldBoot.send({ type: "tick" }, 1000 + P.flatRetireMs);
  });
  fireEvent.keyDown(window, { key: "r" });
  expect(worldBoot.getView().worldMounted).toBe(false);
  expect(recordFieldNoteEvent).not.toHaveBeenCalled();
});

it("leaves typing, composition, modifiers, and modal interactions alone", () => {
  promote();
  renderHook(() => useRoomDimensionKeys(true));
  for (const flags of [
    { repeat: true },
    { isComposing: true },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
  ]) {
    fireEvent.keyDown(window, { key: "r", ...flags });
    expect(worldBoot.getView().status).toBe("live");
  }
  const input = document.createElement("input");
  document.body.append(input);
  fireEvent.keyDown(input, { key: "r" });
  input.remove();
  const editable = document.createElement("div");
  editable.contentEditable = "true";
  editable.setAttribute("contenteditable", "true");
  editable.innerHTML = "<span>text</span>";
  document.body.append(editable);
  fireEvent.keyDown(editable.firstElementChild!, { key: "r" });
  editable.remove();
  expect(worldBoot.getView().status).toBe("live");
  for (const state of [
    { modalOpen: true },
    { dragging: "prop" },
    { visionRidePhase: "cruising" as const },
  ]) {
    useStacks.setState(state);
    expect(requestRoomDimension("2d")).toBe(false);
    useStacks.setState({
      modalOpen: false,
      dragging: null,
      visionRidePhase: "idle",
    });
  }
});

it("leaves 1–7 to shelf navigation and reserves Shift + ~ for free roam", () => {
  promote();
  renderHook(() => useRoomDimensionKeys(true));
  for (let n = 1; n <= 7; n++) {
    const event = new KeyboardEvent("keydown", {
      key: `${n}`,
      code: `Digit${n}`,
    });
    expect(worldNavigationUnit(event.key)).toBe(n - 1);
    fireEvent(window, event);
    expect(worldBoot.getView().status).toBe("live");
  }
  fireEvent.keyDown(window, { key: "~", shiftKey: true });
  expect(worldBoot.getView().status).toBe("live");
  fireEvent.keyDown(window, { key: "R" });
  expect(worldBoot.getView().status).toBe("flattening");
});

it.each([false, true])(
  "preserves a mid-shelf position in both directions with reduced motion %s",
  (reducedMotion) => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
    HTMLElement.prototype.scrollTo = vi.fn(function (
      this: HTMLElement,
      options?: ScrollToOptions | number,
    ) {
      if (typeof options === "object") this.scrollLeft = options.left ?? 0;
    });
    function Room() {
      useRoomDimensionKeys(true);
      const view = useSyncExternalStore(
        (listener) => worldBoot.subscribe(listener),
        () => worldBoot.getView(),
      );
      return (
        <IllustratedTraverse
          unit={4}
          enabled={
            view.presentation !== "live" &&
            view.status !== "flattening" &&
            !view.manual3D
          }
          transitionPosition={
            view.interactionHeld ||
            view.status === "flattening" ||
            view.manual3D
              ? dimensionTravel.position
              : null
          }
          transitionId={dimensionTravel.revision}
          onMovingChange={() => undefined}
        >
          <div />
        </IllustratedTraverse>
      );
    }
    promote();
    const view = render(<Room />);
    progressRef.current = 2.4 / 6;
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: reducedMotion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    fireEvent.keyDown(window, { key: "r" });
    const row = view.container.firstElementChild as HTMLElement;
    // Stop positions are unequal, so interpolate within the actual artwork row.
    const stops = illustrationTravelStops(
      1000,
      innerHeight,
      railRightPxRef.current || RAIL_RIGHT_PX_FALLBACK,
      "light",
      "desktop",
    );
    const expected =
      stops.find((s) => s.position === 2)!.scrollLeft +
      0.4 *
        (stops.find((s) => s.position === 3)!.scrollLeft -
          stops.find((s) => s.position === 2)!.scrollLeft);
    expect(row.scrollLeft).toBeCloseTo(expected);
    act(() => {
      worldBoot.send({ type: "tick" }, 1000 + P.flatRetireMs);
    });
    expect(row.scrollLeft).toBeCloseTo(expected);
    // A real scroll changes the return pose even before its scroll event runs.
    row.scrollLeft =
      stops.find((s) => s.position === 3)!.scrollLeft +
      0.25 *
        (stops.find((s) => s.position === 4)!.scrollLeft -
          stops.find((s) => s.position === 3)!.scrollLeft);
    // Exercise a fresh renderer as well as the retained one.
    if (reducedMotion)
      act(() => {
        worldBoot.send(
          { type: "tick" },
          1000 + P.flatRetireMs + P.illustrationCacheMs,
        );
      });
    fireEvent.keyDown(window, { key: "r" });
    expect(dimensionTravel.position).toBeCloseTo(3.25);
    expect(worldBoot.getView().manual3D).toBe(true);
  },
);
