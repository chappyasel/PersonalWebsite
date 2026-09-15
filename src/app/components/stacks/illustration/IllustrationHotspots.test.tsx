// @vitest-environment jsdom
import type { StacksData } from "../data";
import { useStacks } from "../store";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { IllustrationHotspots } from "./IllustrationHotspots";
import { getRoomArtwork } from "./artwork";
import geometry from "./artwork/hotspots.generated.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../bookPrefetch", () => ({ requestBookPrefetch: vi.fn() }));
vi.mock("~/lib/books/useBookNotesActionLabel", () => ({
  useBookNotesActionLabel: () => "View book notes",
}));
const data = {
  readingBooks: [{ id: "current", title: "Current read", author: "Author" }],
  featuredBooks: [
    { id: "superminds", title: "Superminds", author: "Thomas Malone" },
  ],
  spineBooks: [],
} as unknown as StacksData;
const initial = useStacks.getState();
const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  x: left,
  y: top,
  right: left + width,
  bottom: top + height,
  toJSON: () => ({}),
});
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    rect(20, 30, 500, 300),
  );
  vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue(
    rect(120, 130, 50, 60),
  );
});
afterEach(() => {
  cleanup();
  useStacks.setState(initial);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("places each captured cover over its artwork and opens that book's notes", () => {
  render(
    <div>
      {/* A measured artwork fixture, with no image request. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-illustration-image alt="" />
      <IllustrationHotspots
        unit={1}
        data={data}
        theme="light"
        viewport="desktop"
      />
    </div>,
  );
  const cover = screen.getByRole("button", { name: "Superminds" });
  const box = geometry["1/light-desktop"].parts.find(
    (part) => part.id === "stacks-cover-superminds",
  )!.box;
  const art = getRoomArtwork(1, "light", "desktop")!;
  expect(parseFloat(cover.style.left)).toBeCloseTo(
    ((box[0]! - art.viewBox[0]!) / art.viewBox[2]!) * 100,
  );
  fireEvent.click(cover);
  expect(useStacks.getState().pendingBookId).toBe("superminds");
});
it("measures live About artwork for individual reading books and role icons", () => {
  render(
    <div>
      <svg>
        <g data-landmark-id="globe" />
        <g data-landmark-id="vision-pro" />
        <g data-landmark-id="reading-stack">
          <g data-reading-book="current" />
        </g>
        <g data-boot-role="madrona" />
      </svg>
      <IllustrationHotspots
        unit={0}
        data={data}
        theme="light"
        viewport="phone"
      />
    </div>,
  );
  expect(screen.getAllByRole("button")).toHaveLength(4);
  const book = screen.getByRole("button", { name: "Current read" });
  expect(book.style.left).toBe("20%");
  expect(book.style.top).toBe(`${100 / 3}%`);
  expect(book.style.width).toBe("10%");
  fireEvent.click(book);
  expect(useStacks.getState().pendingBookId).toBe("current");
});

it("opens Coordination Research from its About orb in 2D", () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  render(
    <div>
      <svg>
        <g data-landmark-id="coordination-globe" />
      </svg>
      <IllustrationHotspots
        unit={0}
        data={data}
        theme="light"
        viewport="phone"
      />
    </div>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Coordination Research" }),
  );
  expect(open).toHaveBeenCalledWith(
    "https://coordination.sh/",
    "_blank",
    "noopener,noreferrer",
  );
});
