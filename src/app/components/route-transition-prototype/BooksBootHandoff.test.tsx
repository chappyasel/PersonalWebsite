// @vitest-environment jsdom
import type { BookInteractionRow } from "../stacks/scene/bookInteractions";
import { useStacks } from "../stacks/store";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import BooksBootPrototype from "./BooksBootPrototype";
import { useRouteTransitionPrototype } from "./store";

const liveRows = vi.hoisted(() => ({ rows: [] as BookInteractionRow[] }));
vi.mock("../stacks/scene/bookInteractions", () => ({
  readBookShelfRows: () => liveRows.rows,
}));

let finish: () => void;
const cancel = vi.fn();
const animate = vi.fn(() => ({
  finished: new Promise<void>((resolve) => {
    finish = resolve;
  }),
  cancel,
}));

beforeEach(() => {
  liveRows.rows = [];
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.stubGlobal("__stacks", {
    project: (x: number, y: number) => ({
      x: 200 + x * 150,
      y: 300 - y * 150,
      depth: 0,
    }),
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 300,
    y: 100,
    left: 300,
    top: 100,
    width: 400,
    height: 400,
    right: 700,
    bottom: 500,
    toJSON: () => ({}),
  });
  Element.prototype.animate =
    animate as unknown as typeof Element.prototype.animate;
  window.history.replaceState(null, "", "/#books");
  document.documentElement.dataset.booksBoot = "";
  document.documentElement.dataset.world = "pending";
  useRouteTransitionPrototype.setState({ enabled: true, variant: "bookshelf" });
  useStacks.setState({ activeUnit: 1, settledUnit: 1 });
});

it("keeps the colored book border when the zoom camera replaces the boot camera", async () => {
  liveRows.rows = [
    {
      shelf: "top",
      role: "featured",
      salt: 16,
      items: [
        {
          kind: "cover",
          key: "boot-book",
          url: "https://example.com/cover.jpg",
          x: 0,
          color: "#000000",
        },
      ],
    },
  ];
  const view = render(
    <BooksBootPrototype
      featuredBooks={[
        {
          id: "boot-book",
          title: "Superminds",
          author: "Author",
          coverUrl: "https://example.com/cover.jpg",
          pageCount: 320,
          audioLengthMin: null,
        },
      ]}
      spineBooks={[]}
    />,
  );
  const colors = (selector: string) =>
    Array.from(
      view.container.querySelectorAll(
        `${selector} [data-shelf-cover="boot-book"] polygon`,
      ),
      (polygon) => polygon.getAttribute("fill"),
    ).sort();
  const before = colors(".books-boot-light");
  expect(before.length).toBeGreaterThan(0);
  await act(async () => {
    document.documentElement.dataset.world = "ready";
    await vi.advanceTimersByTimeAsync(80);
  });
  expect(colors(".books-boot-live")).toEqual(before);
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  animate.mockClear();
  cancel.mockClear();
});

it("zooms the live projection from the boot size and waits for it to land before fading", async () => {
  const view = render(
    <BooksBootPrototype featuredBooks={[]} spineBooks={[]} />,
  );
  await act(async () => {
    document.documentElement.dataset.world = "ready";
    await vi.advanceTimersByTimeAsync(80);
  });
  const root = view.container.querySelector(".books-boot-prototype")!;
  expect(root.getAttribute("data-books-boot-phase")).toBe("aligning");
  expect(animate).toHaveBeenCalled();
  const frames = (animate.mock.calls as unknown as [Keyframe[]][])[0]![0];
  expect(frames[0]!.transform).toMatch(/^matrix\(/);
  expect(frames[0]!.transform).not.toBe("matrix(1, 0, 0, 1, 0, 0)");
  expect(frames.at(-1)!.transform).toBe("none");
  await act(async () => finish());
  expect(root.getAttribute("data-books-boot-phase")).toBe("done");
});

it("cancels the zoom when the diagnostics switch disables the prototype", async () => {
  const view = render(
    <BooksBootPrototype featuredBooks={[]} spineBooks={[]} />,
  );
  await act(async () => {
    document.documentElement.dataset.world = "ready";
    await vi.advanceTimersByTimeAsync(80);
  });
  act(() => useRouteTransitionPrototype.setState({ enabled: false }));
  expect(document.documentElement.hasAttribute("data-books-boot")).toBe(false);
  expect(cancel).toHaveBeenCalled();
  expect(view.container.querySelector(".books-boot-live")).toBeNull();
});

it("releases the room if the animation never finishes", async () => {
  const view = render(
    <BooksBootPrototype featuredBooks={[]} spineBooks={[]} />,
  );
  await act(async () => {
    document.documentElement.dataset.world = "ready";
    await vi.advanceTimersByTimeAsync(80);
  });
  expect(animate).toHaveBeenCalledOnce();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1200);
  });
  const root = view.container.querySelector<HTMLElement>(
    ".books-boot-prototype",
  )!;
  expect(root.dataset.booksBootPhase).toBe("done");
  expect(root.style.visibility).toBe("hidden");
  expect(cancel).toHaveBeenCalled();
});

it("releases the room if the Books camera never settles", async () => {
  useStacks.setState({ settledUnit: null });
  const view = render(
    <BooksBootPrototype featuredBooks={[]} spineBooks={[]} />,
  );
  await act(async () => {
    document.documentElement.dataset.world = "ready";
    await vi.advanceTimersByTimeAsync(1300);
  });
  expect(animate).not.toHaveBeenCalled();
  expect(
    view.container.querySelector<HTMLElement>(".books-boot-prototype")!.style
      .visibility,
  ).toBe("hidden");
  expect(vi.getTimerCount()).toBe(0);
});

it("skips the zoom for reduced motion", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const view = render(
    <BooksBootPrototype featuredBooks={[]} spineBooks={[]} />,
  );
  await act(async () => {
    document.documentElement.dataset.world = "ready";
    await vi.advanceTimersByTimeAsync(80);
  });
  expect(animate).not.toHaveBeenCalled();
  expect(
    view.container
      .querySelector(".books-boot-prototype")!
      .getAttribute("data-books-boot-phase"),
  ).toBe("done");
  expect(vi.getTimerCount()).toBe(0);
});
