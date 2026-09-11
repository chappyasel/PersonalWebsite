// @vitest-environment jsdom
import { useOpenTarget } from "../stacks/scene/links";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import SheetLink from "~/components/modal-sheet/SheetLink";

import RouteTransitionPrototype from "./RouteTransitionPrototype";
import { SHUTTER_TIMING } from "./shutters";
import { useRouteTransitionPrototype } from "./store";

const navigation = vi.hoisted(() => ({
  pathname: "/books",
  router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation.router,
}));
vi.mock("./BooksShelfPrototype", () => ({ BooksShelfPrototype: () => null }));
vi.mock("~/lib/analytics", () => ({
  capture: vi.fn(),
  HOMEPAGE_PORTAL_ACTIVATED_EVENT: "portal",
}));
vi.mock("../stacks/fieldNotes/progress", () => ({
  recordFieldNoteEvent: vi.fn(),
}));
const cancelled = vi.fn();
const animate = vi.fn(
  (_frames: Keyframe[], options: KeyframeAnimationOptions) => {
    let timer: ReturnType<typeof setTimeout>;
    const finished = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, Number(options.duration));
    });
    return {
      finished,
      cancel: () => {
        clearTimeout(timer);
        cancelled();
      },
    };
  },
);

beforeEach(() => {
  vi.useFakeTimers();
  navigation.pathname = "/books";
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  // Shutters must not depend on a rendering callback to begin navigation.
  vi.stubGlobal("requestAnimationFrame", vi.fn());
  Element.prototype.animate =
    animate as unknown as typeof Element.prototype.animate;
  useRouteTransitionPrototype.setState({ enabled: true, variant: "shutters" });
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("closes before navigating, holds for the route, then opens without a boot replay or extra dwell", async () => {
  const view = render(<RouteTransitionPrototype />);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Workouts" })),
  );
  expect(animate).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SHUTTER_TIMING.close - 1);
  });
  expect(navigation.router.push).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(navigation.router.push).toHaveBeenCalledWith("/weightlifting");
  expect(view.container.querySelector("[data-phase=covered]")).not.toBeNull();
  expect(view.container.querySelector(".stacks-boot")).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
  expect(animate).toHaveBeenCalledTimes(2);
  navigation.pathname = "/weightlifting";
  await act(async () => view.rerender(<RouteTransitionPrototype />));
  expect(animate).toHaveBeenCalledTimes(4);
  expect(view.container.querySelector("[data-phase=opening]")).not.toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SHUTTER_TIMING.open);
  });
  expect(view.container.querySelector(".route-prototype-curtains")).toBeNull();
  expect(cancelled).toHaveBeenCalledTimes(4);
});

it("skips shutters for reduced motion", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  render(<RouteTransitionPrototype />);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Home" })),
  );
  expect(navigation.router.push).toHaveBeenCalledWith("/#books");
  expect(animate).not.toHaveBeenCalled();
});

it("cancels closing shutters without navigating when disabled", async () => {
  const view = render(<RouteTransitionPrototype />);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Home" })),
  );
  await act(async () => view.unmount());
  expect(cancelled).toHaveBeenCalledTimes(2);
  expect(navigation.router.push).not.toHaveBeenCalled();
});

it("falls through to navigation if an animation never completes", async () => {
  animate.mockImplementationOnce(() => ({
    finished: new Promise<void>(() => undefined),
    cancel: cancelled,
  }));
  const view = render(<RouteTransitionPrototype />);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Home" })),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SHUTTER_TIMING.close + 500);
  });
  expect(navigation.router.push).toHaveBeenCalledWith("/#books");
  navigation.pathname = "/";
  await act(async () => view.rerender(<RouteTransitionPrototype />));
  expect(view.container.querySelector(".route-prototype-curtains")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain(
    "Shutter animation timed out",
  );
});

it("uses shutters for a Weightlifting site portal but leaves modal transitions alone", async () => {
  navigation.pathname = "/";
  const view = render(
    <>
      <RouteTransitionPrototype />
      <SheetLink href="/systems" onClick={(event) => event.preventDefault()}>
        Open systems sheet
      </SheetLink>
      <a href="http://weightlifting.localhost:3000" target="_blank">
        Training stats
      </a>
    </>,
  );
  await act(async () =>
    fireEvent.click(screen.getByText("Open systems sheet")),
  );
  expect(animate).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByText("Training stats")));
  expect(animate).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SHUTTER_TIMING.close);
  });
  expect(navigation.router.push).toHaveBeenCalledWith("/weightlifting");
  navigation.pathname = "/weightlifting";
  await act(async () => view.rerender(<RouteTransitionPrototype />));
});

function TrainingProp() {
  const open = useOpenTarget();
  return (
    <button
      onClick={() =>
        open(
          { to: "weightlifting" },
          { portalId: "training-portal", unitIndex: 2 },
        )
      }
    >
      Training prop
    </button>
  );
}

it("starts shutters from the actual 3D prop navigation hook", async () => {
  navigation.pathname = "/";
  const view = render(
    <>
      <RouteTransitionPrototype />
      <TrainingProp />
    </>,
  );
  await act(async () => fireEvent.click(screen.getByText("Training prop")));
  expect(animate).toHaveBeenCalledTimes(2);
  expect(navigation.router.push).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SHUTTER_TIMING.close);
  });
  expect(navigation.router.push).toHaveBeenCalledWith("/weightlifting");
  navigation.pathname = "/weightlifting";
  await act(async () => view.rerender(<RouteTransitionPrototype />));
});

it("animates the Weightlifting page title back to the Training shelf across local hostname aliases", async () => {
  navigation.pathname = "/weightlifting";
  const view = render(
    <>
      <RouteTransitionPrototype />
      <a href="http://127.0.0.1:3000/">Chappy&apos;s Weightlifting</a>
    </>,
  );
  await act(async () =>
    fireEvent.click(screen.getByText("Chappy's Weightlifting")),
  );
  expect(animate).toHaveBeenCalledTimes(2);
  expect(navigation.router.push).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SHUTTER_TIMING.close);
  });
  expect(navigation.router.push).toHaveBeenCalledWith("/#training");
  navigation.pathname = "/";
  await act(async () => view.rerender(<RouteTransitionPrototype />));
  expect(animate).toHaveBeenCalledTimes(4);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SHUTTER_TIMING.open);
  });
  expect(view.container.querySelector(".route-prototype-curtains")).toBeNull();
});

it("keeps the prop's original navigation when the transition controller is absent", async () => {
  render(<TrainingProp />);
  await act(async () => fireEvent.click(screen.getByText("Training prop")));
  expect(animate).not.toHaveBeenCalled();
  expect(navigation.router.push).toHaveBeenCalledWith(
    expect.stringContaining("weightlifting.localhost"),
  );
});
