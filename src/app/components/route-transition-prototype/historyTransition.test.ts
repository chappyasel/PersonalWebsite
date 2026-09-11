// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import { installHistoryTransition } from "./historyTransition";

let dispose = () => undefined as void;
let removeNext = () => undefined as void;
afterEach(() => {
  dispose();
  removeNext();
  vi.restoreAllMocks();
});
function setup() {
  const next = vi.fn<(event: PopStateEvent) => void>();
  // Next installs its bubble listener before the transition controller mounts.
  window.addEventListener("popstate", next);
  removeNext = () => window.removeEventListener("popstate", next);
  const callbacks: Array<() => void> = [];
  const finish: Array<() => void> = [];
  const cancel = vi.fn();
  const accepts = vi.fn(() => true);
  const transition = vi.fn(
    (_url: URL, _state: unknown, restore: () => void) => {
      callbacks.push(restore);
      return new Promise<void>((resolve) => finish.push(resolve));
    },
  );
  dispose = installHistoryTransition({ accepts, transition, cancel });
  const pop = (state: unknown = { __NA: true }) =>
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  return { next, callbacks, finish, cancel, accepts, transition, pop };
}
it("holds Next's restore until capture, then delivers the original state exactly once", async () => {
  const { next, callbacks, finish, pop } = setup();
  const length = history.length;
  const state = { __NA: true, tree: { cached: true } };
  pop(state);
  expect(next).not.toHaveBeenCalled();
  callbacks[0]!();
  callbacks[0]!();
  finish[0]!();
  await Promise.resolve();
  await Promise.resolve();
  expect(next).toHaveBeenCalledTimes(1);
  expect(next.mock.calls[0]![0].state).toBe(state);
  expect(history.length).toBe(length);
});
it("lets modal, hash and unsupported history entries pass through untouched", () => {
  const { next, accepts, transition, pop } = setup();
  accepts.mockReturnValue(false);
  pop();
  accepts.mockReturnValue(true);
  pop(null);
  pop({ _N: true });
  expect(next).toHaveBeenCalledTimes(3);
  expect(transition).not.toHaveBeenCalled();
});
it("discards an older pending traversal when Back is pressed again", () => {
  const { next, callbacks, pop } = setup();
  pop({ __NA: true, id: 1 });
  pop({ __NA: true, id: 2 });
  callbacks[0]!();
  expect(next).not.toHaveBeenCalled();
  callbacks[1]!();
  expect(next).toHaveBeenCalledTimes(1);
  expect((next.mock.calls[0]![0].state as { id: number }).id).toBe(2);
});
it("does not replay a stale route after an unrelated traversal", () => {
  const { next, callbacks, accepts, pop } = setup();
  pop({ __NA: true, id: 1 });
  accepts.mockReturnValue(false);
  pop({ __NA: true, id: 2 });
  callbacks[0]!();
  expect(next).toHaveBeenCalledTimes(1);
  expect((next.mock.calls[0]![0].state as { id: number }).id).toBe(2);
});
it("releases a held traversal if diagnostics disables the controller", () => {
  const { next, callbacks, pop } = setup();
  pop();
  dispose();
  callbacks[0]!();
  expect(next).toHaveBeenCalledTimes(1);
});
it("fails open when the transition rejects before capture", async () => {
  const next = vi.fn<(event: PopStateEvent) => void>();
  window.addEventListener("popstate", next);
  removeNext = () => window.removeEventListener("popstate", next);
  dispose = installHistoryTransition({
    accepts: () => true,
    cancel: () => undefined,
    transition: async () => {
      throw new Error("capture skipped");
    },
  });
  window.dispatchEvent(
    new PopStateEvent("popstate", { state: { __NA: true } }),
  );
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(next).toHaveBeenCalledTimes(1);
});

it("binds the late-loaded controller to a listener registered before the router", () => {
  const bridge = { pop: null as ((event: PopStateEvent) => void) | null };
  window.__booksRouteHistory = bridge;
  const early = (event: PopStateEvent) => bridge.pop?.(event);
  window.addEventListener("popstate", early);
  const { next, callbacks, pop } = setup();
  try {
    pop();
    expect(next).not.toHaveBeenCalled();
    callbacks[0]!();
    expect(next).toHaveBeenCalledTimes(1);
    dispose();
    expect(bridge.pop).toBeNull();
  } finally {
    window.removeEventListener("popstate", early);
    delete window.__booksRouteHistory;
  }
});
