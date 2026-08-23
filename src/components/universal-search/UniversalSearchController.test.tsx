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
import { forwardRef, useImperativeHandle, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OPEN_UNIVERSAL_SEARCH_EVENT,
  UniversalSearchController,
  type UniversalSearchPaletteHandle,
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

const FakePalette = forwardRef<
  UniversalSearchPaletteHandle,
  UniversalSearchPaletteProps
>(function FakePalette({ open, onOpenChange }, ref) {
  useImperativeHandle(ref, () => ({ focusInput: vi.fn() }), []);
  if (!open) return null;
  return (
    <div role="dialog" aria-label="Universal Search">
      <button onClick={() => onOpenChange(false)}>Close</button>
    </div>
  );
});

const FocusableFakePalette = forwardRef<
  UniversalSearchPaletteHandle,
  UniversalSearchPaletteProps
>(function FocusableFakePalette({ open }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({
    focusInput: () => inputRef.current?.focus(),
  }));
  if (!open) return null;
  return (
    <input
      ref={inputRef}
      aria-label="Universal Search"
      data-universal-search-material=""
    />
  );
});

/** Shaped like the real palette: the panel, cmdk's root and cmdk's list all
 * carry `tabindex="-1"`, so a click anywhere but the input focuses a div. */
const ChromedFakePalette = forwardRef<
  UniversalSearchPaletteHandle,
  UniversalSearchPaletteProps
>(function ChromedFakePalette({ open }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({
    focusInput: () => inputRef.current?.focus(),
  }));
  if (!open) return null;
  return (
    <div data-universal-search-material="" tabIndex={-1}>
      <div data-testid="cmdk-root" tabIndex={-1}>
        <input ref={inputRef} aria-label="Universal Search" />
        <div data-testid="cmdk-list" tabIndex={-1}>
          <div data-testid="row" role="option" aria-selected={false}>
            Books
          </div>
        </div>
        <button>Clear recents</button>
      </div>
    </div>
  );
});

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

const IntegratedPalette = forwardRef<
  UniversalSearchPaletteHandle,
  UniversalSearchPaletteProps
>(function IntegratedPalette(props, ref) {
  return (
    <UniversalSearchPaletteContent
      {...props}
      ref={ref}
      dependencies={integrationDependencies}
    />
  );
});

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
        loadPalette={async () => ({ UniversalSearchPalette: IntegratedPalette })}
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

  it("reclaims input focus after a deferred scene focus job", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(
      <>
        <button>Scene control</button>
        <UniversalSearchController
          loadPalette={async () => ({
            UniversalSearchPalette: FocusableFakePalette,
          })}
          schedulePreload={() => () => undefined}
        />
      </>,
    );
    const sceneControl = screen.getByRole("button", { name: "Scene control" });
    requestAnimationFrame(() => sceneControl.focus());

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await act(async () => Promise.resolve());
    const input = screen.getByRole("textbox", { name: "Universal Search" });
    expect(document.activeElement).toBe(input);

    act(() => {
      for (const callback of frames.splice(0)) callback(0);
    });

    expect(document.activeElement).toBe(input);
  });

  it("reclaims input focus when a scene control focuses itself later", async () => {
    render(
      <>
        <button>Scene control</button>
        <UniversalSearchController
          loadPalette={async () => ({
            UniversalSearchPalette: FocusableFakePalette,
          })}
          schedulePreload={() => () => undefined}
        />
      </>,
    );

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await act(async () => Promise.resolve());
    const input = screen.getByRole("textbox", { name: "Universal Search" });
    const sceneControl = screen.getByRole("button", { name: "Scene control" });
    expect(document.activeElement).toBe(input);

    sceneControl.focus();
    await act(async () => Promise.resolve());

    expect(document.activeElement).toBe(input);
  });

  it("reclaims focus before a page focus trap can swallow focusin", async () => {
    const pageFocusTrap = (event: FocusEvent) => {
      if ((event.target as Element | null)?.matches("button")) {
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener("focusin", pageFocusTrap, true);

    render(
      <>
        <button>Scene control</button>
        <UniversalSearchController
          loadPalette={async () => ({
            UniversalSearchPalette: FocusableFakePalette,
          })}
          schedulePreload={() => () => undefined}
        />
      </>,
    );

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await act(async () => Promise.resolve());
    const input = screen.getByRole("textbox", { name: "Universal Search" });

    screen.getByRole("button", { name: "Scene control" }).focus();
    document.removeEventListener("focusin", pageFocusTrap, true);

    expect(document.activeElement).toBe(input);
  });

  it("returns focus to the input when a click lands on palette chrome", async () => {
    render(
      <UniversalSearchController
        loadPalette={async () => ({
          UniversalSearchPalette: ChromedFakePalette,
        })}
        schedulePreload={() => () => undefined}
      />,
    );

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await act(async () => Promise.resolve());
    const input = screen.getByRole("textbox", { name: "Universal Search" });
    expect(document.activeElement).toBe(input);

    // A click on the magnifier, a group heading, the ESC chip, the footer hint
    // or any gap between rows lands on one of these wrappers.
    for (const testId of ["cmdk-root", "cmdk-list"]) {
      act(() => screen.getByTestId(testId).focus());
      await act(async () => Promise.resolve());
      expect(document.activeElement).toBe(input);
    }
  });

  it("leaves focus on a real control the visitor moved to inside the palette", async () => {
    render(
      <UniversalSearchController
        loadPalette={async () => ({
          UniversalSearchPalette: ChromedFakePalette,
        })}
        schedulePreload={() => () => undefined}
      />,
    );

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await act(async () => Promise.resolve());
    const button = screen.getByRole("button", { name: "Clear recents" });

    act(() => button.focus());
    await act(async () => Promise.resolve());

    expect(document.activeElement).toBe(button);
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
    render(
      <>
        <button>Previous focus</button>
        <UniversalSearchController
          loadPalette={async () => ({ UniversalSearchPalette: FakePalette })}
          schedulePreload={() => () => undefined}
        />
      </>,
    );
    const previous = screen.getByRole("button", { name: "Previous focus" });
    previous.focus();

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await act(async () => Promise.resolve());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(previous);
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
