// @vitest-environment jsdom
import { setInteractionRectProjectionResolver } from "../stacks/scene/interactionRegistry";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import RouteTransitionPrototype from "./RouteTransitionPrototype";
import { SceneStartupGate } from "./SceneStartupGate";
import { requestPrototypeNavigation } from "./navigation";
import { originZoomGeometry } from "./originZoom";
import { useRouteTransitionPrototype } from "./store";

const navigation = vi.hoisted(() => ({
  pathname: "/",
  router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation.router,
}));
vi.mock("./BooksShelfPrototype", () => ({ BooksShelfPrototype: () => null }));
const bounds = { left: 120, top: 240, width: 320, height: 180 };
let finish: () => void;

beforeEach(() => {
  navigation.pathname = "/";
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("requestAnimationFrame", vi.fn());
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...bounds,
    x: bounds.left,
    y: bounds.top,
    right: 440,
    bottom: 420,
    toJSON: () => ({}),
  });
  useRouteTransitionPrototype.setState({ enabled: true, variant: "origin" });
  document.startViewTransition = vi.fn((update: () => Promise<void>) => {
    const done = Promise.resolve().then(update);
    const ended = new Promise<void>((resolve) => {
      finish = resolve;
    });
    return {
      ready: done,
      updateCallbackDone: done,
      finished: done.then(() => ended),
      skipTransition: () => finish(),
    } as unknown as ViewTransition;
  }) as typeof document.startViewTransition;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  setInteractionRectProjectionResolver(null);
  Reflect.deleteProperty(document, "startViewTransition");
});

it("animates production portals without showing comparison controls", async () => {
  vi.stubEnv("NODE_ENV", "production");
  useRouteTransitionPrototype.setState({ variant: "shutters" });
  const view = render(
    <>
      <RouteTransitionPrototype />
      <a href="https://books.chappyasel.com/" target="_blank">
        Book Notes
      </a>
    </>,
  );
  expect(
    screen.queryByRole("region", { name: "Route transition prototype" }),
  ).toBeNull();
  await act(async () => fireEvent.click(screen.getByText("Book Notes")));
  expect(navigation.router.push).toHaveBeenCalledWith("/books");
  expect(document.documentElement.dataset.routePrototype).toBe("origin");
  navigation.pathname = "/books";
  await act(async () => view.rerender(<RouteTransitionPrototype />));
  await act(async () => finish());
});

it("zooms from the clicked link's actual rectangle and releases capture at route commit", async () => {
  const view = render(
    <>
      <RouteTransitionPrototype />
      <a href="http://weightlifting.localhost:3000" target="_blank">
        Training card
      </a>
    </>,
  );
  await act(async () => fireEvent.click(screen.getByText("Training card")));
  expect(document.documentElement.dataset.routePrototype).toBe("origin");
  expect(
    document.documentElement.style.getPropertyValue("--route-origin-zoom"),
  ).toBe(originZoomGeometry(bounds, innerWidth, innerHeight).zoom);
  expect(
    document.documentElement.style.getPropertyValue("--route-origin-clip"),
  ).toBe(originZoomGeometry(bounds, innerWidth, innerHeight).clip);
  expect(navigation.router.push).toHaveBeenCalledWith("/weightlifting");
  navigation.pathname = "/weightlifting";
  await act(async () => view.rerender(<RouteTransitionPrototype />));
  expect(screen.getByRole("status").textContent).toContain("animating");
  expect(requestAnimationFrame).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(
    document.documentElement.style.getPropertyValue("--route-origin-zoom"),
  ).toBe("");
  expect(
    document.documentElement.style.getPropertyValue("--route-origin-clip"),
  ).toBe("");
});

it("uses the registered 3D object's projected bounds", async () => {
  const projected = { left: 440, top: 90, width: 140, height: 250 };
  const project = vi.fn(() => projected);
  setInteractionRectProjectionResolver(project);
  const view = render(<RouteTransitionPrototype />);
  await act(async () => {
    expect(
      requestPrototypeNavigation(
        "http://weightlifting.localhost:3000",
        "training:dumbbell",
      ),
    ).toBe(true);
  });
  expect(project).toHaveBeenCalledWith("training:dumbbell");
  expect(
    document.documentElement.style.getPropertyValue("--route-origin-zoom"),
  ).toBe(originZoomGeometry(projected, innerWidth, innerHeight).zoom);
  expect(
    document.documentElement.style.getPropertyValue("--route-origin-clip"),
  ).toBe(originZoomGeometry(projected, innerWidth, innerHeight).clip);
  navigation.pathname = "/weightlifting";
  await act(async () => view.rerender(<RouteTransitionPrototype />));
  await act(async () => finish());
});

it("does not project an object or allocate a transition when the controller is absent", () => {
  const project = vi.fn(() => bounds);
  setInteractionRectProjectionResolver(project);
  expect(
    requestPrototypeNavigation("/weightlifting", "training:dumbbell"),
  ).toBe(false);
  expect(project).not.toHaveBeenCalled();
  expect(vi.spyOn(document, "startViewTransition")).not.toHaveBeenCalled();
});

it("defers scene startup throughout a return reveal, then releases it", async () => {
  navigation.pathname = "/books";
  const Scene = vi.fn(() => <div>Live scene</div>);
  const view = render(<RouteTransitionPrototype />);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Home" })),
  );
  expect(useRouteTransitionPrototype.getState()).toMatchObject({
    deferSceneStartup: true,
  });
  navigation.pathname = "/";
  await act(async () =>
    view.rerender(
      <>
        <RouteTransitionPrototype />
        <SceneStartupGate>
          <Scene />
        </SceneStartupGate>
      </>,
    ),
  );
  expect(Scene).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toContain("animating");
  expect(useRouteTransitionPrototype.getState()).toMatchObject({
    deferSceneStartup: true,
  });
  await act(async () => finish());
  expect(screen.getByText("Live scene")).toBeDefined();
  expect(useRouteTransitionPrototype.getState()).toMatchObject({
    deferSceneStartup: false,
  });
});

it("releases scene startup if the prototype is unmounted during return", async () => {
  navigation.pathname = "/books";
  const view = render(<RouteTransitionPrototype />);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Home" })),
  );
  expect(useRouteTransitionPrototype.getState()).toMatchObject({
    deferSceneStartup: true,
  });
  await act(async () => view.unmount());
  expect(useRouteTransitionPrototype.getState()).toMatchObject({
    deferSceneStartup: false,
  });
});

it("releases scene startup even if a browser never finishes its transition", async () => {
  vi.useFakeTimers();
  navigation.pathname = "/books";
  const view = render(<RouteTransitionPrototype />);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Home" })),
  );
  navigation.pathname = "/";
  await act(async () => view.rerender(<RouteTransitionPrototype />));
  expect(useRouteTransitionPrototype.getState().deferSceneStartup).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(useRouteTransitionPrototype.getState().deferSceneStartup).toBe(false);
  await act(async () => finish());
});

it("expands a panel from the same source box when browser snapshots are unavailable", async () => {
  Reflect.deleteProperty(document, "startViewTransition");
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ finished: Promise.resolve(), cancel }));
  Element.prototype.animate =
    animate as unknown as typeof Element.prototype.animate;
  const view = render(
    <>
      <RouteTransitionPrototype />
      <a href="http://weightlifting.localhost:3000" target="_blank">
        Training card
      </a>
    </>,
  );
  await act(async () => fireEvent.click(screen.getByText("Training card")));
  const calls = animate.mock.calls as unknown as [
    Keyframe[],
    KeyframeAnimationOptions,
  ][];
  expect(calls[0]![0][0]!.transform).toBe(
    originZoomGeometry(bounds, innerWidth, innerHeight).panel,
  );
  expect(view.container.querySelector(".route-prototype-curtains")).toBeNull();
  expect(navigation.router.push).toHaveBeenCalledWith("/weightlifting");
  navigation.pathname = "/weightlifting";
  await act(async () => view.rerender(<RouteTransitionPrototype />));
  expect(
    view.container.querySelector(".route-prototype-origin-panel"),
  ).toBeNull();
  expect(cancel).toHaveBeenCalledTimes(2);
});
