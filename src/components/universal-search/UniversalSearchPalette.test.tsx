// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { recordRecentResult } from "~/lib/universal-search/recents";
import type { SearchResult } from "~/lib/universal-search/types";
import { universalSearchVisualEffects } from "~/lib/universal-search/visualEffects";

import type { UniversalSearchPaletteHandle } from "./UniversalSearchController";
import {
  UniversalSearchPaletteContent,
  applyBrowserTextEdit,
  type UniversalSearchPaletteDependencies,
} from "./UniversalSearchPalette";

afterEach(() => {
  cleanup();
  universalSearchVisualEffects.resetForTests();
});

beforeAll(() => {
  class TestResizeObserver implements ResizeObserver {
    disconnect = vi.fn();
    observe = vi.fn();
    unobserve = vi.fn();
  }
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  Element.prototype.scrollIntoView = vi.fn();
});

function dependencies(
  overrides: Partial<UniversalSearchPaletteDependencies> = {},
): UniversalSearchPaletteDependencies {
  return {
    storage: window.localStorage,
    location: {
      hostname: "www.chappyasel.com",
      port: "",
      protocol: "https:",
    },
    navigate: vi.fn(),
    setTheme: vi.fn(),
    setFont: vi.fn(),
    capture: vi.fn(),
    searchPublic: vi.fn(async () => []),
    searchServer: vi.fn(async () => ({
      groups: {
        books: { status: "success" as const, results: [] },
        weightlifting: { status: "success" as const, results: [] },
        dad: { status: "skipped" as const, results: [] },
      },
    })),
    ...overrides,
  };
}

describe("applyBrowserTextEdit", () => {
  it("keeps characters in order when a post-event rerender resets the caret", async () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    for (const key of "Chappy") {
      applyBrowserTextEdit(input, key);
      input.setSelectionRange(0, 0);
      await Promise.resolve();
    }

    expect(input.value).toBe("Chappy");
    expect(input.selectionStart).toBe(6);
    input.remove();
  });

  it("replaces the browser's current text selection", () => {
    const input = document.createElement("input");
    input.value = "epople";
    document.body.append(input);
    input.focus();
    input.setSelectionRange(1, 4);

    applyBrowserTextEdit(input, "X");

    expect(input.value).toBe("eXle");
    expect(input.selectionStart).toBe(2);
    input.remove();
  });
});

describe("UniversalSearchPalette", () => {
  it("keeps keyboard focus in the search input while results rerender", async () => {
    const user = userEvent.setup();
    const ref = createRef<UniversalSearchPaletteHandle>();
    render(
      <UniversalSearchPaletteContent
        ref={ref}
        open
        onOpenChange={vi.fn()}
        dependencies={dependencies()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Universal Search" });
    expect(dialog).toBeTruthy();
    expect(dialog.className).toContain("top-1/2");
    expect(dialog.className).toContain("[translate:-50%_-50%]");
    expect(dialog.className).toContain("blur(80px)");
    expect(dialog.className).toContain("rgb(235_232_225_/_0.28)");
    expect(dialog.className).not.toContain("-translate-x-1/2");
    const input = screen.getByRole("combobox", { name: "Universal Search" });
    expect(
      document.querySelector("[cmdk-list][data-stacks-scrollable]"),
    ).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(input));

    await user.keyboard("dice");

    expect(input).toHaveProperty("value", "dice");
    expect(document.activeElement).toBe(input);
    act(() => ref.current?.focusInput());
    expect(document.activeElement).toBe(input);
  });

  it("keeps slow typing ordered across delayed provider rerenders", async () => {
    vi.useFakeTimers();
    try {
      render(
        <UniversalSearchPaletteContent
          open
          onOpenChange={vi.fn()}
          dependencies={dependencies()}
        />,
      );
      const input = screen.getByRole("combobox", {
        name: "Universal Search",
      });

      for (const character of "Chappy") {
        fireEvent.keyDown(input, { key: character });
        await act(async () => {
          vi.advanceTimersByTime(140);
          await Promise.resolve();
        });
      }

      expect(input).toHaveProperty("value", "Chappy");
      expect(input).toHaveProperty("selectionStart", 6);
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes backdrop sampling when Scene Diagnostics disables blur", () => {
    universalSearchVisualEffects.setBackdropBlur(false);
    render(
      <UniversalSearchPaletteContent
        open
        onOpenChange={vi.fn()}
        dependencies={dependencies()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Universal Search" });
    const overlay = document.querySelector("[data-universal-search-overlay]");
    expect(dialog.className).toContain("bg-background");
    expect(dialog.className).not.toContain("backdrop-filter");
    expect(overlay?.className).not.toContain("backdrop-blur");
  });

  it("does not dismiss itself when another component requests focus", async () => {
    const onOpenChange = vi.fn();
    render(
      <>
        <button>Scene control</button>
        <UniversalSearchPaletteContent
          open
          onOpenChange={onOpenChange}
          dependencies={dependencies()}
        />
      </>,
    );
    const input = screen.getByRole("combobox", { name: "Universal Search" });
    await waitFor(() => expect(document.activeElement).toBe(input));

    const sceneControl = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Scene control",
    );
    sceneControl?.focus();

    expect(document.activeElement).toBe(sceneControl);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("shows Recent results, promoted destinations, and actions when empty", () => {
    window.localStorage.clear();
    recordRecentResult(
      window.localStorage,
      {
        id: "recent-book",
        kind: "content",
        group: "books",
        label: "A Recent Book",
        href: "https://books.chappyasel.com/a-recent-book",
        matchKind: "exact",
        score: 1_000,
      },
      1,
    );

    render(
      <UniversalSearchPaletteContent
        open
        onOpenChange={vi.fn()}
        dependencies={dependencies()}
      />,
    );

    expect(screen.getByText("A Recent Book")).toBeTruthy();
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Book Notes")).toBeTruthy();
    expect(screen.getByText("Set theme to Dark")).toBeTruthy();
  });

  it("searches hidden static destinations without admitting excluded routes", async () => {
    const user = userEvent.setup();
    render(
      <UniversalSearchPaletteContent
        open
        onOpenChange={vi.fn()}
        dependencies={dependencies()}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Universal Search" });
    await user.type(input, "dice");

    expect(screen.getByText("Liar's Dice")).toBeTruthy();
    expect(screen.queryByText(/golf/i)).toBeNull();
    expect(screen.queryByText(/youtube/i)).toBeNull();
    expect(screen.queryByText(/featured talks/i)).toBeNull();
  });

  it("treats punctuation-only input as empty instead of showing a blank state", async () => {
    const user = userEvent.setup();
    render(
      <UniversalSearchPaletteContent
        open
        onOpenChange={vi.fn()}
        dependencies={dependencies()}
      />,
    );

    await user.type(
      screen.getByRole("combobox", { name: "Universal Search" }),
      "---",
    );

    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Set theme to Dark")).toBeTruthy();
  });

  it("runs actions and closes", async () => {
    const user = userEvent.setup();
    const setTheme = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <UniversalSearchPaletteContent
        open
        onOpenChange={onOpenChange}
        dependencies={dependencies({ setTheme })}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Universal Search" });
    await user.type(input, "dark mode");
    await user.click(screen.getByText("Set theme to Dark"));

    expect(setTheme).toHaveBeenCalledWith("dark");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("records destination selection, navigates, and clears query on close", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const onOpenChange = vi.fn();
    const deps = dependencies({
      navigate,
      location: {
        hostname: "books.chappyasel.com",
        port: "",
        protocol: "https:",
      },
    });
    const view = render(
      <UniversalSearchPaletteContent
        open
        onOpenChange={onOpenChange}
        dependencies={deps}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Universal Search" });
    await user.type(input, "manual");
    await user.click(screen.getByText("Manual"));

    expect(navigate).toHaveBeenCalledWith("https://manual.chappyasel.com/");
    expect(onOpenChange).toHaveBeenCalledWith(false);

    view.rerender(
      <UniversalSearchPaletteContent
        open={false}
        onOpenChange={onOpenChange}
        dependencies={deps}
      />,
    );
    view.rerender(
      <UniversalSearchPaletteContent
        open
        onOpenChange={onOpenChange}
        dependencies={deps}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Universal Search" }),
      ).toHaveProperty("value", ""),
    );
  });

  it("paints static matches before progressively adding provider results", async () => {
    vi.useFakeTimers();
    const asyncBook = {
      id: "book:async",
      kind: "content",
      group: "books",
      label: "Async Book",
      href: "https://books.chappyasel.com/async",
      matchKind: "prefix",
      score: 900,
    } satisfies SearchResult;
    const searchPublic = vi.fn(async () => []);
    const searchServer = vi.fn(async () => ({
      groups: {
        books: { status: "success" as const, results: [asyncBook] },
        weightlifting: { status: "success" as const, results: [] },
        dad: { status: "skipped" as const, results: [] },
      },
    }));

    try {
      render(
        <UniversalSearchPaletteContent
          open
          onOpenChange={vi.fn()}
          dependencies={dependencies({ searchPublic, searchServer })}
        />,
      );
      const input = screen.getByRole("combobox", { name: "Universal Search" });
      fireEvent.change(input, { target: { value: "book" } });

      expect(screen.getByText("Book Notes")).toBeTruthy();
      expect(screen.queryByText("Async Book")).toBeNull();
      expect(searchServer).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(140);
      });
      await act(async () => Promise.resolve());

      expect(screen.getByText("Async Book")).toBeTruthy();
      expect(screen.getByRole("status").textContent).toBe(
        "1 search result loaded",
      );
      expect(searchPublic).toHaveBeenCalledOnce();
      expect(searchServer).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports the actual eligible-provider count for settled zero results", async () => {
    vi.useFakeTimers();
    const analytics = vi.fn();
    try {
      render(
        <UniversalSearchPaletteContent
          open
          onOpenChange={vi.fn()}
          dependencies={dependencies({ capture: analytics })}
        />,
      );
      fireEvent.change(
        screen.getByRole("combobox", { name: "Universal Search" }),
        { target: { value: "zzzzzz" } },
      );

      await act(async () => {
        vi.advanceTimersByTime(140);
        await Promise.resolve();
      });

      expect(analytics).toHaveBeenCalledWith("universal_search_zero_results", {
        eligible_provider_count: 3,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
