// @vitest-environment jsdom
import type { WorldBootWaitStage } from "../boot/worldBootMachine";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { BootLoadingStatus } from "./BootLoadingStatus";
import { BOOT_WAIT_NOTES, BOOT_WAIT_NOTE_INTERVAL_MS } from "./bootVignette";

const boot = vi.hoisted(() => ({
  waitStage: "starting" as WorldBootWaitStage,
  revealed: false,
  listeners: new Set<() => void>(),
}));
vi.mock("../boot/worldBootSession", () => ({
  SERVER_WORLD_BOOT_VIEW: { waitStage: "starting", revealed: false },
  worldBoot: {
    getView: () => boot,
    subscribe: (listener: () => void) => {
      boot.listeners.add(listener);
      return () => boot.listeners.delete(listener);
    },
  },
}));
beforeEach(() => {
  vi.useFakeTimers();
  boot.waitStage = "starting";
  boot.revealed = false;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("rotates supporting copy within the actual loading stage and resets when the stage changes", () => {
  const view = render(<BootLoadingStatus />);
  const activeNote = () =>
    view.container.querySelector('[data-boot-note="active"]')!;
  expect(activeNote().textContent).toBe(BOOT_WAIT_NOTES.starting[0]);
  expect(
    view.getByRole("status").querySelector(".stacks-boot-wait-notes"),
  ).toBeNull();
  expect(activeNote().closest('[aria-hidden="true"]')).not.toBeNull();

  act(() => {
    vi.advanceTimersByTime(BOOT_WAIT_NOTE_INTERVAL_MS);
  });
  expect(activeNote().textContent).toBe(BOOT_WAIT_NOTES.starting[1]);
  act(() => {
    boot.waitStage = "assets";
    boot.listeners.forEach((listener) => listener());
  });
  expect(activeNote().textContent).toBe(BOOT_WAIT_NOTES.assets[0]);
  act(() => {
    vi.advanceTimersByTime(BOOT_WAIT_NOTE_INTERVAL_MS);
  });
  expect(activeNote().textContent).toBe(BOOT_WAIT_NOTES.assets[1]);
});

it("stops the supporting-copy timer when hidden or when 3D has revealed", () => {
  const view = render(<BootLoadingStatus active={false} />);
  expect(vi.getTimerCount()).toBe(0);
  view.rerender(<BootLoadingStatus active />);
  expect(vi.getTimerCount()).toBe(1);
  view.rerender(<BootLoadingStatus active={false} />);
  expect(vi.getTimerCount()).toBe(0);
  view.rerender(<BootLoadingStatus active />);
  act(() => {
    boot.revealed = true;
    boot.listeners.forEach((listener) => listener());
  });
  expect(vi.getTimerCount()).toBe(0);
});
