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
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OPEN_UNIVERSAL_SEARCH_EVENT,
  UniversalSearchController,
  type UniversalSearchPaletteProps,
  scheduleIdlePalettePreload,
} from "./UniversalSearchController";
import {
  UniversalSearchPaletteContent,
  type UniversalSearchPaletteDependencies,
} from "./UniversalSearchPalette";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function FakePalette({ open, onOpenChange }: UniversalSearchPaletteProps) {
  if (!open) return null;
  return (
    <div role="dialog" aria-label="Universal Search">
      <button onClick={() => onOpenChange(false)}>Close</button>
    </div>
  );
}

function FocusableFakePalette({ open }: UniversalSearchPaletteProps) {
  if (!open) return null;
  return (
    <input aria-label="Universal Search" data-universal-search-material="" />
  );
}

const integrationDependencies: UniversalSearchPaletteDependencies = {
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
};

function IntegratedPalette(props: UniversalSearchPaletteProps) {
  return (
    <UniversalSearchPaletteContent
      {...props}
      dependencies={integrationDependencies}
    />
  );
}

function deferredPalette() {
  let resolve!: (module: {
    UniversalSearchPalette: typeof FakePalette;
  }) => void;
  const promise = new Promise<{ UniversalSearchPalette: typeof FakePalette }>(
    (next) => {
      resolve = next;
    },
  );
  return { load: vi.fn(() => promise), resolve };
}

describe("UniversalSearchController", () => {
  it("does not preload or register open shortcuts while disabled", () => {
    const loadPalette = vi.fn(async () => ({
      UniversalSearchPalette: FakePalette,
    }));
    const schedulePreload = vi.fn(() => () => undefined);

    render(
      <UniversalSearchController
        enabled={false}
        loadPalette={loadPalette}
        schedulePreload={schedulePreload}
      />,
    );

    const shortcut = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(shortcut);
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_UNIVERSAL_SEARCH_EVENT));
    });

    expect(shortcut.defaultPrevented).toBe(false);
    expect(schedulePreload).not.toHaveBeenCalled();
    expect(loadPalette).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the real palette from Command-K and accepts immediate typing", async () => {
    class TestResizeObserver implements ResizeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    Element.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    render(
      <UniversalSearchController
        loadPalette={async () => ({
          UniversalSearchPalette: IntegratedPalette,
        })}
        schedulePreload={() => () => undefined}
      />,
    );

    await user.keyboard("{Meta>}k{/Meta}dice");

    const input = await screen.findByRole("combobox", {
      name: "Universal Search",
    });
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input).toHaveProperty("value", "dice");
  });

  it("opens from Command-K inside an input and loads the palette once", async () => {
    const palette = deferredPalette();
    render(
      <>
        <input aria-label="Existing field" />
        <UniversalSearchController
          loadPalette={palette.load}
          schedulePreload={() => () => undefined}
        />
      </>,
    );
    const field = screen.getByLabelText("Existing field");
    field.focus();

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    field.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(palette.load).toHaveBeenCalledOnce();

    await act(async () =>
      palette.resolve({ UniversalSearchPalette: FakePalette }),
    );
    expect(
      screen.getByRole("dialog", { name: "Universal Search" }),
    ).toBeTruthy();

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(field);
    expect(palette.load).toHaveBeenCalledOnce();
  });

  it("captures Command-K before a page-level document capture listener", async () => {
    const pageCaptureHandler = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener("keydown", pageCaptureHandler, true);

    render(
      <UniversalSearchController
        loadPalette={async () => ({ UniversalSearchPalette: FakePalette })}
        schedulePreload={() => () => undefined}
      />,
    );

    fireEvent.keyDown(document.body, { key: "k", metaKey: true });
    await act(async () => Promise.resolve());
    document.removeEventListener("keydown", pageCaptureHandler, true);

    expect(
      screen.getByRole("dialog", { name: "Universal Search" }),
    ).toBeTruthy();
  });

  it("opens from Control-K and from the imperative event", async () => {
    const palette = deferredPalette();
    render(
      <UniversalSearchController
        loadPalette={palette.load}
        schedulePreload={() => () => undefined}
      />,
    );

    fireEvent.keyDown(document, { key: "K", ctrlKey: true });
    await act(async () =>
      palette.resolve({ UniversalSearchPalette: FakePalette }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_UNIVERSAL_SEARCH_EVENT));
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("does not close again when the opening shortcut key repeats", async () => {
    render(
      <UniversalSearchController
        loadPalette={async () => ({ UniversalSearchPalette: FakePalette })}
        schedulePreload={() => () => undefined}
      />,
    );

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await act(async () => Promise.resolve());
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(document, { key: "k", metaKey: true, repeat: true });

    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("lets focused-input keystrokes complete native propagation", async () => {
    const pageKeyHandler = vi.fn();
    window.addEventListener("keydown", pageKeyHandler);
    render(
      <UniversalSearchController
        loadPalette={async () => ({
          UniversalSearchPalette: FocusableFakePalette,
        })}
        schedulePreload={() => () => undefined}
      />,
    );

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await act(async () => Promise.resolve());
    const input = screen.getByRole("textbox", { name: "Universal Search" });

    const event = new KeyboardEvent("keydown", {
      key: "f",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    // Arc does not reliably dispatch beforeinput when a printable key is cut
    // off with stopImmediatePropagation at the document boundary. Page-wide
    // shortcuts already ignore editable targets/search-open state, so allow
    // the browser's text-input pipeline to finish normally.
    expect(pageKeyHandler).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(false);
    window.removeEventListener("keydown", pageKeyHandler);
  });

  it("releases scene pointer lock before opening", async () => {
    const exitPointerLock = vi.fn();
    Object.defineProperty(document, "pointerLockElement", {
      configurable: true,
      value: document.body,
    });
    Object.defineProperty(document, "exitPointerLock", {
      configurable: true,
      value: exitPointerLock,
    });
    render(
      <UniversalSearchController
        loadPalette={async () => ({ UniversalSearchPalette: FakePalette })}
        schedulePreload={() => () => undefined}
      />,
    );

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await act(async () => Promise.resolve());

    expect(exitPointerLock).toHaveBeenCalledOnce();
    Object.defineProperty(document, "pointerLockElement", {
      configurable: true,
      value: null,
    });
  });

  it("closes with Escape and restores the element focused before opening", async () => {
    // The real Radix palette must run here: focus restoration belongs to
    // its FocusScope teardown, and a controller-side restore would bounce
    // off the still-active trap and strand focus on body. A fake palette
    // without the trap cannot catch that regression.
    class TestResizeObserver implements ResizeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    Element.prototype.scrollIntoView = vi.fn();
    const view = render(
      <>
        <button>Previous focus</button>
        <UniversalSearchController
          loadPalette={async () => ({
            UniversalSearchPalette: IntegratedPalette,
          })}
          schedulePreload={() => () => undefined}
        />
      </>,
    );
    const previous = view.container.querySelector("button")!;
    previous.focus();

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await act(async () => Promise.resolve());
    const input = await screen.findByRole("combobox", {
      name: "Universal Search",
    });
    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => Promise.resolve());

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(previous));
  });

  it("does not keep a stale restore target when closed before the palette loads", async () => {
    class TestResizeObserver implements ResizeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    Element.prototype.scrollIntoView = vi.fn();
    const palette = deferredPalette();
    const view = render(
      <>
        <button>First opener</button>
        <button>Second opener</button>
        <UniversalSearchController
          loadPalette={
            palette.load as unknown as () => Promise<{
              UniversalSearchPalette: typeof IntegratedPalette;
            }>
          }
          schedulePreload={() => () => undefined}
        />
      </>,
    );
    const [first, second] = Array.from(
      view.container.querySelectorAll("button"),
    );
    first!.focus();

    // Open and close again before the lazy chunk resolves: no dialog ever
    // mounted, so the controller must settle focus state itself.
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(document.activeElement).toBe(first);

    await act(async () =>
      palette.resolve({
        UniversalSearchPalette: IntegratedPalette as never,
      }),
    );

    // A later session must restore to its own opener, not the stale one.
    second!.focus();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await act(async () => Promise.resolve());
    const input = await screen.findByRole("combobox", {
      name: "Universal Search",
    });
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => Promise.resolve());
    await waitFor(() => expect(document.activeElement).toBe(second));
  });

  it("lets idle preload reuse the same module load as first open", async () => {
    const palette = deferredPalette();
    let preload: (() => void) | undefined;
    render(
      <UniversalSearchController
        loadPalette={palette.load}
        schedulePreload={(load) => {
          preload = load;
          return () => undefined;
        }}
      />,
    );

    act(() => preload?.());
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(palette.load).toHaveBeenCalledOnce();

    await act(async () =>
      palette.resolve({ UniversalSearchPalette: FakePalette }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("clears the overlay marker, restores focus, and permits retry after a chunk failure", async () => {
    const error = new Error("missing chunk");
    const loadPalette = vi
      .fn<() => Promise<{ UniversalSearchPalette: typeof FakePalette }>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ UniversalSearchPalette: FakePalette });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(
      <>
        <button>Existing focus</button>
        <UniversalSearchController
          loadPalette={loadPalette}
          schedulePreload={() => () => undefined}
        />
      </>,
    );
    const previous = screen.getByRole("button", { name: "Existing focus" });
    previous.focus();

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await act(async () => Promise.resolve());

    expect(
      document.documentElement.getAttribute("data-universal-search-open"),
    ).toBeNull();
    expect(document.activeElement).toBe(previous);

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await act(async () => Promise.resolve());
    expect(loadPalette).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("dialog", { name: "Universal Search" }),
    ).toBeTruthy();
    consoleError.mockRestore();
  });
});

describe("scheduleIdlePalettePreload", () => {
  it("waits for browser idle time and cancels on cleanup", () => {
    const preload = vi.fn();
    const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
      callback({ didTimeout: false, timeRemaining: () => 20 });
      return 7;
    });
    const cancelIdleCallback = vi.fn();

    const cleanup = scheduleIdlePalettePreload(preload, {
      readyState: "complete",
      addLoadListener: vi.fn(),
      removeLoadListener: vi.fn(),
      requestIdleCallback,
      cancelIdleCallback,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    });

    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 3_000,
    });
    expect(preload).toHaveBeenCalledOnce();
    cleanup();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });
});
