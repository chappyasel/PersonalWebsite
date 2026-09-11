// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  Suspense,
  lazy,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ModalSheet from "~/components/modal-sheet/ModalSheet";

import BookLink from "./BookLink";
import { InlineBookPreviewProvider } from "./InlineBookPreviewProvider";

const { queryBook, routerBack } = vi.hoisted(() => ({
  queryBook: vi.fn(() => ({ data: undefined, isLoading: true, error: null })),
  routerBack: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ back: routerBack }),
}));
vi.mock("next/dynamic", () => ({
  default: (
    loader: () => Promise<
      ComponentType<object> | { default: ComponentType<object> }
    >,
  ) => {
    const Component = lazy(async () => {
      const loaded = await loader();
      return { default: "default" in loaded ? loaded.default : loaded };
    });
    return function Dynamic(props: object) {
      return (
        <Suspense fallback={null}>
          <Component {...props} />
        </Suspense>
      );
    };
  },
}));
vi.mock("~/trpc/books-provider", () => ({
  BooksTRPCProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("~/trpc/react", () => ({
  api: { books: { getById: { useQuery: queryBook } } },
}));
vi.mock("~/app/books/components/BookDetailContent", () => ({
  BookDetailContent: () => <div>Book details</div>,
}));

const href = "https://books.chappyasel.com/the-culture-code";
const link = <BookLink href={href} slug="the-culture-code" />;

beforeEach(() => {
  window.history.replaceState(null, "", "/manual#communication");
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Observe whether the component handles the click, then suppress jsdom's
// unsupported full-page navigation for the cases that intentionally fall through.
function clickLink(options: MouseEventInit = {}) {
  let handled = false;
  const observe = (event: MouseEvent) => {
    handled = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", observe, { once: true });
  fireEvent.click(
    screen.getByRole("link", { name: "The Culture Code" }),
    options,
  );
  return handled;
}

describe("inline book navigation", () => {
  it("opens the existing book dialog over the document and restores it on back/forward", async () => {
    render(
      <InlineBookPreviewProvider>
        <p>Manual content</p>
        {link}
      </InlineBookPreviewProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(clickLink()).toBe(true);
    await screen.findByRole("dialog");
    expect(screen.getByText("Manual content")).toBeTruthy();
    expect(window.location.pathname).toBe("/books/the-culture-code");
    expect(window.history.state).toMatchObject({
      bookModal: true,
      inlineBookModal: true,
    });
    expect(queryBook).toHaveBeenCalledWith(
      { bookId: "the-culture-code" },
      expect.objectContaining({ enabled: true }),
    );

    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe("/manual"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.hash).toBe("#communication");
    act(() => window.history.forward());
    await screen.findByRole("dialog");
  });

  it("returns to the document on Escape", async () => {
    render(<InlineBookPreviewProvider>{link}</InlineBookPreviewProvider>);
    clickLink();
    await screen.findByRole("dialog");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(window.location.pathname).toBe("/manual"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps a containing document sheet open and focused correctly", async () => {
    render(
      <InlineBookPreviewProvider>
        <ModalSheet label="Manual" expandHref="/manual">
          {link}
        </ModalSheet>
      </InlineBookPreviewProvider>,
    );
    clickLink();
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(2));
    const bookDialog = document.querySelector<HTMLElement>(
      '[data-book-modal-shell="document"]',
    )!;
    act(() => bookDialog.focus());
    expect(document.activeElement).toBe(bookDialog);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    expect(routerBack).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it.each([
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
  ])("preserves modified navigation: %j", (options) => {
    render(<InlineBookPreviewProvider>{link}</InlineBookPreviewProvider>);
    clickLink(options);
    expect(window.location.pathname).toBe("/manual");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps small viewports on the full-page link", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<InlineBookPreviewProvider>{link}</InlineBookPreviewProvider>);
    expect(screen.getByRole("link").getAttribute("href")).toBe(href);
    expect(clickLink()).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("falls back to navigation when rendered without a modal provider", () => {
    render(link);
    expect(clickLink()).toBe(false);
  });
});
