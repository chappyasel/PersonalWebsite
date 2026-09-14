// @vitest-environment jsdom
import { touchWorldRef, useStacks } from "../store";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import ScrollBridges from "./ScrollBridges";

let world: HTMLDivElement;
const initial = useStacks.getState();

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  world = document.createElement("div");
  document.body.append(world);
  Object.defineProperties(world, {
    scrollWidth: { value: 4000 },
    clientWidth: { value: 1000 },
  });
  useStacks.setState({
    ...initial,
    scrollEl: world,
    focusedInteraction: "link",
    hovered: "link",
    pressedInteraction: null,
    dragging: null,
    modalOpen: false,
    panelState: "closed",
    visionRidePhase: "idle",
    travelTo: vi.fn(),
  });
  touchWorldRef.zoomOffset = 0.5;
  render(<ScrollBridges />);
});

afterEach(() => {
  cleanup();
  world.remove();
  useStacks.setState(initial);
  touchWorldRef.zoomOffset = 0;
  vi.unstubAllGlobals();
});

it.each([{ deltaX: -1 }, { deltaX: 1 }, { deltaY: -1 }, { deltaY: 1 }])(
  "dismisses on the first world wheel input %j, even at the room edge",
  (delta) => {
    fireEvent.wheel(world, delta);
    expect(useStacks.getState().focusedInteraction).toBeNull();
    expect(useStacks.getState().hovered).toBeNull();
    expect(touchWorldRef.zoomOffset).toBe(0);
  },
);

it("dismisses on the first native scroll without waiting for camera travel", () => {
  act(() => {
    world.scrollLeft = 0.5;
  });
  fireEvent.scroll(world);
  expect(useStacks.getState().focusedInteraction).toBeNull();
});

it("keeps a new selection when the last wheel's deferred scroll event arrives", () => {
  fireEvent.wheel(world, { deltaX: 1 });
  act(() => useStacks.getState().setFocusedInteraction("new-link"));
  fireEvent.scroll(world);
  expect(useStacks.getState().focusedInteraction).toBe("new-link");
});

it.each(["ArrowLeft", "ArrowRight", "a", "d", "2"])(
  "dismisses as keyboard travel starts with %s",
  (key) => {
    fireEvent.keyDown(window, { key });
    expect(useStacks.getState().focusedInteraction).toBeNull();
  },
);

it("preserves selection during browser zoom and scrolling a reading card", () => {
  fireEvent.wheel(world, { deltaY: 10, ctrlKey: true });
  expect(useStacks.getState().focusedInteraction).toBe("link");
  const card = document.createElement("div");
  card.setAttribute("data-stacks-scrollable", "");
  world.append(card);
  fireEvent.wheel(card, { deltaY: 10 });
  expect(useStacks.getState().focusedInteraction).toBe("link");
});
