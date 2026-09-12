// @vitest-environment jsdom
import RoomNavigation from "../input/RoomNavigation";
import { useStacks } from "../store";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { IllustratedTraverse } from "./IllustratedTraverse";

const initial = useStacks.getState();
beforeEach(() => {
  vi.useFakeTimers();
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
afterEach(() => {
  cleanup();
  useStacks.setState(initial);
  vi.useRealTimers();
  vi.restoreAllMocks();
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
