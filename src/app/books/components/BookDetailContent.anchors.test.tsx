// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  within,
} from "@testing-library/react";
import { type ComponentProps, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BaseBook } from "~/lib/books/types";

import { BookDetailContent } from "./BookDetailContent";

vi.mock("~/lib/analytics", () => ({ capture: vi.fn(), captureOnce: vi.fn() }));
vi.mock("~/components/site/SitePageHoverCard", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

const book: BaseBook & { notes: string } = {
  id: "test-book",
  notionId: "test-book",
  title: "Test Book",
  author: "Author",
  publicationYear: null,
  started: null,
  finished: null,
  abandoned: null,
  abandonedAtMin: null,
  rating: null,
  audioLengthMin: null,
  pageCount: null,
  tags: [],
  hasNotes: true,
  hasSummary: false,
  isAutomated: false,
  isFeatured: false,
  coverUrl: null,
  audibleUrl: null,
  notionUrl: "https://notion.so/test",
  notes:
    "## First chapter\n\nOpening notes.\n\n## Second chapter\n\nLater notes.",
};
const scrolled: HTMLElement[] = [];
const originalScroll = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

beforeEach(() => {
  vi.useFakeTimers();
  scrolled.length = 0;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(min-width: 768px)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) =>
    window.clearTimeout(id),
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: function (this: HTMLElement) {
      if (this.isConnected) scrolled.push(this);
    },
  });
  window.history.replaceState(null, "", "/books/test-book#second-chapter");
});

afterEach(() => {
  cleanup();
  for (const [object, key, descriptor] of [
    [HTMLElement.prototype, "scrollIntoView", originalScroll],
    [navigator, "clipboard", originalClipboard],
  ] as const) {
    if (descriptor) Object.defineProperty(object, key, descriptor);
    else Reflect.deleteProperty(object, key);
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function detail(
  overrides: Partial<ComponentProps<typeof BookDetailContent>> = {},
) {
  return (
    <BookDetailContent
      book={book}
      fullBook={book}
      isLoadingNotes={false}
      onShare={vi.fn()}
      copied={false}
      bookId={book.id}
      {...overrides}
    />
  );
}

describe("book note section links", () => {
  it("scrolls to the mounted heading after the desktop layout renders", async () => {
    render(detail());
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(scrolled).toContain(document.getElementById("second-chapter"));
  });

  it("keeps section ids stable in Strict Mode", async () => {
    render(<StrictMode>{detail()}</StrictMode>);
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(document.getElementById("second-chapter")).not.toBeNull();
    expect(scrolled).toContain(document.getElementById("second-chapter"));
  });

  it("opens nested folded sections and scrolls on a later hash change", async () => {
    window.history.replaceState(null, "", "/books/test-book");
    const fullBook = {
      ...book,
      notes:
        "<details><summary>Outer</summary>\n\n<details><summary>Inner</summary>\n\n## Second chapter\n\nNotes.\n\n</details>\n\n</details>",
    };
    const { container } = render(detail({ fullBook, isModal: true }));
    expect(container.querySelectorAll('[data-expanded="false"]')).toHaveLength(
      2,
    );
    act(() => {
      window.history.replaceState(null, "", "#second-chapter");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(container.querySelectorAll('[data-expanded="true"]')).toHaveLength(
      2,
    );
    expect(scrolled).toContain(document.getElementById("second-chapter"));
  });

  it("waits for the loading skeleton to be replaced by notes", async () => {
    const { rerender } = render(detail({ isLoadingNotes: true }));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(scrolled).toHaveLength(0);
    rerender(detail());
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(scrolled).toContain(document.getElementById("second-chapter"));
  });

  it("opens a copied duplicate-heading link on a fresh render", async () => {
    window.history.replaceState(null, "", "/books/test-book");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const fullBook = {
      ...book,
      notes: "## Chapter\n\nFirst.\n\n## Chapter\n\nSecond.",
    };
    const first = render(<StrictMode>{detail({ fullBook })}</StrictMode>);
    const heading = document.getElementById("chapter-2")!;
    expect(heading).not.toBeNull();
    await act(async () => {
      fireEvent.click(
        within(heading).getByRole("button", {
          name: "Copy link to this section",
        }),
      );
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/#chapter-2$/),
    );
    const copiedUrl = new URL(writeText.mock.calls[0]![0] as string);
    first.unmount();
    window.history.replaceState(null, "", `/books/test-book${copiedUrl.hash}`);
    render(<StrictMode>{detail({ fullBook })}</StrictMode>);
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(scrolled).toContain(document.getElementById("chapter-2"));
  });

  it("cancels pending scrolls when the book unmounts", async () => {
    const { unmount } = render(detail());
    const scrollIntoView = vi.fn();
    const heading = document.getElementById("second-chapter")!;
    heading.scrollIntoView = scrollIntoView;
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("ignores malformed URL fragments", async () => {
    window.history.replaceState(null, "", "#%E0%A4%A");
    render(detail());
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(scrolled).toHaveLength(0);
  });
});
