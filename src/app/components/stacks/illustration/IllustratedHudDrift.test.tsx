// @vitest-environment jsdom
import { UNIT_COUNT } from "../data";
import { dimensionTravel } from "../input/dimensionTravel";
import { hudCameraDriftController } from "../scene/hudCameraDriftControl";
import { act, cleanup, render } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { desktopMotionPreference } from "~/lib/desktopMotionPreference";

import { IllustratedHudDrift } from "./IllustratedHudDrift";

let callbacks: Map<number, FrameRequestCallback>;
let nextId: number;
let now: number;
let position: number;
let mobile: boolean;

beforeEach(() => {
  callbacks = new Map();
  nextId = 0;
  now = 0;
  position = 4;
  mobile = false;
  dimensionTravel.readIllustratedPosition = () => position;
  hudCameraDriftController.setEnabled(true);
  hudCameraDriftController.setMouseEnabled(true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.startsWith("(width <") ? mobile : !mobile,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  desktopMotionPreference.setReduced(false);
  dimensionTravel.readIllustratedPosition = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function mount() {
  const shell = document.createElement("div");
  shell.className = "stacks-world-shell";
  shell.innerHTML =
    '<nav class="stacks-hud-drift"></nav><aside data-stacks-desktop-dock></aside><nav class="stacks-mobile-hud-drift"></nav><div data-stacks-mobile-sheet-drift></div>';
  document.body.append(shell);
  const root = { current: shell };
  const view = render(
    <Activity mode="visible">
      <IllustratedHudDrift root={root} />
    </Activity>,
  );
  return {
    ...view,
    root,
    hud: shell.querySelector("nav")!,
    dock: shell.querySelector("aside")!,
    mobileHud: shell.querySelector<HTMLElement>(".stacks-mobile-hud-drift")!,
    sheet: shell.querySelector<HTMLElement>(
      "[data-stacks-mobile-sheet-drift]",
    )!,
  };
}
function frame() {
  act(() => {
    now += 1000 / 60;
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) callback(now);
  });
}
function pointer(x: number, y: number) {
  const event = new Event("pointermove");
  Object.assign(event, {
    pointerType: "mouse",
    clientX: x * innerWidth,
    clientY: y * innerHeight,
  });
  window.dispatchEvent(event);
}

it("ignores the cursor and moves 2D nav and cards with fractional travel without a canvas", () => {
  const { hud, dock } = mount();
  frame();
  expect(hud.style.translate).toBe("");
  pointer(1, 1);
  for (let i = 0; i < 90; i++) frame();
  expect(hud.style.translate).toBe("");
  expect(dock.style.transform).toBe("");
  for (let i = 0; i < 90; i++) {
    position += (UNIT_COUNT - 1) / 180;
    frame();
  }
  expect(hud.style.translate).toBe("-20px 0");
  expect(dock.style.transform).toBe("translateX(-20px)");
  expect(callbacks.size).toBe(1);
});

it("removes work and restores positions for diagnostics, reduced motion, and parked 2D", () => {
  const { hud, root, rerender } = mount();
  pointer(1, 1);
  for (let i = 0; i < 30; i++) {
    position += 1 / 30;
    frame();
  }
  expect(hud.style.translate).not.toBe("");
  act(() => desktopMotionPreference.setReduced(true));
  expect(callbacks.size).toBe(0);
  expect(hud.style.translate).toBe("");
  act(() => desktopMotionPreference.setReduced(false));
  expect(callbacks.size).toBe(1);
  act(() => {
    hudCameraDriftController.setEnabled(false);
    hudCameraDriftController.setMouseEnabled(false);
  });
  expect(callbacks.size).toBe(0);
  expect(callbacks.size).toBe(0);
  act(() => hudCameraDriftController.setEnabled(true));
  pointer(1, 1);
  for (let i = 0; i < 30; i++) {
    position += 1 / 30;
    frame();
  }
  rerender(
    <Activity mode="hidden">
      <IllustratedHudDrift root={root} />
    </Activity>,
  );
  expect(callbacks.size).toBe(0);
  expect(hud.style.translate).toBe("");
});

it("keeps mobile navigation and sheet content together, with no pointer drift", () => {
  mobile = true;
  const { mobileHud, sheet, hud } = mount();
  frame();
  pointer(1, 1);
  frame();
  expect(mobileHud.style.translate).toBe("");
  for (let i = 0; i < 60; i++) {
    position += 1 / 30;
    frame();
  }
  expect(mobileHud.style.translate).toBe("-20px 0");
  expect(sheet.style.translate).toBe(mobileHud.style.translate);
  expect(hud.style.translate).toBe("");
  for (let i = 0; i < 120; i++) frame();
  expect(mobileHud.style.translate).toBe("0px 0");
});

it("retains the nav and card transform context when travel settles", () => {
  const { hud, dock, unmount } = mount();
  frame();
  position += 1;
  frame();
  expect(hud.style.translate).not.toBe("");
  for (let i = 0; i < 180; i++) frame();
  expect(hud.style.translate).toBe("0px 0");
  expect(dock.style.transform).toBe("translateX(0px)");
  unmount();
  expect(hud.style.translate).toBe("");
  expect(dock.style.transform).toBe("");
});
