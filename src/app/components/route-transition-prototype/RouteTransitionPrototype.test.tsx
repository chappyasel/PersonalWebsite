// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RouteTransitionPrototype from "./RouteTransitionPrototype";
import { useRouteTransitionPrototype } from "./store";

const navigation = vi.hoisted(() => ({
  pathname: "/books",
  router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation.router,
}));
vi.mock("../stacks/dom/BootScreen", () => ({ BootScreenArtwork: () => null }));
vi.mock("../stacks/dom/bootReadingBooks", () => ({
  getBootReadingBooks: () => null,
}));

beforeEach(() => {
  vi.useFakeTimers();
  navigation.pathname = "/books";
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  // The browser suppresses rendering while the snapshot update is pending.
  // Frames cannot be the signal that releases that update.
  vi.stubGlobal("requestAnimationFrame", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Reflect.deleteProperty(document, "startViewTransition");
});

describe.each(["swipe", "cards"] as const)("%s navigation", (variant) => {
  it("reports a skipped capture instead of silently showing an ordinary navigation", async () => {
    useRouteTransitionPrototype.setState({ enabled: true, variant });
    document.startViewTransition = vi.fn((update: () => Promise<void>) => {
      const done = Promise.resolve().then(update);
      return {
        ready: done.then(() => {
          throw new DOMException("Capture timed out", "TimeoutError");
        }),
        finished: done,
        updateCallbackDone: done,
        skipTransition: vi.fn(),
      } as unknown as ViewTransition;
    }) as typeof document.startViewTransition;
    const view = render(<RouteTransitionPrototype />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Home" }));
    });
    navigation.pathname = "/";
    await act(async () => {
      view.rerender(<RouteTransitionPrototype />);
    });
    expect(screen.getByRole("status").textContent).toContain(
      "Animation skipped: TimeoutError",
    );
  });

  it("starts the animation after the route commits while rendering is suppressed", async () => {
    useRouteTransitionPrototype.setState({ enabled: true, variant });
    let updateDone = false;
    document.startViewTransition = vi.fn((update: () => Promise<void>) => {
      const done = Promise.resolve()
        .then(update)
        .then(() => {
          updateDone = true;
        });
      return {
        ready: done,
        finished: done,
        updateCallbackDone: done,
        skipTransition: vi.fn(),
      } as unknown as ViewTransition;
    }) as typeof document.startViewTransition;

    const view = render(<RouteTransitionPrototype />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Home" }));
    });
    expect(navigation.router.push).toHaveBeenCalledWith("/");
    navigation.pathname = "/";
    await act(async () => {
      view.rerender(<RouteTransitionPrototype />);
    });

    expect(
      updateDone,
      "route committed, but the snapshot animation never started",
    ).toBe(true);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});
