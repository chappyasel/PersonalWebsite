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
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { recordRecentResult } from "~/lib/universal-search/recents";
import type { SearchResult } from "~/lib/universal-search/types";
import { universalSearchVisualEffects } from "~/lib/universal-search/visualEffects";

import {
  UniversalSearchPaletteContent,
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

describe("UniversalSearchPalette", () => {
  it("autofocuses a native input and accepts ordinary typing", async () => {
    const user = userEvent.setup();
    render(
      <UniversalSearchPaletteContent
        open
        onOpenChange={vi.fn()}
        dependencies={dependencies()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Universal Search" });
    expect(dialog).toBeTruthy();
    // Top-anchored: the input and results top hold a fixed Y while the
    // panel grows downward through loading states.
    expect(dialog.className).toContain("sm:top-[16vh]");
    expect(dialog.className).toContain("[translate:-50%_0]");
    expect(dialog.className).not.toContain("top-1/2");
    // No data-world marker in jsdom, so this is the flat-page surface:
    // plain frosted, not the scene's heavy placard glass.
    expect(dialog.className).toContain("blur(24px)");
    expect(dialog.className).not.toContain("blur(80px)");
    // Closing must animate out, not vanish: Radix waits for the
    // data-state=closed animation before unmounting.
    expect(dialog.className).toContain("data-[state=closed]:animate-out");
    const input = screen.getByRole("combobox", { name: "Universal Search" });
    expect(
      document.querySelector("[cmdk-list][data-stacks-scrollable]"),
    ).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(input));

    await user.keyboard("dice");

    expect(input).toHaveProperty("value", "dice");
    expect(document.activeElement).toBe(input);
  });

  it("never intercepts the browser's own text editing keys", async () => {
    render(
      <UniversalSearchPaletteContent
        open
        onOpenChange={vi.fn()}
        dependencies={dependencies()}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Universal Search" });
    await waitFor(() => expect(document.activeElement).toBe(input));

    // The previous palette preventDefault-ed every printable key, Backspace,
    // and Delete, then re-implemented the edit by hand — which is exactly what
    // corrupted typing in real browsers. Text keys must reach the browser.
    for (const key of ["a", "Z", "1", " ", "Backspace", "Delete"]) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it("pulls focus back into the dialog when the scene grabs it, without closing", async () => {
    const onOpenChange = vi.fn();
    const view = render(
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

    const sceneControl = view.container.querySelector("button");
    act(() => sceneControl?.focus());

    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("uses the placard glass only over the 3D world", () => {
    document.documentElement.setAttribute("data-world", "ready");
    try {
      render(
        <UniversalSearchPaletteContent
          open
          onOpenChange={vi.fn()}
          dependencies={dependencies()}
        />,
      );
      const dialog = screen.getByRole("dialog", { name: "Universal Search" });
      const overlay = document.querySelector("[data-universal-search-overlay]");
      expect(dialog.className).toContain("blur(80px)");
      expect(overlay?.className).toContain("backdrop-blur-[10px]");
    } finally {
      document.documentElement.removeAttribute("data-world");
    }
  });

  it("removes backdrop sampling when Scene Diagnostics disables blur", () => {
    document.documentElement.setAttribute("data-world", "ready");
    universalSearchVisualEffects.setBackdropBlur(false);
    try {
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
      expect(overlay?.className).not.toContain("backdrop-blur-[10px]");
    } finally {
      document.documentElement.removeAttribute("data-world");
    }
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

  it("opens the keyboard-selected result with Enter", async () => {
    const navigate = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <UniversalSearchPaletteContent
        open
        onOpenChange={onOpenChange}
        dependencies={dependencies({ navigate })}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Universal Search" });
    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.change(input, { target: { value: "manual" } });
    await waitFor(() =>
      expect(
        document.querySelector('[cmdk-item][data-selected="true"]'),
      ).toBeTruthy(),
    );
    fireEvent.keyDown(input, { key: "Enter" });

    expect(navigate).toHaveBeenCalledWith("https://manual.chappyasel.com/");
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
      expect(document.querySelector("[data-search-skeleton]")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(140);
      });
      // Providers are in flight: one anonymous skeleton group, no
      // provider headings for groups that have nothing to show yet.
      expect(document.querySelector("[data-search-skeleton]")).toBeTruthy();
      expect(screen.queryByText("Weightlifting")).toBeNull();
      await act(async () => Promise.resolve());

      // The label renders through the match highlighter, so its text is
      // split across elements; match on the option's accessible name.
      expect(screen.getByRole("option", { name: /Async Book/ })).toBeTruthy();
      expect(screen.getByRole("status").textContent).toBe(
        "1 search result loaded",
      );
      // Settled: the skeleton is gone, groups that ended empty render no
      // heading, and the group with rows keeps its heading.
      expect(document.querySelector("[data-search-skeleton]")).toBeNull();
      expect(screen.getByText("Books")).toBeTruthy();
      expect(screen.queryByText("Weightlifting")).toBeNull();
      expect(screen.queryByText("Public writing")).toBeNull();
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
      expect(screen.getByText("No results for “zzzzzz”")).toBeTruthy();
      expect(document.querySelector("[data-search-skeleton]")).toBeNull();
      expect(screen.queryByText("Books")).toBeNull();
      expect(screen.queryByText("Weightlifting")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
