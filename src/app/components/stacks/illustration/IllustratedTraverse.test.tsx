// @vitest-environment jsdom
import { GOLF_STOP_POSITION, type StacksData } from "../data";
import RoomNavigation, { navigateRoom } from "../input/RoomNavigation";
import { dimensionTravel } from "../input/dimensionTravel";
import { roomEdgeMotion } from "../mobile/roomEdgeMotion";
import { homeTapMotion } from "../scene/homeTapMotion";
import { useStacks } from "../store";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { Activity, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { OPEN_UNIVERSAL_SEARCH_EVENT } from "~/components/universal-search/UniversalSearchController";

import IllustratedRoom from "./IllustratedRoom";
import { IllustratedTraverse } from "./IllustratedTraverse";
import { IllustrationObjectLabel } from "./IllustrationObjectLabel";
import { illustrationInteraction } from "./illustrationInteraction";
import { illustrationOverscrollController } from "./illustrationOverscroll";
import type * as TravelStopsModule from "./illustrationTravelStops";
import { illustrationTravelStops } from "./illustrationTravelStops";

vi.mock("./illustrationTravelStops", async (importOriginal) => ({
  ...(await importOriginal<typeof TravelStopsModule>()),
  illustrationTravelStops: vi.fn(),
}));

vi.mock("./IllustrationHotspots", () => ({ IllustrationHotspots: () => null }));

it.each([
  { deltaX: -120, deltaY: 0, mobile: true },
  { deltaX: 0, deltaY: -120, mobile: true },
  { deltaX: -120, deltaY: 0, mobile: false },
  { deltaX: 0, deltaY: -120, mobile: false },
])(
  "opens Search past the illustrated room's left edge using %j",
  ({ mobile, ...delta }) => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: mobile && query.startsWith("(width <"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    useStacks.setState({ activeUnit: 0 });
    const onSearch = vi.fn();
    window.addEventListener(OPEN_UNIVERSAL_SEARCH_EVENT, onSearch);
    try {
      const view = render(
        <IllustratedTraverse unit={0} enabled onMovingChange={vi.fn()}>
          <div />
        </IllustratedTraverse>,
      );
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ...delta,
      });
      fireEvent(view.container.firstElementChild!, event);
      expect(onSearch).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(delta.deltaX === 0);
    } finally {
      window.removeEventListener(OPEN_UNIVERSAL_SEARCH_EVENT, onSearch);
    }
  },
);

const initial = useStacks.getState();

it.each([false, true])(
  "opens Search on a renewed vertical pull during arrival momentum, narrow=%s",
  (mobile) => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: mobile && query.startsWith("(width <"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    useStacks.setState({ activeUnit: 0 });
    const view = render(
      <IllustratedTraverse unit={0} enabled onMovingChange={vi.fn()}>
        <div />
      </IllustratedTraverse>,
    );
    const viewport = view.container.firstElementChild as HTMLElement;
    const onSearch = vi.fn();
    window.addEventListener(OPEN_UNIVERSAL_SEARCH_EVENT, onSearch);
    try {
      viewport.scrollLeft = 300;
      fireEvent.wheel(viewport, { deltaY: -400 });
      for (const delta of [24, 6, 18, 4, 22, 2, 12, 1]) {
        act(() => {
          vi.advanceTimersByTime(16);
        });
        fireEvent.wheel(viewport, { deltaY: -delta });
      }
      expect(onSearch).not.toHaveBeenCalled();
      for (const delta of [4, 16, 40, 80, 100, 120]) {
        act(() => {
          vi.advanceTimersByTime(16);
        });
        fireEvent.wheel(viewport, { deltaY: -delta });
      }
      expect(onSearch).toHaveBeenCalledTimes(1);
      expect(viewport.scrollLeft).toBe(0);
    } finally {
      window.removeEventListener(OPEN_UNIVERSAL_SEARCH_EVENT, onSearch);
    }
  },
);

const originalDecode = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  "decode",
);
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
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
  roomEdgeMotion.cancel();
  homeTapMotion.cancel();
  if (originalDecode)
    Object.defineProperty(HTMLImageElement.prototype, "decode", originalDecode);
  else Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
  useStacks.setState(initial);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("pulls the artwork back on a home tap without moving the viewport or changing sections", () => {
  useStacks.setState({ activeUnit: 0 });
  const view = render(
    <IllustratedTraverse unit={0} enabled onMovingChange={vi.fn()}>
      <div />
    </IllustratedTraverse>,
  );
  const viewport = view.container.firstElementChild as HTMLElement;
  const artwork = view.container.querySelector<HTMLElement>(
    ".room-illustration-content",
  )!;
  act(() => {
    homeTapMotion.play();
    vi.advanceTimersByTime(100);
  });
  expect(Number(artwork.style.scale)).toBeLessThan(0.99);
  expect(Number(artwork.style.scale)).toBeGreaterThan(0.97);
  expect(viewport.scrollLeft).toBe(0);
  expect(useStacks.getState().activeUnit).toBe(0);
  act(() => void vi.advanceTimersByTime(1400));
  expect(artwork.style.scale).toBe("");
  expect(artwork.style.transformOrigin).toBe("");
});

it("pans the artwork for a sheet Search gesture and restores it without moving the viewport", () => {
  useStacks.setState({ activeUnit: 0 });
  const view = render(
    <IllustratedTraverse unit={0} enabled onMovingChange={vi.fn()}>
      <div />
    </IllustratedTraverse>,
  );
  const viewport = view.container.firstElementChild as HTMLElement;
  const artwork = view.container.querySelector<HTMLElement>(
    ".room-illustration-content",
  )!;
  act(() => {
    roomEdgeMotion.play();
    vi.advanceTimersByTime(100);
  });
  expect(parseFloat(artwork.style.translate)).toBeGreaterThan(40);
  expect(viewport.style.translate).toBe("");
  expect(viewport.scrollLeft).toBe(0);
  expect(useStacks.getState().activeUnit).toBe(0);
  act(() => void vi.advanceTimersByTime(1200));
  expect(artwork.style.translate).toBe("");
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
  fireEvent.wheel(viewport.querySelector("[data-stacks-scrollable]")!, {
    deltaY: 1000,
  });
  fireEvent.wheel(viewport, { deltaY: 1000, ctrlKey: true });
  expect(viewport.scrollLeft).toBe(4000);
});

it("blocks handoff through held touch and unsettled wheel travel", () => {
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
  viewport.scrollLeft = 0;
  expect(illustrationInteraction.moving).toBe(true);
  act(() => {
    vi.advanceTimersByTime(180);
  });
  expect(illustrationInteraction.moving).toBe(true);
  act(() => {
    vi.advanceTimersByTime(1500);
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

it("keeps an object mounted through touch release, then dismisses it on actual travel", () => {
  const activate = vi.fn();
  function ObjectRoom() {
    const [moving, setMoving] = useState(false);
    const [open, setOpen] = useState(false);
    return (
      <IllustratedTraverse unit={0} enabled onMovingChange={setMoving}>
        {!moving && (
          <IllustrationObjectLabel
            label={{
              id: "book",
              title: "Book",
              action: "View book notes",
              bookId: "book",
            }}
            style={{}}
            open={open}
            onOpenChange={setOpen}
            onActivate={activate}
          />
        )}
      </IllustratedTraverse>
    );
  }
  const view = render(<ObjectRoom />);
  const target = view.getByRole("button", { name: "Book" });
  const down = () => {
    const event = new MouseEvent("pointerdown", { bubbles: true });
    Object.defineProperty(event, "pointerType", { value: "touch" });
    fireEvent(target, event);
  };
  down();
  expect(illustrationInteraction.moving).toBe(true);
  expect(view.queryByRole("button", { name: "Book" })).toBe(target);
  fireEvent.pointerUp(window);
  expect(illustrationInteraction.moving).toBe(false);
  fireEvent.click(target, { detail: 1 });
  expect(view.getByRole("dialog")).toBeTruthy();
  expect(activate).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  down();
  fireEvent.pointerUp(window);
  fireEvent.click(target, { detail: 1 });
  expect(activate).toHaveBeenCalledOnce();
  down();
  const row = view.container.firstElementChild as HTMLDivElement;
  row.scrollLeft = 100;
  fireEvent.scroll(row);
  expect(view.queryByRole("button", { name: "Book" })).toBeNull();
  expect(view.queryByRole("dialog")).toBeNull();
});

it.each([
  { unit: 0, deltaY: -240 },
  { unit: 6, deltaY: 240 },
])(
  "clamps remapped vertical wheel input at edge $unit without moving the viewport",
  ({ unit, deltaY }) => {
    useStacks.setState({ activeUnit: unit });
    const view = render(
      <IllustratedTraverse unit={unit} enabled onMovingChange={vi.fn()}>
        <div />
      </IllustratedTraverse>,
    );
    const row = view.container.firstElementChild as HTMLElement;
    fireEvent.wheel(row, { deltaY });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(row.scrollLeft).toBe(unit * 1000);
    expect(row.style.transform).toBe("");
    expect(useStacks.getState().activeUnit).toBe(unit);
  },
);

it("disables an active edge stretch without changing native interior scrolling", () => {
  const view = render(
    <IllustratedTraverse unit={0} enabled onMovingChange={vi.fn()}>
      <div />
    </IllustratedTraverse>,
  );
  const row = view.container.firstElementChild as HTMLElement;
  expect(row.style.overscrollBehaviorX).toBe("contain");
  fireEvent.wheel(row, { deltaX: -160 });
  act(() => {
    vi.advanceTimersByTime(16);
  });
  const content = row.querySelector<HTMLElement>(".room-illustration-content")!;
  expect(content.style.transform).not.toBe("");
  act(() => illustrationOverscrollController.setEnabled(false));
  expect(content.style.transform).toBe("");
  expect(row.style.overscrollBehaviorX).toBe("none");
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaX: 80,
  });
  row.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(row.style.transform).toBe("");
  act(() => illustrationOverscrollController.setEnabled(true));
  expect(row.style.overscrollBehaviorX).toBe("contain");
});

it("suppresses native bounce for system reduced motion", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const view = render(
    <IllustratedTraverse unit={0} enabled onMovingChange={vi.fn()}>
      <div />
    </IllustratedTraverse>,
  );
  expect(
    (view.container.firstElementChild as HTMLElement).style.overscrollBehaviorX,
  ).toBe("none");
});

it("leaves horizontal trackpad momentum to the native scroll view", () => {
  const view = render(
    <IllustratedTraverse unit={4} enabled onMovingChange={vi.fn()}>
      <div />
    </IllustratedTraverse>,
  );
  const row = view.container.firstElementChild as HTMLElement;
  for (const deltaX of [120, 60, 20, 5, 0, -12]) {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX,
      deltaY: 1,
    });
    row.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    // The browser owns scrollLeft and the platform's momentum curve.
    expect(row.scrollLeft).toBe(4000);
  }
});

it.each([0, 6])(
  "keeps the clipping viewport fixed when scrolling back from edge %s",
  (unit) => {
    const view = render(
      <IllustratedTraverse unit={unit} enabled onMovingChange={vi.fn()}>
        <div />
      </IllustratedTraverse>,
    );
    const row = view.container.firstElementChild as HTMLElement;
    fireEvent.wheel(row, { deltaX: unit === 0 ? -240 : 240 });
    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(row.style.transform).toBe("");
    fireEvent.wheel(row, { deltaX: unit === 0 ? 40 : -40 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(row.style.transform).toBe("");
  },
);

it.each([
  { unit: 0, deltaX: -160, deltaY: 0 },
  { unit: 0, deltaX: 0, deltaY: -160 },
  { unit: 6, deltaX: 160, deltaY: 0 },
  { unit: 6, deltaX: 0, deltaY: 160 },
])(
  "visibly stretches the artwork at edge $unit for wheel $deltaX/$deltaY",
  ({ unit, deltaX, deltaY }) => {
    const view = render(
      <IllustratedTraverse unit={unit} enabled onMovingChange={vi.fn()}>
        <div />
      </IllustratedTraverse>,
    );
    const viewport = view.container.firstElementChild as HTMLElement;
    fireEvent.wheel(viewport, { deltaX, deltaY });
    act(() => {
      vi.advanceTimersByTime(16);
    });
    const content = viewport.querySelector<HTMLElement>(
      ".room-illustration-content",
    );
    expect(content).not.toBeNull();
    expect(
      Math.abs(parseFloat(content!.style.transform.replace("translateX(", ""))),
    ).toBeGreaterThan(10);
    expect(viewport.style.transform).toBe("");
    expect(viewport.scrollLeft).toBe(unit * 1000);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(content!.style.transform).toBe("translateX(0px)");
  },
);

it.each([0, 6])(
  "keeps Chrome's remapped vertical momentum from re-pulling edge %s",
  (unit) => {
    useStacks.setState({ activeUnit: unit });
    const view = render(
      <IllustratedTraverse unit={unit} enabled onMovingChange={vi.fn()}>
        <div />
      </IllustratedTraverse>,
    );
    const viewport = view.container.firstElementChild as HTMLElement;
    const content = viewport.querySelector<HTMLElement>(
      ".room-illustration-content",
    )!;
    const direction = unit === 0 ? -1 : 1;
    const read = () =>
      Math.abs(
        parseFloat(content.style.transform.replace("translateX(", "")) || 0,
      );
    // Arriving at About owns this gesture; only the next pull opens Search.
    if (unit === 0) {
      viewport.scrollLeft = 100;
      fireEvent.wheel(viewport, { deltaY: -100 });
    }
    for (let i = 0; i < 8; i++) {
      fireEvent.wheel(viewport, { deltaY: direction * 80 });
      act(() => {
        vi.advanceTimersByTime(16);
      });
    }
    act(() => {
      vi.advanceTimersByTime(64);
    });
    const cadence = [16, 48, 32, 80];
    let previous = read();
    for (let i = 0; i < 40; i++) {
      act(() => {
        vi.advanceTimersByTime(cadence[i % cadence.length]!);
      });
      previous = read();
      fireEvent.wheel(viewport, { deltaY: direction * 12 * Math.pow(0.92, i) });
      act(() => {
        vi.advanceTimersByTime(16);
      });
      expect(read()).toBeLessThanOrEqual(previous);
      expect(viewport.scrollLeft).toBe(unit * 1000);
      expect(viewport.style.transform).toBe("");
    }
    expect(read()).toBe(0);
    // A new pull opens Search on the left and bounces again on the right.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const onSearch = vi.fn();
    window.addEventListener(OPEN_UNIVERSAL_SEARCH_EVENT, onSearch);
    fireEvent.wheel(viewport, { deltaY: direction * 160 });
    window.removeEventListener(OPEN_UNIVERSAL_SEARCH_EVENT, onSearch);
    act(() => {
      vi.advanceTimersByTime(16);
    });
    if (unit === 0) expect(onSearch).toHaveBeenCalledTimes(1);
    else {
      expect(onSearch).not.toHaveBeenCalled();
      expect(read()).toBeGreaterThan(90);
    }
  },
);

it("does not turn an out-of-range browser position into a new rubber band", () => {
  const view = render(
    <IllustratedTraverse unit={6} enabled onMovingChange={vi.fn()}>
      <div />
    </IllustratedTraverse>,
  );
  const viewport = view.container.firstElementChild as HTMLElement;
  const content = viewport.querySelector<HTMLElement>(
    ".room-illustration-content",
  )!;
  // Browser layout and authored stop geometry can disagree at fractional pixels.
  viewport.scrollLeft = 6000.5;
  fireEvent.scroll(viewport);
  fireEvent.wheel(viewport, { deltaX: 0, deltaY: 0 });
  act(() => {
    vi.advanceTimersByTime(16);
  });
  expect(content.style.transform).toBe("");
});

it("does not publish spring-time scroll adjustments as section travel", () => {
  const moving = vi.fn();
  const view = render(
    <IllustratedTraverse unit={6} enabled onMovingChange={moving}>
      <div />
    </IllustratedTraverse>,
  );
  const viewport = view.container.firstElementChild as HTMLElement;
  fireEvent.wheel(viewport, { deltaY: 160 });
  act(() => {
    vi.advanceTimersByTime(16);
  });
  moving.mockClear();
  viewport.scrollLeft = 5999.5;
  fireEvent.scroll(viewport);
  expect(dimensionTravel.readIllustratedPosition?.()).toBe(6);
  expect(moving).not.toHaveBeenCalled();
});

it("scrolls past About's camera stop to reveal the left side before stretching", () => {
  let leadingSpace = 260;
  vi.mocked(illustrationTravelStops).mockImplementation((width) =>
    Array.from({ length: 7 }, (_, position) => ({
      position,
      scrollLeft: leadingSpace + position * width,
      width,
    })),
  );
  const view = render(
    <IllustratedTraverse unit={0} enabled onMovingChange={vi.fn()}>
      <div className="room-illustration-stop" />
    </IllustratedTraverse>,
  );
  const viewport = view.container.firstElementChild as HTMLElement;
  const track = viewport.querySelector<HTMLElement>(
    ".room-illustration-track",
  )!;
  const content = viewport.querySelector<HTMLElement>(
    ".room-illustration-content",
  )!;
  expect(viewport.scrollLeft).toBe(260);
  expect(track.style.width).toBe("7260px");
  expect(track.style.getPropertyValue("--room-leading-space")).toBe("260px");
  fireEvent.wheel(viewport, { deltaY: -200 });
  expect(viewport.scrollLeft).toBe(60);
  expect(content.style.transform).toBe("");
  expect(dimensionTravel.readIllustratedPosition?.()).toBe(0);
  fireEvent.wheel(viewport, { deltaY: -160 });
  expect(viewport.scrollLeft).toBe(0);
  act(() => {
    vi.advanceTimersByTime(16);
  });
  expect(
    parseFloat(content.style.transform.replace("translateX(", "")),
  ).toBeGreaterThan(0);
  act(() => {
    vi.advanceTimersByTime(1600);
  });
  expect(viewport.scrollLeft).toBe(0);
  expect(content.style.transform).toBe("translateX(0px)");
  leadingSpace = 300;
  fireEvent.resize(window);
  expect(viewport.scrollLeft).toBe(0);
  viewport.scrollLeft = 150;
  leadingSpace = 400;
  fireEvent.resize(window);
  expect(viewport.scrollLeft).toBe(200);
});
