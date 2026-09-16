// @vitest-environment jsdom
import { fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import {
  beginOverlayClose,
  overlayCoordinator,
  ownsOverlayInput,
  registerOverlay,
} from "./coordinator";

const leases: ReturnType<typeof registerOverlay>[] = [];
function open(kind: Parameters<typeof registerOverlay>[0]["kind"]) {
  const surface = document.createElement("div");
  surface.setAttribute("role", "dialog");
  surface.tabIndex = -1;
  surface.innerHTML = "<button>First</button><button>Last</button>";
  document.body.append(surface);
  const dismiss = vi.fn();
  const lease = registerOverlay({ kind, surface, dismiss });
  leases.push(lease);
  return { surface, dismiss, ...lease };
}
afterEach(async () => {
  leases
    .splice(0)
    .reverse()
    .forEach((lease) => lease.release());
  await Promise.resolve();
  document.body.replaceChildren();
  document.body.style.overflow = "";
  expect(overlayCoordinator.getSnapshot().depth).toBe(0);
});

it("gives the newest overlay input and restores its parent after the exit", () => {
  const parent = open("document");
  const child = open("command");
  expect(Number(child.surface.style.zIndex)).toBeGreaterThan(
    Number(parent.surface.style.zIndex),
  );
  expect(parent.surface.inert).toBe(true);
  expect(ownsOverlayInput(parent.surface)).toBe(false);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(child.dismiss).toHaveBeenCalledOnce();
  expect(parent.dismiss).not.toHaveBeenCalled();
  child.update("closing");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(child.dismiss).toHaveBeenCalledOnce();
  expect(parent.dismiss).not.toHaveBeenCalled();
  child.release();
  expect(parent.surface.inert).toBeFalsy();
  expect(ownsOverlayInput(parent.surface)).toBe(true);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(parent.dismiss).toHaveBeenCalledOnce();
});

it("resumes animation at dismissal while keeping room input blocked through exit", () => {
  const video = open("video");
  beginOverlayClose(video.surface);
  expect(document.documentElement.hasAttribute("data-overlay-chrome")).toBe(
    false,
  );
  expect(overlayCoordinator.getSnapshot()).toMatchObject({
    blockRoom: true,
    blockPointer: true,
    freezeRoom: false,
    pauseBackground: false,
  });
  video.release();
  expect(overlayCoordinator.getSnapshot()).toMatchObject({
    blockRoom: false,
    blockPointer: false,
    freezeRoom: false,
    pauseBackground: false,
  });
});

it("holds the pause for open parents, then resumes when every overlay starts closing", () => {
  const parent = registerOverlay({
    kind: "album",
    settled: false,
    dismiss: vi.fn(),
  });
  leases.push(parent);
  expect(overlayCoordinator.getSnapshot()).toMatchObject({
    blockRoom: true,
    pauseBackground: false,
    freezeRoom: false,
  });
  parent.settle();
  expect(overlayCoordinator.getSnapshot()).toMatchObject({
    pauseBackground: true,
    freezeRoom: true,
  });
  const child = registerOverlay({
    kind: "video",
    settled: false,
    dismiss: vi.fn(),
  });
  leases.push(child);
  expect(overlayCoordinator.getSnapshot().freezeRoom).toBe(true);
  child.update("closing");
  expect(overlayCoordinator.getSnapshot()).toMatchObject({
    blockRoom: true,
    pauseBackground: true,
    freezeRoom: false,
  });
  child.settle();
  expect(overlayCoordinator.getSnapshot().freezeRoom).toBe(false);
  parent.update("closing");
  expect(overlayCoordinator.getSnapshot()).toMatchObject({
    pauseBackground: false,
    blockRoom: true,
    depth: 2,
  });
  parent.release();
  child.release();
  child.settle();
  expect(overlayCoordinator.getSnapshot()).toMatchObject({
    pauseBackground: false,
    freezeRoom: false,
  });
});

it("resumes synchronously when Escape begins the final dismissal", () => {
  const photo = open("scene-image");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(photo.dismiss).toHaveBeenCalledOnce();
  expect(overlayCoordinator.getSnapshot()).toMatchObject({
    pauseBackground: false,
    freezeRoom: false,
    blockRoom: true,
  });
});

it("preserves physical inspection's renderer and pointer while blocking room navigation", () => {
  const object = registerOverlay({ kind: "object", dismiss: vi.fn() });
  leases.push(object);
  expect(overlayCoordinator.getSnapshot()).toMatchObject({
    blockRoom: true,
    blockPointer: false,
    freezeRoom: false,
  });
  const video = open("video");
  expect(overlayCoordinator.getSnapshot().freezeRoom).toBe(true);
  video.release();
  expect(overlayCoordinator.getSnapshot().freezeRoom).toBe(false);
});

it("restores scrolling only after the final overlay releases, including out-of-order cleanup", async () => {
  document.body.style.overflow = "auto";
  const documentOverlay = open("document");
  const image = open("image");
  documentOverlay.release();
  documentOverlay.release();
  expect(document.body.style.overflow).toBe("hidden");
  image.release();
  // Simulate a viewer library's passive cleanup restoring its captured value.
  document.body.style.overflow = "hidden";
  await Promise.resolve();
  expect(document.body.style.overflow).toBe("auto");
});

it("lets a nested select consume Escape before its enclosing overlay", () => {
  const parent = open("document");
  const menu = document.createElement("div");
  menu.setAttribute("role", "listbox");
  document.body.append(menu);
  fireEvent.keyDown(menu, { key: "Escape" });
  expect(parent.dismiss).not.toHaveBeenCalled();
});

it("contains photo focus, yields to a child, and restores focus when the photo closes", async () => {
  const parent = open("document");
  const trigger = parent.surface.querySelector("button")!;
  trigger.focus();
  const image = open("image");
  await Promise.resolve();
  const first = image.surface.querySelector("button")!;
  const last = image.surface.querySelectorAll("button")[1]!;
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(last);
  const child = open("command");
  const input = child.surface.querySelector("button")!;
  input.focus();
  expect(document.activeElement).toBe(input);
  child.release();
  image.release();
  await Promise.resolve();
  expect(document.activeElement).toBe(trigger);
});
