// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import { roomEventTarget } from "./roomEvents";
import { roomResidency } from "./roomResidency";

afterEach(() => {
  roomResidency.evict();
  roomResidency.enter(Symbol(), null);
});

it("detaches scene input while parked, then reconnects without duplicate listeners", () => {
  const events = roomEventTarget(() => window);
  const key = vi.fn();
  const owner = Symbol();
  roomResidency.enter(owner, "room");
  events.addEventListener("keydown", key, true);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "g" }));
  expect(key).toHaveBeenCalledTimes(1);
  roomResidency.leave(owner, true, "#books", () => undefined);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "g" }));
  expect(key).toHaveBeenCalledTimes(1);
  roomResidency.enter(Symbol(), "room");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "g" }));
  expect(key).toHaveBeenCalledTimes(2);
  events.removeEventListener("keydown", key, true);
  window.dispatchEvent(new KeyboardEvent("keydown"));
  expect(key).toHaveBeenCalledTimes(2);
});

it("preserves once listeners until an active-room event and never revives them", () => {
  const events = roomEventTarget(() => document);
  const click = vi.fn();
  const owner = Symbol();
  roomResidency.enter(owner, "room");
  roomResidency.leave(owner, true, "#books", () => undefined);
  events.addEventListener("click", click, { once: true });
  document.dispatchEvent(new MouseEvent("click"));
  expect(click).not.toHaveBeenCalled();
  const returning = Symbol();
  roomResidency.enter(returning, "room");
  document.dispatchEvent(new MouseEvent("click"));
  roomResidency.leave(returning, true, "#books", () => undefined);
  roomResidency.enter(Symbol(), "room");
  document.dispatchEvent(new MouseEvent("click"));
  expect(click).toHaveBeenCalledTimes(1);
});

it("releases held scene input on departure without blurring the reading page", () => {
  const events = roomEventTarget(() => window);
  const clearSceneKeys = vi.fn();
  const pageBlur = vi.fn();
  window.addEventListener("blur", pageBlur);
  events.addEventListener("blur", clearSceneKeys);
  const owner = Symbol();
  roomResidency.enter(owner, "room");
  roomResidency.leave(owner, true, "#books", () => undefined);
  expect(clearSceneKeys).toHaveBeenCalledOnce();
  expect(pageBlur).not.toHaveBeenCalled();
  events.removeEventListener("blur", clearSceneKeys);
  window.removeEventListener("blur", pageBlur);
});
