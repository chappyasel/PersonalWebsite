// @vitest-environment jsdom
import { roomResidency } from "../stacks/room/roomResidency";
import { setInteractionRectProjectionResolver } from "../stacks/scene/interactionRegistry";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import * as originFlight from "~/lib/originFlight";

import DaylightHeroMeta from "~/components/daylight/HeroMeta";
import ModalSheet from "~/components/modal-sheet/ModalSheet";

import RouteTransitionPrototype from "./RouteTransitionPrototype";
import { SceneStartupGate } from "./SceneStartupGate";
import { requestPrototypeNavigation } from "./navigation";
import { originReturnGeometry, originZoomGeometry } from "./originZoom";
import {
  readRoomJourney,
  rememberRoomSource,
  writeRoomJourney,
} from "./roomJourney";
import { useRouteTransitionPrototype } from "./store";

// Exercise ordinary page links rather than the removed comparison toolbar.
function PageUnderTest() {
  return (
    <>
      <RouteTransitionPrototype />
      <a href="http://localhost/">Home</a>
      <a href="http://localhost/weightlifting">Workouts</a>
    </>
  );
}

const navigation = vi.hoisted(() => ({
  pathname: "/",
  router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() },
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
  useRouteTransitionPrototype.setState({
    enabled: true,
    variant: "origin",
    reverseRoom: true,
  });
  history.replaceState({ __NA: true }, "", "/");
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

it.each(["development", "production"])(
  "animates %s portals without showing comparison controls",
  async (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    useRouteTransitionPrototype.setState({
      variant: environment === "production" ? "shutters" : "origin",
    });
    const view = render(
      <>
        <PageUnderTest />
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
    await act(async () => view.rerender(<PageUnderTest />));
    await act(async () => finish());
  },
);

it.each([
  ["/musings", "/musings/ai-stack", false],
  ["/musings/ai-stack", "/musings/apple-way", false],
  ["/musings/ai-stack", "/musings", false],
  ["/musings", "/musings/ai-stack", true],
] as const)(
  "animates the reading route %s to %s, reduced motion %s",
  async (from, to, reduced) => {
    navigation.pathname = from;
    history.replaceState({ __NA: true }, "", from);
    vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
    const page = () => (
      <>
        <RouteTransitionPrototype />
        <a href={to}>Read essay</a>
      </>
    );
    const view = render(page());
    expect(navigation.router.prefetch).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByText("Read essay")));
    expect(navigation.router.push).toHaveBeenCalledWith(to);
    expect(vi.spyOn(document, "startViewTransition")).toHaveBeenCalledTimes(
      reduced ? 0 : 1,
    );
    if (!reduced)
      expect(document.documentElement.dataset.routePrototype).toBe("origin");
    navigation.pathname = to;
    await act(async () => view.rerender(page()));
    if (!reduced) await act(async () => finish());
    expect(document.documentElement.dataset.routePrototype).toBeUndefined();
  },
);

it.each([
  ["/musings/ai-stack", "/musings"],
  ["/musings", "/musings/ai-stack"],
] as const)(
  "animates browser traversal from %s to %s without pushing history",
  async (from, to) => {
    navigation.pathname = from;
    history.replaceState({ __NA: true }, "", from);
    const view = render(<PageUnderTest />);
    const restore = vi.fn(() => {
      navigation.pathname = to;
      view.rerender(<PageUnderTest />);
    });
    window.addEventListener("popstate", restore);
    try {
      history.replaceState({ __NA: true }, "", to);
      await act(async () =>
        window.dispatchEvent(
          new PopStateEvent("popstate", { state: { __NA: true } }),
        ),
      );
      expect(restore).toHaveBeenCalledTimes(1);
      expect(navigation.router.push).not.toHaveBeenCalled();
      expect(vi.spyOn(document, "startViewTransition")).toHaveBeenCalledTimes(
        1,
      );
      await act(async () => finish());
    } finally {
      window.removeEventListener("popstate", restore);
    }
  },
);

it("zooms from the clicked link's actual rectangle and releases capture at route commit", async () => {
  const view = render(
    <>
      <PageUnderTest />
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
  await act(async () => view.rerender(<PageUnderTest />));
  expect(document.documentElement.dataset.routePrototype).toBe("origin");
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
  const view = render(<PageUnderTest />);
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
  await act(async () => view.rerender(<PageUnderTest />));
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
  const view = render(<PageUnderTest />);
  await act(async () =>
    fireEvent.click(screen.getByRole("link", { name: "Home" })),
  );
  expect(useRouteTransitionPrototype.getState()).toMatchObject({
    deferSceneStartup: true,
  });
  navigation.pathname = "/";
  await act(async () =>
    view.rerender(
      <>
        <PageUnderTest />
        <SceneStartupGate>
          <Scene />
        </SceneStartupGate>
      </>,
    ),
  );
  expect(Scene).not.toHaveBeenCalled();
  expect(document.documentElement.dataset.routePrototype).toBe("origin");
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
  const view = render(<PageUnderTest />);
  await act(async () =>
    fireEvent.click(screen.getByRole("link", { name: "Home" })),
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
  const view = render(<PageUnderTest />);
  await act(async () =>
    fireEvent.click(screen.getByRole("link", { name: "Home" })),
  );
  navigation.pathname = "/";
  await act(async () => view.rerender(<PageUnderTest />));
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
      <PageUnderTest />
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
  await act(async () => view.rerender(<PageUnderTest />));
  expect(
    view.container.querySelector(".route-prototype-origin-panel"),
  ).toBeNull();
  expect(cancel).toHaveBeenCalledTimes(2);
});

it("returns toward the remembered object, reprojected after route commit", async () => {
  navigation.pathname = "/books";
  vi.spyOn(roomResidency, "hasReadyRoom").mockReturnValue(true);
  writeRoomJourney(
    rememberRoomSource(
      "books:original",
      roomResidency.getSnapshot().generation,
    ),
  );
  const project = vi.fn(() => bounds);
  setInteractionRectProjectionResolver(project);
  const view = render(<PageUnderTest />);
  await act(async () =>
    fireEvent.click(screen.getByRole("link", { name: "Home" })),
  );
  expect(project).not.toHaveBeenCalled();
  const resized = { ...bounds, left: 310, width: 220 };
  project.mockReturnValue(resized);
  navigation.pathname = "/";
  await act(async () => view.rerender(<PageUnderTest />));
  expect(project).toHaveBeenCalledWith("books:original");
  expect(document.documentElement.dataset.routeReturn).toBe("source");
  expect(
    document.documentElement.style.getPropertyValue("--route-return-clip"),
  ).toBe(originReturnGeometry(resized, innerWidth, innerHeight).clip);
  await act(async () => finish());
  expect(document.documentElement.dataset.routeReturn).toBeUndefined();
});

it("uses a soft return after expiry and never projects the retired room", async () => {
  navigation.pathname = "/books";
  vi.spyOn(roomResidency, "hasReadyRoom").mockReturnValue(false);
  writeRoomJourney(
    rememberRoomSource("books:retired", roomResidency.getSnapshot().generation),
  );
  const project = vi.fn(() => bounds);
  setInteractionRectProjectionResolver(project);
  const view = render(<PageUnderTest />);
  await act(async () =>
    fireEvent.click(screen.getByRole("link", { name: "Home" })),
  );
  navigation.pathname = "/";
  await act(async () => view.rerender(<PageUnderTest />));
  expect(project).not.toHaveBeenCalled();
  expect(document.documentElement.dataset.routeReturn).toBe("soft");
  await act(async () => finish());
});

it.each([
  ["/books", false],
  ["/books", true],
  ["/weightlifting", false],
  ["/weightlifting", true],
  ["/manual", false],
  ["/routine", false],
  ["/systems", false],
] as const)(
  "restores browser Back from %s without pushing, reduced motion %s",
  async (path, reduced) => {
    vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
    navigation.pathname = path;
    const view = render(<PageUnderTest />);
    const restore = vi.fn(() => {
      navigation.pathname = "/";
      view.rerender(<PageUnderTest />);
    });
    window.addEventListener("popstate", restore);
    try {
      await act(async () =>
        window.dispatchEvent(
          new PopStateEvent("popstate", { state: { __NA: true } }),
        ),
      );
      expect(restore).toHaveBeenCalledTimes(1);
      expect(navigation.router.push).not.toHaveBeenCalled();
      expect(vi.spyOn(document, "startViewTransition")).toHaveBeenCalledTimes(
        reduced ? 0 : 1,
      );
      if (!reduced) {
        expect(document.documentElement.dataset.routeReturn).toBe("soft");
        await act(async () => finish());
      }
    } finally {
      window.removeEventListener("popstate", restore);
    }
  },
);

it("the live off switch leaves Books history and source projection alone", async () => {
  navigation.pathname = "/books";
  useRouteTransitionPrototype.setState({ reverseRoom: false });
  const project = vi.fn(() => bounds);
  setInteractionRectProjectionResolver(project);
  render(<PageUnderTest />);
  const restore = vi.fn();
  window.addEventListener("popstate", restore);
  try {
    await act(async () =>
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: { __NA: true } }),
      ),
    );
    expect(restore).toHaveBeenCalledTimes(1);
    expect(vi.spyOn(document, "startViewTransition")).not.toHaveBeenCalled();
    expect(project).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener("popstate", restore);
  }
});

it("closes Weightlifting toward its room source when its page title returns home", async () => {
  navigation.pathname = "/weightlifting";
  history.replaceState({ __NA: true }, "", "/weightlifting");
  vi.spyOn(roomResidency, "hasReadyRoom").mockReturnValue(true);
  writeRoomJourney(
    rememberRoomSource(
      "training:dumbbell",
      roomResidency.getSnapshot().generation,
    ),
  );
  setInteractionRectProjectionResolver(() => bounds);
  const view = render(
    <>
      <PageUnderTest />
      <a href="http://localhost/#training">Return to room</a>
    </>,
  );
  await act(async () => fireEvent.click(screen.getByText("Return to room")));
  expect(navigation.router.push).toHaveBeenCalledWith("/#training");
  navigation.pathname = "/";
  await act(async () => view.rerender(<PageUnderTest />));
  expect(document.documentElement.dataset.routeReturn).toBe("source");
  expect(
    document.documentElement.style.getPropertyValue("--route-return-clip"),
  ).toBe(originReturnGeometry(bounds, innerWidth, innerHeight).clip);
  await act(async () => finish());
});

it("remembers a Weightlifting launch and closes back to that object on the same round trip", async () => {
  vi.spyOn(roomResidency, "hasReadyRoom").mockReturnValue(true);
  const project = vi.fn(() => bounds);
  setInteractionRectProjectionResolver(project);
  const push = (href: string) => history.pushState({ __NA: true }, "", href);
  navigation.router.push
    .mockImplementationOnce(push)
    .mockImplementationOnce(push);
  const view = render(<PageUnderTest />);
  await act(async () => {
    requestPrototypeNavigation("/weightlifting", "training:dumbbell");
  });
  navigation.pathname = "/weightlifting";
  await act(async () => view.rerender(<PageUnderTest />));
  expect(readRoomJourney(history.state)?.source).toEqual({
    kind: "scene",
    id: "training:dumbbell",
  });
  await act(async () => finish());

  const resized = { ...bounds, left: 300, width: 140 };
  project.mockReturnValue(resized);
  await act(async () =>
    fireEvent.click(screen.getByRole("link", { name: "Home" })),
  );
  navigation.pathname = "/";
  await act(async () => view.rerender(<PageUnderTest />));
  expect(document.documentElement.dataset.routeReturn).toBe("source");
  expect(
    document.documentElement.style.getPropertyValue("--route-return-clip"),
  ).toBe(originReturnGeometry(resized, innerWidth, innerHeight).clip);
  await act(async () => finish());
});

it("uses the departing page's source on Back and restores its scroll position on Forward", async () => {
  vi.spyOn(roomResidency, "hasReadyRoom").mockReturnValue(true);
  vi.stubGlobal("scrollY", 860);
  const scroll = vi
    .spyOn(window, "scrollTo")
    .mockImplementation(() => undefined);
  navigation.pathname = "/weightlifting";
  history.replaceState({ __NA: true }, "", "/weightlifting");
  const journey = rememberRoomSource(
    "training:dumbbell",
    roomResidency.getSnapshot().generation,
  );
  writeRoomJourney(journey);
  const pageState: unknown = history.state;
  const project = vi.fn(() => bounds);
  setInteractionRectProjectionResolver(project);
  const view = render(<PageUnderTest />);
  const restore = () => {
    navigation.pathname = location.pathname;
    view.rerender(<PageUnderTest />);
  };
  window.addEventListener("popstate", restore);
  try {
    // The destination room entry can retain an older trip's source.
    history.replaceState({ __NA: true }, "", "/");
    writeRoomJourney(
      rememberRoomSource(
        "books:older-trip",
        roomResidency.getSnapshot().generation,
      ),
    );
    const roomState: unknown = history.state;
    await act(async () =>
      window.dispatchEvent(new PopStateEvent("popstate", { state: roomState })),
    );
    expect(project).toHaveBeenLastCalledWith("training:dumbbell");
    expect(document.documentElement.dataset.routeReturn).toBe("source");
    await act(async () => finish());

    history.replaceState(pageState, "", "/weightlifting");
    await act(async () =>
      window.dispatchEvent(new PopStateEvent("popstate", { state: pageState })),
    );
    expect(document.documentElement.dataset.routeReturn).toBeUndefined();
    expect(project).toHaveBeenLastCalledWith("training:dumbbell");
    expect(scroll).toHaveBeenCalledWith({
      left: 0,
      top: 860,
      behavior: "instant",
    });
    expect(navigation.router.push).not.toHaveBeenCalled();
    await act(async () => finish());
  } finally {
    window.removeEventListener("popstate", restore);
  }
});

it("dismisses an expanded Systems document through its existing sheet without pushing home or recapturing it", async () => {
  navigation.pathname = "/systems";
  history.replaceState({ __NA: true }, "", "/systems");
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  originFlight.recordModalOrigin(bounds);
  vi.spyOn(originFlight, "originEntrance").mockReturnValue(true);
  const exit = vi
    .spyOn(originFlight, "originExit")
    .mockImplementation((_shell, _origin, _backdrop, finishExit) => {
      finishExit();
      return true;
    });
  const flights: { onfinish: (() => void) | null }[] = [];
  Element.prototype.animate = vi.fn(() => {
    const flight = {
      onfinish: null,
      finished: Promise.resolve(),
      cancel: vi.fn(),
    };
    flights.push(flight);
    return flight;
  }) as unknown as typeof Element.prototype.animate;
  const presence = vi.fn();
  const view = render(
    <>
      <RouteTransitionPrototype />
      <ModalSheet
        label="Systems"
        expandHref="/systems"
        onPresenceChange={presence}
      >
        <DaylightHeroMeta lastUpdated="2026-09-11" />
      </ModalSheet>
    </>,
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("link", { name: "Open full page" })),
  );
  act(() => flights.forEach((flight) => flight.onfinish?.()));
  expect(view.container.querySelector("[data-modal-sheet]")).toBeNull();
  const historyLength = history.length;
  // A router Back produces popstate before Next removes the intercepted slot.
  const restore = vi.fn(() => {
    navigation.pathname = "/";
    view.rerender(
      <>
        <RouteTransitionPrototype />
        <p>Returned to the room</p>
      </>,
    );
  });
  window.addEventListener("popstate", restore);
  navigation.router.back.mockImplementationOnce(() => {
    history.replaceState({ __NA: true }, "", "/#systems");
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { __NA: true } }),
    );
  });
  try {
    await act(async () =>
      fireEvent.click(screen.getByRole("link", { name: "chappyasel.com" })),
    );
    expect(exit).toHaveBeenCalledTimes(1);
    expect(navigation.router.back).toHaveBeenCalledTimes(1);
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(vi.spyOn(document, "startViewTransition")).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(presence).toHaveBeenCalledWith(false);
    expect(history.length).toBe(historyLength);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Returned to the room")).toBeDefined();
  } finally {
    window.removeEventListener("popstate", restore);
  }
});
