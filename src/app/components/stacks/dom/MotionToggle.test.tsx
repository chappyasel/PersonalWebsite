// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  DESKTOP_MOTION_STORAGE_KEY,
  desktopMotionPreference,
} from "~/lib/desktopMotionPreference";

import { MotionToggle } from "./MotionToggle";

let desktop: EventTarget & { matches: boolean };
beforeEach(() => {
  desktop = Object.assign(new EventTarget(), { matches: true });
  vi.stubGlobal("matchMedia", () => desktop);
  localStorage.clear();
  desktopMotionPreference.setReduced(false);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("toggles an accessible, persistent preference and restores it on the next mount", () => {
  const first = render(<MotionToggle />);
  const button = first.getByRole("button", { name: "Reduce motion" });
  expect(button.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(button);
  expect(button.getAttribute("aria-pressed")).toBe("true");
  expect(localStorage.getItem(DESKTOP_MOTION_STORAGE_KEY)).toBe("true");
  expect(
    document.documentElement.hasAttribute("data-desktop-reduced-motion"),
  ).toBe(true);
  first.unmount();

  const second = render(<MotionToggle />);
  const restored = second.getByRole("button", { name: "Reduce motion" });
  expect(restored.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(restored);
  expect(desktopMotionPreference.getSnapshot()).toBe(false);
  expect(
    document.documentElement.hasAttribute("data-desktop-reduced-motion"),
  ).toBe(false);
});

it("loads a saved choice, suspends it on touch/mobile, and restores it on desktop", () => {
  localStorage.setItem(DESKTOP_MOTION_STORAGE_KEY, "true");
  render(<MotionToggle />);
  expect(desktopMotionPreference.getSnapshot()).toBe(true);
  act(() => {
    desktop.matches = false;
    desktop.dispatchEvent(new Event("change"));
  });
  expect(desktopMotionPreference.getSnapshot()).toBe(false);
  expect(
    document.documentElement.hasAttribute("data-desktop-reduced-motion"),
  ).toBe(false);
  act(() => {
    desktop.matches = true;
    desktop.dispatchEvent(new Event("change"));
  });
  expect(desktopMotionPreference.getSnapshot()).toBe(true);
});

it("works when persistence is blocked and follows changes from another tab", () => {
  const { getByRole } = render(<MotionToggle />);
  const write = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("Storage blocked");
    });
  fireEvent.click(getByRole("button", { name: "Reduce motion" }));
  expect(desktopMotionPreference.getSnapshot()).toBe(true);
  write.mockRestore();
  act(() => {
    localStorage.setItem(DESKTOP_MOTION_STORAGE_KEY, "false");
    window.dispatchEvent(
      new StorageEvent("storage", { key: DESKTOP_MOTION_STORAGE_KEY }),
    );
  });
  expect(desktopMotionPreference.getSnapshot()).toBe(false);
});
