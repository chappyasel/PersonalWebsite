// @vitest-environment jsdom
import type { StacksData } from "../data";
import { useStacks } from "../store";
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
  BootWaitNotes: () => (
    <div className="stacks-boot-wait-notes">Setting out the books.</div>
  ),
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
  expect(view.getByRole("status", { name: "Room view" }).textContent).toBe(
    "2D view",
  );
  expect(view.container.querySelector("img[data-room-artwork]")).toBeNull();
  expect(onReady).toHaveBeenLastCalledWith(null);
  expect(onUnavailable).toHaveBeenCalled();
  act(() => view.getByRole("button", { name: "Retry 3D" }).click());
  expect(onRequest3D).toHaveBeenCalledOnce();
  expect(view.queryByRole("dialog")).toBeNull();
});

it("shows Golf's overview and allows automatic entry without shelf registration", () => {
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
  expect(view.getByRole("img", { name: "Golf putting green" })).toBeTruthy();
  expect(
    view.container.querySelector("[data-illustration-selected] img"),
  ).toBeNull();
  expect(onReady).toHaveBeenLastCalledWith("golf-overview:light", false);
});

it("keeps the loading message readable through dissolve, then retires it with the illustration", async () => {
  const styles = readFileSync(
    "src/app/components/stacks/illustration/roomBootShell.css",
    "utf8",
  );
  const props = {
    data,
    theme: "light" as const,
    viewport: "desktop" as const,
    visible: true,
    loading: true,
    canRequest3D: false,
    onRequest3D: vi.fn(),
    onReady: vi.fn(),
    onUnavailable: vi.fn(),
  };
  const content = (presentation: "illustrated" | "dissolve" | "live") => (
    <>
      <style>{styles}</style>
      <div className="stacks-world-shell" data-room-presentation={presentation}>
        <IllustratedRoom {...props} visible={presentation !== "live"} />
      </div>
    </>
  );
  const view = render(content("illustrated"));
  await act(async () => Promise.resolve());
  const status = view.getByRole("status", { name: "Room view" });
  expect(status.querySelector(".room-loading-heading")?.textContent).toBe(
    "Loading 3D...",
  );
  expect(status.querySelectorAll(".stacks-boot-wait-dot")).toHaveLength(3);
  expect(
    status.querySelector(".stacks-boot-wait-notes")?.closest("[aria-hidden]"),
  ).not.toBeNull();
  expect(status.getAttribute("aria-atomic")).toBe("true");
  expect(
    view.container.querySelector("[data-illustration-loading]"),
  ).not.toBeNull();
  view.rerender(content("dissolve"));
  const drawing = view.container.querySelector(".room-illustration-traverse")!;
  expect(getComputedStyle(drawing).opacity).toBe("0");
  expect(
    getComputedStyle(view.container.querySelector(".room-illustration")!)
      .opacity,
  ).toBe("1");
  expect(drawing.contains(status)).toBe(false);
  expect(view.getByRole("status", { name: "Room view" })).toBe(status);
  view.rerender(content("live"));
  expect(view.queryByRole("status", { name: "Room view" })).toBeNull();
});

it("replaces loading copy with a quiet 2D label when the illustrated view settles", async () => {
  const props = {
    data,
    theme: "dark" as const,
    viewport: "phone" as const,
    visible: true,
    canRequest3D: false,
    onRequest3D: vi.fn(),
    onReady: vi.fn(),
    onUnavailable: vi.fn(),
  };
  const view = render(<IllustratedRoom {...props} loading />);
  await act(async () => Promise.resolve());
  const status = view.getByRole("status", { name: "Room view" });
  view.rerender(<IllustratedRoom {...props} loading={false} />);
  expect(view.getByRole("status", { name: "Room view" })).toBe(status);
  expect(status.textContent).toBe("2D view");
  expect(status.children).toHaveLength(1);
  expect(
    view.container.querySelector("[data-illustration-loading]"),
  ).toBeNull();
  expect(view.queryByText("You can explore while it loads.")).toBeNull();
});
