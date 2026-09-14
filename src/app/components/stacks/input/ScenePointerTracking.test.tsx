// @vitest-environment jsdom
import { roomResidency } from "../room/roomResidency";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { UNIVERSAL_SEARCH_OPEN_ATTRIBUTE } from "~/lib/universal-search/overlay";

import ScenePointerTracking from "./ScenePointerTracking";

const runtime = vi.hoisted(() => ({
  state: {
    pointer: {
      x: 0,
      y: 0,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    },
    size: { left: 100, top: 50, width: 1000, height: 500 },
    raycaster: { setFromCamera: vi.fn() },
  },
}));
vi.mock("@react-three/fiber", () => ({
  useThree: (select: (state: object) => unknown) =>
    select({ get: () => runtime.state }),
}));
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  document.documentElement.removeAttribute(UNIVERSAL_SEARCH_OPEN_ATTRIBUTE);
  runtime.state.pointer.set(0, 0);
  runtime.state.raycaster.setFromCamera.mockClear();
});

function move(
  target: Element,
  clientX: number,
  clientY: number,
  pointerType = "mouse",
) {
  const event = new MouseEvent("pointermove", {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  target.dispatchEvent(event);
  return event;
}

it("holds the background pointer while search is open and resumes on the next scene movement", () => {
  const target = document.createElement("div");
  document.body.append(target);
  render(<ScenePointerTracking />);
  move(target, 850, 175);
  expect(runtime.state.pointer.x).toBe(0.5);
  expect(runtime.state.pointer.y).toBe(0.5);

  document.documentElement.setAttribute(
    UNIVERSAL_SEARCH_OPEN_ATTRIBUTE,
    "true",
  );
  move(target, 350, 425);
  expect(runtime.state.pointer.x).toBe(0.5);
  expect(runtime.state.pointer.y).toBe(0.5);

  document.documentElement.removeAttribute(UNIVERSAL_SEARCH_OPEN_ATTRIBUTE);
  expect(runtime.state.pointer.x).toBe(0.5);
  move(target, 350, 425);
  expect(runtime.state.pointer.x).toBe(-0.5);
  expect(runtime.state.pointer.y).toBe(-0.5);
});

it("keeps the shared camera/HUD pointer continuous across cards, navigation, and the scene", () => {
  const shell = document.createElement("div");
  shell.innerHTML =
    "<canvas></canvas><nav><button>About</button></nav><aside><a>Card</a></aside>";
  document.body.append(shell);
  const canvas = shell.querySelector("canvas")!;
  const nav = shell.querySelector("button")!;
  const card = shell.querySelector("a")!;
  card.addEventListener("pointermove", (event) => event.stopPropagation());
  const bounds = vi.spyOn(Element.prototype, "getBoundingClientRect");
  const { unmount } = render(<ScenePointerTracking />);

  for (const [index, target] of [canvas, nav, card, nav, canvas].entries()) {
    const event = move(target, 850 + index, 175 + index);
    expect(runtime.state.pointer.x).toBeCloseTo(0.5 + index * 0.002);
    expect(runtime.state.pointer.y).toBeCloseTo(0.5 - index * 0.004);
    expect(event.defaultPrevented).toBe(false);
  }
  move(card, 350, 425);
  expect(runtime.state.pointer.x).toBe(-0.5);
  expect(runtime.state.pointer.y).toBe(-0.5);
  move(canvas, 351, 425);
  expect(runtime.state.pointer.x).toBeCloseTo(-0.498);
  expect(runtime.state.raycaster.setFromCamera).not.toHaveBeenCalled();
  expect(bounds).not.toHaveBeenCalled();
  bounds.mockRestore();

  move(card, 850, 175, "touch");
  expect(runtime.state.pointer.x).toBeCloseTo(-0.498);
  unmount();
  move(nav, 850, 175);
  expect(runtime.state.pointer.x).toBeCloseTo(-0.498);
});

it("uses current canvas dimensions and detaches while the room is parked", () => {
  const owner = Symbol("room");
  roomResidency.enter(owner, "room");
  const card = document.createElement("div");
  document.body.append(card);
  render(<ScenePointerTracking />);
  const originalSize = runtime.state.size;
  runtime.state.size = { left: 0, top: 0, width: 500, height: 1000 };
  move(card, 375, 250);
  expect(runtime.state.pointer.x).toBe(0.5);
  expect(runtime.state.pointer.y).toBe(0.5);
  roomResidency.leave(owner, true, "#about", vi.fn());
  move(card, 0, 0);
  expect(runtime.state.pointer.x).toBe(0.5);
  roomResidency.enter(owner, "room");
  move(card, 0, 0);
  expect(runtime.state.pointer.x).toBe(-1);
  expect(runtime.state.pointer.y).toBe(1);
  runtime.state.size = originalSize;
});
