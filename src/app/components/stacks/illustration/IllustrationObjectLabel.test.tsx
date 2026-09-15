// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { IllustrationObjectLabel } from "./IllustrationObjectLabel";
import { illustrationInteraction } from "./illustrationInteraction";
import type { IllustrationLabel } from "./illustrationLabels";

const book = {
  id: "reading-book:superminds",
  title: "Superminds",
  detail: ["Thomas W. Malone"],
  bookId: "superminds",
  action: "View book notes",
};
const activate = vi.fn();
function Example({ label = book }: { label?: IllustrationLabel }) {
  const [open, setOpen] = useState(false);
  return (
    <IllustrationObjectLabel
      label={label}
      style={{}}
      open={open}
      onOpenChange={setOpen}
      onActivate={activate}
    />
  );
}
function pointer(target: Element, type: string, init: PointerEventInit = {}) {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, "pointerType", {
    value: init.pointerType ?? "touch",
  });
  fireEvent(target, event);
}
function tap(target: Element) {
  pointer(target, "pointerdown", { clientX: 10, clientY: 10 });
  pointer(target, "pointerup", { clientX: 10, clientY: 10 });
  fireEvent.click(target, { detail: 1 });
}
beforeEach(() => {
  vi.useFakeTimers();
  activate.mockClear();
  illustrationInteraction.moving = false;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("previews a book on first touch and opens its notes on second touch", () => {
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "Superminds" });
  tap(trigger);
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(activate).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog").textContent).toContain("Thomas W. Malone");
  tap(trigger);
  expect(activate).toHaveBeenCalledExactlyOnceWith(book, trigger);
});
it("lets the visible label activate the selected book", () => {
  render(<Example />);
  tap(screen.getByRole("button", { name: "Superminds" }));
  fireEvent.click(screen.getByRole("button", { name: /View book notes/ }));
  expect(activate).toHaveBeenCalledOnce();
});
it("keeps 3D-only objects informational without an action or icon", () => {
  render(<Example label={{ id: "globe", title: "Globe" }} />);
  tap(screen.getByRole("button", { name: "Globe" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toBe("Globe");
  expect(dialog.querySelector("button, svg, [data-portal-action]")).toBeNull();
});
it("shows the same label after pointer dwell and keyboard focus", () => {
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "Superminds" });
  pointer(trigger, "pointerover", { pointerType: "mouse" });
  act(() => {
    vi.advanceTimersByTime(351);
  });
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.focus(trigger);
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it("never turns a swipe or cancelled contact into activation", () => {
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "Superminds" });
  tap(trigger);
  pointer(trigger, "pointerdown", { clientX: 10, clientY: 10 });
  pointer(trigger, "pointermove", { clientX: 40, clientY: 10, buttons: 1 });
  fireEvent.click(trigger, { detail: 1 });
  expect(activate).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
  pointer(trigger, "pointerdown");
  pointer(trigger, "pointercancel");
  fireEvent.click(trigger, { detail: 1 });
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("rejects clicks while room travel is waiting for a React commit", () => {
  render(<Example />);
  illustrationInteraction.moving = true;
  fireEvent.click(screen.getByRole("button", { name: "Superminds" }));
  expect(activate).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("dismisses touch selection on background contact", () => {
  render(<Example />);
  tap(screen.getByRole("button", { name: "Superminds" }));
  act(() => {
    vi.advanceTimersByTime(1);
  });
  pointer(document.body, "pointerdown");
  fireEvent.click(document.body);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(activate).not.toHaveBeenCalled();
});

it("does not mistake focus caused by the first touch for a second tap", () => {
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "Superminds" });
  pointer(trigger, "pointerdown");
  act(() => trigger.focus());
  expect(screen.queryByRole("dialog")).toBeNull();
  pointer(trigger, "pointerup");
  fireEvent.click(trigger, { detail: 1 });
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(activate).not.toHaveBeenCalled();
});
