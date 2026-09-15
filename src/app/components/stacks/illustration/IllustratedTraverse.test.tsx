// @vitest-environment jsdom
import { GOLF_STOP_POSITION, type StacksData } from "../data";
import RoomNavigation, { navigateRoom } from "../input/RoomNavigation";
import { useStacks } from "../store";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import IllustratedRoom from "./IllustratedRoom";
import { IllustratedTraverse } from "./IllustratedTraverse";
import { illustrationInteraction } from "./illustrationInteraction";
import type * as TravelStopsModule from "./illustrationTravelStops";
import { illustrationTravelStops } from "./illustrationTravelStops";

vi.mock("./illustrationTravelStops", async (importOriginal) => ({
  ...(await importOriginal<typeof TravelStopsModule>()),
  illustrationTravelStops: vi.fn(),
}));

const initial = useStacks.getState();
const originalDecode = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  "decode",
);
beforeEach(() => {
  vi.useFakeTimers();
  history.replaceState(null, "", "/");
  document.documentElement.dataset.roomFirstUnit = "0";
  vi.mocked(illustrationTravelStops).mockImplementation((width) =>
    Array.from({ length: 7 }, (_, position) => ({
      position,
      scrollLeft: position * width,
      width,
    })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  useStacks.setState({
    ...initial,
    activeUnit: 4,
    modalOpen: false,
    dragging: null,
    panelState: "closed",
    visionRidePhase: "idle",
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
  HTMLElement.prototype.scrollTo = vi.fn(function (
    this: HTMLElement,
    options?: ScrollToOptions | number,
  ) {
    if (typeof options === "object") this.scrollLeft = options.left ?? 0;
  });
});

it.each(["/golf", "/#golf"])(
  "preserves the Golf entry through hydration scroll events for %s",
  (url) => {
    history.replaceState(null, "", url);
    document.documentElement.dataset.roomFirstUnit = String(GOLF_STOP_POSITION);
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value: vi.fn(() => new Promise<void>(() => undefined)),
    });
    useStacks.setState({
      activeUnit: 0,
      golfStop: false,
      scrollEl: null,
      jumpTo: null,
    });
    const onReady = vi.fn();
    const mounted = render(
      <RoomNavigation rendererEnabled={false}>
        <IllustratedRoom
          data={
            { readingBooks: [], readingBookColors: {} } as unknown as StacksData
          }
          theme="light"
          viewport="desktop"
          visible
          canRequest3D={false}
          onRequest3D={vi.fn()}
          onReady={onReady}
          onUnavailable={vi.fn()}
        />
      </RoomNavigation>,
    );
    const row = mounted.container.querySelector<HTMLElement>(
      ".room-illustration-traverse",
    )!;
    expect(row.scrollLeft).toBe(GOLF_STOP_POSITION * 1000);
    fireEvent.scroll(row);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(useStacks.getState().golfStop).toBe(true);
    expect(location.pathname).toBe("/golf");
    expect(mounted.container.querySelector("[data-golf-entry]")).not.toBeNull();
    expect(onReady).toHaveBeenLastCalledWith("golf-overview:light", false);
    expect(illustrationInteraction.moving).toBe(false);

    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    fireEvent.resize(window);
    fireEvent.scroll(row);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(row.scrollLeft).toBe(GOLF_STOP_POSITION * 800);
    expect(useStacks.getState().golfStop).toBe(true);
    expect(location.pathname).toBe("/golf");

    const jumpTo = vi.fn();
    act(() =>
      useStacks.setState({ scrollEl: document.createElement("div"), jumpTo }),
    );
    expect(jumpTo).toHaveBeenLastCalledWith(GOLF_STOP_POSITION);

    // An explicit shelf command still leaves the loading preview.
    act(() => navigateRoom(4, { rendererEnabled: false }));
    fireEvent.scroll(row);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(useStacks.getState().golfStop).toBe(false);
    expect(useStacks.getState().activeUnit).toBe(4);
    expect(mounted.container.querySelector("[data-golf-entry]")).toBeNull();
  },
);
afterEach(() => {
  cleanup();
  if (originalDecode)
    Object.defineProperty(HTMLImageElement.prototype, "decode", originalDecode);
  else Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
  useStacks.setState(initial);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("uses the artwork's unequal stop distances for initial selection, wheel travel and rail commands", () => {
  const offsets = [0, 740, 1510, 2300, 3120, 3910, 4750];
  vi.mocked(illustrationTravelStops).mockReturnValue(
    offsets.map((scrollLeft, position) => ({
      position,
      scrollLeft,
      width: (offsets[position + 1] ?? scrollLeft + 1000) - scrollLeft,
    })),
  );
  const moving = vi.fn();
  const view = render(
    <IllustratedTraverse unit={4} enabled onMovingChange={moving}>
      <div />
    </IllustratedTraverse>,
  );
  const el = view.container.firstElementChild as HTMLDivElement;
  expect(el.scrollLeft).toBe(3120);
  fireEvent.wheel(el, { deltaY: 790 });
  fireEvent.scroll(el);
  expect(useStacks.getState().activeUnit).toBe(5);
  act(() => {
    vi.advanceTimersByTime(180);
  });
  expect(el.scrollLeft).toBe(3910);
  expect(moving).toHaveBeenLastCalledWith(false);
  view.rerender(
    <IllustratedTraverse unit={6} enabled onMovingChange={moving}>
      <div />
    </IllustratedTraverse>,
  );
  expect(el.scrollLeft).toBe(4750);
});

it("starts on the chosen shelf and maps ordinary wheel travel into selection", () => {
  const moving = vi.fn();
  const mounted = render(
    <IllustratedTraverse unit={4} enabled onMovingChange={moving}>
      <div />
    </IllustratedTraverse>,
  );
  const viewport = mounted.container.firstElementChild as HTMLDivElement;
  expect(viewport.scrollLeft).toBe(4000);
  fireEvent.wheel(viewport, { deltaY: 1000 });
  expect(viewport.scrollLeft).toBe(5000);
  fireEvent.scroll(viewport);
  expect(useStacks.getState().activeUnit).toBe(5);
  expect(moving).toHaveBeenLastCalledWith(true);
  act(() => {
    vi.advanceTimersByTime(180);
  });
  expect(moving).toHaveBeenLastCalledWith(false);
});

it("snaps to the initial URL after hydration without traveling through About", () => {
  const moving = vi.fn();
  const scrollTo = vi.spyOn(HTMLElement.prototype, "scrollTo");
  history.replaceState(null, "", "/projects");
  useStacks.setState({ activeUnit: 0, scrollEl: null, jumpTo: null });
  function ConnectedTraverse() {
    const unit = useStacks((state) => state.activeUnit);
    return (
      <IllustratedTraverse unit={unit} enabled onMovingChange={moving}>
        <div />
      </IllustratedTraverse>
    );
  }
  const mounted = render(
    <RoomNavigation rendererEnabled={false}>
      <ConnectedTraverse />
    </RoomNavigation>,
  );
  const viewport = mounted.container.firstElementChild as HTMLDivElement;
  expect(viewport.scrollLeft).toBe(4000);
  expect(scrollTo).not.toHaveBeenCalled();
  expect(moving).not.toHaveBeenCalledWith(true);
  fireEvent.scroll(viewport);
  expect(useStacks.getState().activeUnit).toBe(4);
  expect(location.pathname).toBe("/projects");
});

it("leaves reader scrolling and browser pinch zoom alone", () => {
  const mounted = render(
    <IllustratedTraverse unit={4} enabled onMovingChange={vi.fn()}>
      <div data-stacks-scrollable />
    </IllustratedTraverse>,
  );
  const viewport = mounted.container.firstElementChild as HTMLDivElement;
  fireEvent.wheel(viewport.firstElementChild!, { deltaY: 1000 });
  fireEvent.wheel(viewport, { deltaY: 1000, ctrlKey: true });
  expect(viewport.scrollLeft).toBe(4000);
});

it("blocks handoff for a held touch and wheel input that cannot move past an end", () => {
  const moving = vi.fn();
  const mounted = render(
    <IllustratedTraverse unit={0} enabled onMovingChange={moving}>
      <div />
    </IllustratedTraverse>,
  );
  const viewport = mounted.container.firstElementChild as HTMLDivElement;
  const down = new Event("pointerdown");
  Object.defineProperty(down, "pointerType", { value: "touch" });
  fireEvent(viewport, down);
  expect(illustrationInteraction.moving).toBe(true);
  act(() => {
    vi.advanceTimersByTime(500);
  });
  expect(illustrationInteraction.moving).toBe(true);
  fireEvent.pointerUp(window);
  act(() => {
    vi.advanceTimersByTime(180);
  });
  expect(illustrationInteraction.moving).toBe(false);
  fireEvent.wheel(viewport, { deltaY: -80 });
  viewport.scrollLeft = 0; // A native scroller clamps at the first stop.
  expect(illustrationInteraction.moving).toBe(true);
  act(() => {
    vi.advanceTimersByTime(180);
  });
  expect(illustrationInteraction.moving).toBe(false);
});

it("keeps a rail destination when an old scroll event arrives during smooth travel", () => {
  const moving = vi.fn();
  function ConnectedTraverse() {
    const unit = useStacks((state) => state.activeUnit);
    return (
      <IllustratedTraverse unit={unit} enabled onMovingChange={moving}>
        <div />
      </IllustratedTraverse>
    );
  }
  const mounted = render(<ConnectedTraverse />);
  const viewport = mounted.container.firstElementChild as HTMLDivElement;
  moving.mockClear(); // Initial placement reports settled before nav starts.
  const scrollTo = vi
    .spyOn(viewport, "scrollTo")
    .mockImplementation(() => undefined);
  act(() => useStacks.setState({ activeUnit: 3 }));
  fireEvent.scroll(viewport);
  expect(useStacks.getState().activeUnit).toBe(3);
  act(() => {
    vi.advanceTimersByTime(180);
  });
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 3000, behavior: "smooth" });
  expect(moving).not.toHaveBeenCalledWith(false);
  viewport.scrollLeft = 3000;
  fireEvent.scroll(viewport);
  act(() => {
    vi.advanceTimersByTime(180);
  });
  expect(useStacks.getState().activeUnit).toBe(3);
  expect(moving).toHaveBeenLastCalledWith(false);
});

it("follows rail selection and detaches input after promotion", () => {
  const moving = vi.fn();
  const mounted = render(
    <IllustratedTraverse unit={4} enabled onMovingChange={moving}>
      <div />
    </IllustratedTraverse>,
  );
  const viewport = mounted.container.firstElementChild as HTMLDivElement;
  mounted.rerender(
    <IllustratedTraverse unit={2} enabled onMovingChange={moving}>
      <div />
    </IllustratedTraverse>,
  );
  expect(viewport.scrollLeft).toBe(2000);
  mounted.rerender(
    <IllustratedTraverse unit={2} enabled={false} onMovingChange={moving}>
      <div />
    </IllustratedTraverse>,
  );
  fireEvent.wheel(viewport, { deltaY: 1000 });
  expect(viewport.scrollLeft).toBe(2000);
});

it("holds a restored fractional position after the fade and still accepts a nav command", () => {
  const moving = vi.fn();
  const content = (enabled: boolean, unit: number) => (
    <IllustratedTraverse
      unit={unit}
      enabled={enabled}
      transitionPosition={2.4}
      transitionId={1}
      onMovingChange={moving}
    >
      <div />
    </IllustratedTraverse>
  );
  const view = render(content(false, 2));
  const row = view.container.firstElementChild as HTMLElement;
  expect(row.scrollLeft).toBe(2400);
  view.rerender(content(true, 2));
  fireEvent.scroll(row);
  act(() => {
    vi.advanceTimersByTime(500);
  });
  expect(row.scrollLeft).toBe(2400);
  view.rerender(content(true, 5));
  expect(row.scrollLeft).toBe(5000);
  // eslint-disable-next-line @typescript-eslint/unbound-method
  expect(row.scrollTo).toHaveBeenLastCalledWith({
    left: 5000,
    behavior: "smooth",
  });
});

it("lets wheel travel settle between shelves", () => {
  const moving = vi.fn();
  const view = render(
    <IllustratedTraverse unit={4} enabled onMovingChange={moving}>
      <div />
    </IllustratedTraverse>,
  );
  const row = view.container.firstElementChild as HTMLElement;
  fireEvent.wheel(row, { deltaY: 250 });
  fireEvent.scroll(row);
  act(() => {
    vi.advanceTimersByTime(500);
  });
  expect(row.scrollLeft).toBe(4250);
  expect(moving).toHaveBeenLastCalledWith(false);
});

it("moves fetch priority to the shelf in view without remounting the row", () => {
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: vi.fn(() => Promise.resolve()),
  });
  const mounted = render(
    <RoomNavigation rendererEnabled={false}>
      <IllustratedRoom
        data={
          { readingBooks: [], readingBookColors: {} } as unknown as StacksData
        }
        theme="light"
        viewport="desktop"
        visible
        canRequest3D={false}
        onRequest3D={vi.fn()}
        onReady={vi.fn()}
        onUnavailable={vi.fn()}
      />
    </RoomNavigation>,
  );
  const imageAt = (position: number) =>
    mounted.container.querySelector<HTMLImageElement>(
      `[data-illustration-position="${position}"] [data-illustration-image]`,
    );
  // Hydration resolves "/" to About, which owns no artwork image.
  for (const position of [1, 2, 3, 4, 5, 6])
    expect(imageAt(position)?.getAttribute("loading")).toBe("lazy");
  act(() => navigateRoom(4, { rendererEnabled: false }));
  // Every other shelf stays mounted so travel stays native.
  expect(imageAt(4)?.getAttribute("loading")).toBe("eager");
  expect(imageAt(4)?.getAttribute("fetchpriority")).toBe("high");
  for (const offscreen of [1, 2, 3, 5, 6]) {
    expect(imageAt(offscreen)?.getAttribute("loading")).toBe("lazy");
    expect(imageAt(offscreen)?.getAttribute("fetchpriority")).toBe("low");
  }
  const arriving = imageAt(5);
  const leaving = imageAt(4);
  act(() => navigateRoom(5, { rendererEnabled: false }));
  // Same elements: priority is patched in place, so no shelf refetches.
  expect(imageAt(5)).toBe(arriving);
  expect(imageAt(4)).toBe(leaving);
  expect(imageAt(5)?.getAttribute("loading")).toBe("eager");
  expect(imageAt(5)?.getAttribute("fetchpriority")).toBe("high");
  expect(imageAt(4)?.getAttribute("loading")).toBe("lazy");
  expect(imageAt(4)?.getAttribute("fetchpriority")).toBe("low");
});

it("restores the current shelf instantly when recovery wakes Activity without a handoff position", () => {
  const moving = vi.fn();
  const scrollTo = vi.spyOn(HTMLElement.prototype, "scrollTo");
  const show = (visible: boolean, unit: number) => (
    <Activity mode={visible ? "visible" : "hidden"}>
      <IllustratedTraverse unit={unit} enabled onMovingChange={moving}>
        <div />
      </IllustratedTraverse>
    </Activity>
  );
  const view = render(show(true, 4));
  const row = view.container.firstElementChild as HTMLDivElement;
  expect(row.scrollLeft).toBe(4000);
  view.rerender(show(false, 4));
  view.rerender(show(false, 6));
  scrollTo.mockClear();
  moving.mockClear();
  view.rerender(show(true, 6));
  expect(row.scrollLeft).toBe(6000);
  expect(scrollTo).not.toHaveBeenCalledWith(
    expect.objectContaining({ behavior: "smooth" }),
  );
  expect(moving).toHaveBeenLastCalledWith(false);
  expect(view.container.firstElementChild).toBe(row);
});

it("clears an interrupted travel on Activity wake before a recovery drawing measures", () => {
  const moving = vi.fn();
  const show = (visible: boolean) => (
    <Activity mode={visible ? "visible" : "hidden"}>
      <IllustratedTraverse unit={4} enabled onMovingChange={moving}>
        <div />
      </IllustratedTraverse>
    </Activity>
  );
  const view = render(show(true));
  const row = view.container.firstElementChild as HTMLDivElement;
  fireEvent.wheel(row, { deltaY: 100 });
  expect(moving).toHaveBeenLastCalledWith(true);
  view.rerender(show(false));
  moving.mockClear();
  view.rerender(show(true));
  expect(row.scrollLeft).toBe(4000);
  expect(moving).toHaveBeenLastCalledWith(false);
});
