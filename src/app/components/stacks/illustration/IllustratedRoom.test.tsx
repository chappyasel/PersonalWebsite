// @vitest-environment jsdom
import type { StacksData } from "../data";
import { publishPanelFraming, useStacks } from "../store";
import { act, cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import IllustratedRoom from "./IllustratedRoom";

vi.mock("./IllustratedTraverse", () => ({
  IllustratedTraverse: ({ children }: { children: ReactNode }) => (
    <div className="room-illustration-traverse">{children}</div>
  ),
}));

vi.mock("../dom/BootScreen", () => ({
  BootScreenArtwork: () => (
    <svg className="stacks-boot-scene" viewBox="0 0 300 230">
      <image href="/cover.png" />
    </svg>
  ),
}));
const initial = useStacks.getState();
const data = {
  readingBooks: [],
  readingBookColors: {},
  featuredBooks: [],
  featuredBookColors: {},
  spineBooks: [],
} as unknown as StacksData;
let resize: () => void;
let decode = vi.fn<() => Promise<void>>();
let rectangle = { x: 20, y: 100, width: 500, height: 300 };
beforeEach(() => {
  history.replaceState(null, "", "/");
  document.documentElement.dataset.roomFirstUnit = "0";
  rectangle = { x: 20, y: 100, width: 500, height: 300 };
  HTMLElement.prototype.scrollTo = vi.fn();
  useStacks.setState({ activeUnit: 1, golfStop: false });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({
      ...rectangle,
      top: rectangle.y,
      left: rectangle.x,
      right: rectangle.x + rectangle.width,
      bottom: rectangle.y + rectangle.height,
      toJSON: () => ({}),
    }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {
        /* Measured explicitly in tests. */
      }
      disconnect() {
        /* No native observer. */
      }
    },
  );
  decode = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: decode,
  });
});
afterEach(() => {
  cleanup();
  publishPanelFraming(null);
  useStacks.setState(initial);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("publishes only decoded, measured active artwork and invalidates changed geometry", async () => {
  let finish!: () => void;
  decode.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const onReady = vi.fn();
  const props = {
    data,
    theme: "light" as const,
    viewport: "desktop" as const,
    visible: true,
    canRequest3D: false,
    onRequest3D: vi.fn(),
    onReady,
    onUnavailable: vi.fn(),
  };
  const view = render(<IllustratedRoom {...props} />);
  expect(view.container.querySelector("img[data-room-artwork]")).toBeNull();
  expect(onReady).toHaveBeenLastCalledWith(null);
  await act(async () => finish());
  const image = view.container.querySelector("img[data-room-artwork]")!;
  const key = image.getAttribute("data-artwork-key");
  expect(key).toBe(onReady.mock.lastCall?.[0]);
  expect(image.getAttribute("data-unit")).toBe("1");
  expect(image.getAttribute("data-theme")).toBe("light");
  expect(JSON.parse(key!)).toContain(500);
  rectangle = { ...rectangle, width: 420 };
  act(() => resize());
  expect(onReady.mock.lastCall?.[0]).not.toBe(key);
  expect(image.getAttribute("data-artwork-key")).toBe(
    onReady.mock.lastCall?.[0],
  );
  view.rerender(<IllustratedRoom {...props} visible={false} />);
  expect(view.container.querySelector("img[data-room-artwork]")).toBeNull();
});

it("does not publish stale decode completion after a shelf changes", async () => {
  const finish: Array<() => void> = [];
  decode.mockImplementation(
    () => new Promise<void>((resolve) => finish.push(resolve)),
  );
  const onReady = vi.fn();
  const view = render(
    <IllustratedRoom
      data={data}
      theme="light"
      viewport="desktop"
      visible
      canRequest3D={false}
      onRequest3D={vi.fn()}
      onReady={onReady}
      onUnavailable={vi.fn()}
    />,
  );
  act(() => useStacks.setState({ activeUnit: 4 }));
  await act(async () => finish[0]!());
  expect(onReady).toHaveBeenLastCalledWith(null);
  expect(view.container.querySelector("img[data-room-artwork]")).toBeNull();
  await act(async () => finish[1]!());
  expect(
    view.container
      .querySelector("img[data-room-artwork]")
      ?.getAttribute("data-unit"),
  ).toBe("4");
});

it("withholds both new and cached registration until the entrance settles, then measures the final box", async () => {
  const onReady = vi.fn();
  const props = {
    data,
    theme: "light" as const,
    viewport: "desktop" as const,
    visible: true,
    canRequest3D: false,
    onRequest3D: vi.fn(),
    onReady,
    onUnavailable: vi.fn(),
  };
  const view = render(<IllustratedRoom {...props} entranceSettled={false} />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(onReady).toHaveBeenLastCalledWith(null);
  expect(view.container.querySelector("img[data-room-artwork]")).toBeNull();
  expect(props.onUnavailable).not.toHaveBeenCalled();
  rectangle = { x: 150, y: 240, width: 640, height: 380 };
  view.rerender(<IllustratedRoom {...props} entranceSettled />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(JSON.parse(onReady.mock.lastCall![0] as string)).toContain(640);
  expect(view.container.querySelector("img[data-room-artwork]")).not.toBeNull();

  // The second layout effect must not republish the cached key while the
  // DOM is animated, even if visibility changes before a fresh decode.
  view.rerender(<IllustratedRoom {...props} entranceSettled={false} />);
  view.rerender(
    <IllustratedRoom {...props} entranceSettled={false} visible={false} />,
  );
  view.rerender(<IllustratedRoom {...props} entranceSettled={false} visible />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(onReady).toHaveBeenLastCalledWith(null);
  expect(view.container.querySelector("img[data-room-artwork]")).toBeNull();
});

it("keeps a failed drawing unregistered and offers explicit retry without owning content", async () => {
  decode.mockRejectedValue(new Error("decode failed"));
  const onReady = vi.fn();
  const onUnavailable = vi.fn();
  const onRequest3D = vi.fn();
  const view = render(
    <IllustratedRoom
      data={data}
      theme="dark"
      viewport="phone"
      visible
      canRequest3D
      onRequest3D={onRequest3D}
      onReady={onReady}
      onUnavailable={onUnavailable}
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(
    view.getByText(/The illustration is unavailable/).getAttribute("role"),
  ).toBe("status");
  expect(view.queryByRole("status", { name: "Room view" })).toBeNull();
  expect(view.container.querySelector("img[data-room-artwork]")).toBeNull();
  expect(onReady).toHaveBeenLastCalledWith(null);
  expect(onUnavailable).toHaveBeenCalled();
  act(() => view.getByRole("button", { name: "Retry 3D" }).click());
  expect(onRequest3D).toHaveBeenCalledOnce();
  expect(view.queryByRole("dialog")).toBeNull();
});

it.each(["/golf", "/#golf"])(
  "shows the abstract marker only for an initial %s URL",
  (url) => {
    history.replaceState(null, "", url);
    document.documentElement.dataset.roomFirstUnit = "1.52";
    useStacks.setState({ golfStop: true });
    const onReady = vi.fn();
    const view = render(
      <IllustratedRoom
        data={data}
        theme="light"
        viewport="desktop"
        visible
        canRequest3D={false}
        onRequest3D={vi.fn()}
        onReady={onReady}
        onUnavailable={vi.fn()}
      />,
    );
    expect(view.getByRole("img", { name: "Golf green and flag" })).toBeTruthy();
    expect(
      view.container.querySelector("[data-illustration-selected] img"),
    ).toBeNull();
    expect(onReady).toHaveBeenLastCalledWith("golf-overview:light", false);
  },
);

it.each([true, false])(
  "has no top-of-screen view status when loading is %s",
  async (loading) => {
    const view = render(
      <IllustratedRoom
        data={data}
        theme="light"
        viewport="desktop"
        visible
        canRequest3D={false}
        loading={loading}
        onRequest3D={vi.fn()}
        onReady={vi.fn()}
        onUnavailable={vi.fn()}
      />,
    );
    await act(async () => Promise.resolve());
    expect(view.queryByRole("status", { name: "Room view" })).toBeNull();
  },
);

it("fades the entire illustration for manual 3D entry without the shorter child fade", async () => {
  const styles = ["roomBootShell.css", "illustratedRoom.css"]
    .map((file) =>
      readFileSync(`src/app/components/stacks/illustration/${file}`, "utf8"),
    )
    .join("\n");
  const content = (presentation: string) => (
    <>
      <style>{styles}</style>
      <div
        className="stacks-world-shell"
        data-room-manual-3d=""
        data-room-presentation={presentation}
      >
        <IllustratedRoom
          data={data}
          theme="light"
          viewport="desktop"
          visible
          canRequest3D={false}
          onRequest3D={vi.fn()}
          onReady={vi.fn()}
          onUnavailable={vi.fn()}
        />
      </div>
    </>
  );
  const view = render(content("illustrated"));
  await act(async () => Promise.resolve());
  const drawing = view.container.querySelector(".room-illustration")!;
  const shelves = view.container.querySelector(".room-illustration-traverse")!;
  expect(getComputedStyle(drawing).opacity).toBe("1");
  view.rerender(content("dissolve"));
  expect(getComputedStyle(drawing).opacity).toBe("0");
  expect(getComputedStyle(drawing).transition).toContain(
    "var(--room-switch-duration, 420ms) ease-in-out",
  );
  expect(getComputedStyle(shelves).opacity).toBe("1");
  expect(getComputedStyle(shelves).transition).toBe("none");
  expect(view.queryByRole("status", { name: "Room view" })).toBeNull();
});

it("keeps the outgoing shelf and intervening shelves mounted for a long nav jump", async () => {
  useStacks.setState({ activeUnit: 0 });
  const view = render(
    <IllustratedRoom
      data={data}
      theme="light"
      viewport="desktop"
      visible
      canRequest3D={false}
      onRequest3D={vi.fn()}
      onReady={vi.fn()}
      onUnavailable={vi.fn()}
    />,
  );
  await act(async () => Promise.resolve());
  const outgoing = view.container.querySelector(
    ".room-illustration-stop .room-illustration-stage",
  );
  await act(async () => {
    useStacks.setState({ activeUnit: 6 });
  });
  const stops = view.container.querySelectorAll(".room-illustration-stop");
  expect(stops[0]!.querySelector(".room-illustration-stage")).toBe(outgoing);
  for (const stop of stops)
    expect(stop.querySelector(".room-illustration-stage")).not.toBeNull();
});

it("tracks partial sheet drags in 2D and stops subscribing when the drawing is hidden", async () => {
  vi.stubGlobal("innerWidth", 390);
  vi.stubGlobal("innerHeight", 844);
  const props = {
    data,
    theme: "light" as const,
    viewport: "phone" as const,
    visible: true,
    canRequest3D: false,
    onRequest3D: vi.fn(),
    onReady: vi.fn(),
    onUnavailable: vi.fn(),
  };
  const view = render(<IllustratedRoom {...props} />);
  await act(async () => Promise.resolve());
  const drawing =
    view.container.querySelector<HTMLElement>(".room-illustration")!;
  const shift = () =>
    parseFloat(drawing.style.getPropertyValue("--room-sheet-shift"));
  const scale = () =>
    Number(drawing.style.getPropertyValue("--room-sheet-scale"));
  expect(shift()).toBe(0);
  expect(scale()).toBe(1);
  act(() => publishPanelFraming({ coverage: 0.4, expansion: 0.5 }));
  const halfway = { shift: shift(), scale: scale() };
  expect(halfway.shift).toBeLessThan(0);
  expect(halfway.scale).toBeGreaterThan(1);
  act(() => publishPanelFraming({ coverage: 0.7, expansion: 1 }));
  expect(shift()).toBeCloseTo(halfway.shift - (844 * 0.3) / 2);
  expect(scale()).toBeCloseTo(1 + 2 * (halfway.scale - 1));
  act(() => publishPanelFraming({ coverage: 0.4, expansion: 0.5 }));
  expect(shift()).toBe(halfway.shift);
  expect(scale()).toBe(halfway.scale);
  view.rerender(<IllustratedRoom {...props} visible={false} />);
  act(() => publishPanelFraming({ coverage: 0.7, expansion: 1 }));
  expect(drawing.style.getPropertyValue("--room-sheet-shift")).toBe("");
  expect(drawing.style.getPropertyValue("--room-sheet-scale")).toBe("");
});

it("leaves desktop framing unchanged when the mobile sheet publishes", async () => {
  vi.stubGlobal("innerWidth", 1440);
  const view = render(
    <IllustratedRoom
      data={data}
      theme="light"
      viewport="desktop"
      visible
      canRequest3D={false}
      onRequest3D={vi.fn()}
      onReady={vi.fn()}
      onUnavailable={vi.fn()}
    />,
  );
  await act(async () => Promise.resolve());
  act(() => publishPanelFraming({ coverage: 0.7, expansion: 1 }));
  const drawing =
    view.container.querySelector<HTMLElement>(".room-illustration")!;
  expect(drawing.style.getPropertyValue("--room-sheet-shift")).toBe("0px");
  expect(drawing.style.getPropertyValue("--room-sheet-scale")).toBe("1");
});

it("does not insert a Golf illustration when normal browsing reaches Golf", async () => {
  useStacks.setState({ activeUnit: 2, golfStop: false });
  const view = render(
    <IllustratedRoom
      data={data}
      theme="light"
      viewport="desktop"
      visible
      canRequest3D={false}
      onRequest3D={vi.fn()}
      onReady={vi.fn()}
      onUnavailable={vi.fn()}
    />,
  );
  await act(async () => Promise.resolve());
  const training = view.container.querySelector(
    '[data-illustration-position="2"] img',
  );
  expect(training).not.toBeNull();
  await act(async () => {
    useStacks.setState({ golfStop: true });
  });
  expect(
    view.container.querySelector('[data-illustration-position="2"] img'),
  ).toBe(training);
  expect(view.queryByRole("img", { name: "Golf green and flag" })).toBeNull();
  expect(
    view.container.querySelectorAll(".room-illustration-stop"),
  ).toHaveLength(7);
  expect(view.queryByText("A little time on the green.")).toBeNull();
});

it("retires the Golf entry marker after 3D takes over", async () => {
  document.documentElement.dataset.roomFirstUnit = "1.52";
  useStacks.setState({ activeUnit: 2, golfStop: true });
  const props = {
    data,
    theme: "light" as const,
    viewport: "desktop" as const,
    canRequest3D: false,
    onRequest3D: vi.fn(),
    onReady: vi.fn(),
    onUnavailable: vi.fn(),
  };
  const view = render(<IllustratedRoom {...props} visible />);
  expect(view.getByRole("img", { name: "Golf green and flag" })).toBeTruthy();
  view.rerender(<IllustratedRoom {...props} visible={false} />);
  view.rerender(<IllustratedRoom {...props} visible />);
  await act(async () => Promise.resolve());
  expect(view.queryByRole("img", { name: "Golf green and flag" })).toBeNull();
});
