// @vitest-environment jsdom
import { PlacardNestedLinkCard } from "../stacks/dom/PlacardStatsCard";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Link from "next/link";

import RouteTransitionPrototype from "./RouteTransitionPrototype";
import { useRouteTransitionPrototype } from "./store";

const navigation = vi.hoisted(() => ({
  pathname: "/",
  router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() },
  transition: vi.fn(async (_back: boolean, commit: () => Promise<void>) => {
    await commit();
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation.router,
}));
vi.mock("../stacks/dom/BootScreen", () => ({ BootScreenArtwork: () => null }));
vi.mock("../stacks/dom/bootReadingBooks", () => ({
  getBootReadingBooks: () => null,
}));
vi.mock("../../TiltCard", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("./BooksShelfPrototype", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    BooksShelfPrototype: forwardRef(function Shelf(_, ref) {
      useImperativeHandle(ref, () => ({ transition: navigation.transition }));
      return null;
    }),
  };
});

beforeEach(() => {
  navigation.pathname = "/";
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(window, "open").mockImplementation(() => null);
  window.history.replaceState(null, "", "/#books");
  useRouteTransitionPrototype.setState({ enabled: true, variant: "bookshelf" });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["click", "Enter"])(
  "animates the real nested Book Notes card on %s",
  async (interaction) => {
    const view = render(
      <>
        <RouteTransitionPrototype />
        <PlacardNestedLinkCard
          href="http://books.localhost:3000"
          label="Browse all Book Notes"
          newTab
        >
          <span>Currently reading</span>
        </PlacardNestedLinkCard>
      </>,
    );
    await act(async () => {
      if (interaction === "click")
        fireEvent.click(screen.getByText("Currently reading"));
      else
        fireEvent.keyDown(
          screen.getByRole("link", { name: "Browse all Book Notes" }),
          { key: "Enter" },
        );
    });
    expect(window.open).not.toHaveBeenCalled();
    expect(navigation.transition).toHaveBeenCalledWith(
      false,
      expect.any(Function),
      expect.any(AbortSignal),
      1,
      expect.any(Function),
    );
    expect(navigation.router.push).toHaveBeenCalledWith("/books");
    navigation.pathname = "/books";
    await act(async () => view.rerender(<RouteTransitionPrototype />));
  },
);

it("animates a library portal anchor and retains its subject filter", async () => {
  const view = render(
    <>
      <RouteTransitionPrototype />
      <a href="http://books.localhost:3000/?tags=Psychology" target="_blank">
        Browse subject
      </a>
    </>,
  );
  await act(async () => fireEvent.click(screen.getByText("Browse subject")));
  expect(navigation.transition).toHaveBeenCalled();
  expect(navigation.router.push).toHaveBeenCalledWith("/books?tags=Psychology");
  navigation.pathname = "/books";
  await act(async () => view.rerender(<RouteTransitionPrototype />));
});

it("animates the Book Notes home link back to the Books shelf", async () => {
  navigation.pathname = "/books";
  const view = render(
    <>
      <RouteTransitionPrototype />
      <Link href="/">Chappy&apos;s Book Notes</Link>
    </>,
  );
  await act(async () =>
    fireEvent.click(screen.getByText("Chappy's Book Notes")),
  );
  expect(navigation.transition).toHaveBeenCalledWith(
    true,
    expect.any(Function),
    expect.any(AbortSignal),
    1,
    expect.any(Function),
  );
  expect(navigation.router.push).toHaveBeenCalledWith("/?variant=bookshelf#books");
  navigation.pathname = "/";
  await act(async () => view.rerender(<RouteTransitionPrototype />));
});

it("leaves nested book links and modified portal clicks alone", async () => {
  render(
    <>
      <RouteTransitionPrototype />
      <PlacardNestedLinkCard
        href="http://books.localhost:3000"
        label="Browse library"
        newTab
      >
        <a href="http://books.localhost:3000/superminds" target="_blank">
          Superminds
        </a>
      </PlacardNestedLinkCard>
      <a href="http://books.localhost:3000" target="_blank">
        Library
      </a>
    </>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText("Superminds"));
    fireEvent.click(screen.getByText("Library"), { metaKey: true });
  });
  expect(navigation.transition).not.toHaveBeenCalled();
  expect(navigation.router.push).not.toHaveBeenCalled();
  expect(window.open).not.toHaveBeenCalled();
});

it("still opens the library when the shelf capture fails", async () => {
  navigation.transition.mockRejectedValueOnce(new Error("Camera unavailable"));
  const view = render(
    <>
      <RouteTransitionPrototype />
      <PlacardNestedLinkCard
        href="http://books.localhost:3000"
        label="Browse library"
        newTab
      >
        Reading stats
      </PlacardNestedLinkCard>
    </>,
  );
  await act(async () => fireEvent.click(screen.getByText("Reading stats")));
  expect(navigation.router.push).toHaveBeenCalledWith("/books");
  navigation.pathname = "/books";
  await act(async () => view.rerender(<RouteTransitionPrototype />));
  expect(screen.getByRole("status").textContent).toContain(
    "Camera unavailable",
  );
});

it("restores the card's ordinary navigation when the prototype unmounts", async () => {
  const card = (
    <PlacardNestedLinkCard
      href="http://books.localhost:3000"
      label="Browse library"
      newTab
    >
      Reading stats
    </PlacardNestedLinkCard>
  );
  const view = render(
    <>
      <RouteTransitionPrototype />
      {card}
    </>,
  );
  view.rerender(card);
  await act(async () => fireEvent.click(screen.getByText("Reading stats")));
  expect(navigation.transition).not.toHaveBeenCalled();
  expect(window.open).toHaveBeenCalledWith(
    "http://books.localhost:3000",
    "_blank",
    "noopener,noreferrer",
  );
});
