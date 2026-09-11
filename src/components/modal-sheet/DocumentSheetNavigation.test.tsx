// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import DocumentSheetNavigation from "./DocumentSheetNavigation";
import { InModalSheetContext } from "./ModalSheet";
import SheetLink from "./SheetLink";
import { originZoomGeometry } from "~/app/components/route-transition-prototype/originZoom";
import { useRouteTransitionPrototype } from "~/app/components/route-transition-prototype/store";

const { replace, ordinary } = vi.hoisted(() => ({
  replace: vi.fn(),
  ordinary: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("next/link", () => ({
  default: ({
    onNavigate,
    prefetch: _prefetch,
    replace: _replace,
    ...props
  }: ComponentProps<"a"> & {
    onNavigate?: (event: { preventDefault: () => void }) => void;
    prefetch?: boolean;
    replace?: boolean;
  }) => (
    <a
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        event.preventDefault();
        let prevented = false;
        onNavigate?.({
          preventDefault: () => {
            prevented = true;
          },
        });
        if (!prevented) ordinary(props.href);
      }}
    />
  ),
}));

const frame = { left: 80, top: 60, width: 800, height: 600 };
const link = { left: 200, top: 300, width: 120, height: 24 };
const geometry = originZoomGeometry(
  { ...link, left: link.left - frame.left, top: link.top - frame.top },
  frame.width,
  frame.height,
);
let finish!: () => void;
function Sheet({ path = "/systems" }: { path?: string }) {
  return (
    <DocumentSheetNavigation documentPath={path}>
      <InModalSheetContext.Provider value={true}>
        <div data-modal-scroller>
          <p>{path}</p>
          <SheetLink href="/manual">Manual</SheetLink>
        </div>
      </InModalSheetContext.Provider>
    </DocumentSheetNavigation>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useRouteTransitionPrototype.setState({ enabled: true });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return (
        this.hasAttribute("data-modal-scroller") ? frame : link
      ) as DOMRect;
    },
  );
  document.startViewTransition = vi.fn((update: () => Promise<void>) => {
    const done = Promise.resolve().then(update);
    const ended = new Promise<void>((resolve) => {
      finish = resolve;
    });
    return {
      ready: done,
      updateCallbackDone: done,
      finished: done.then(() => ended),
      skipTransition: () => finish(),
    } as ViewTransition;
  }) as typeof document.startViewTransition;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "startViewTransition");
});

it("opens from the clicked link inside the same reading area and waits for its new document", async () => {
  const view = render(<Sheet />);
  const scroller = view.container.querySelector<HTMLElement>(
    "[data-modal-scroller]",
  )!;
  let ready = false;
  await act(async () => fireEvent.click(screen.getByText("Manual")));
  expect(replace).toHaveBeenCalledExactlyOnceWith("/manual");
  expect(ordinary).not.toHaveBeenCalled();
  expect(scroller.style.viewTransitionName).toBe("sheet-document");
  expect(
    document.documentElement.style.getPropertyValue("--sheet-origin-clip"),
  ).toBe(geometry.clip);
  expect(
    document.documentElement.style.getPropertyValue("--sheet-origin-zoom"),
  ).toBe(geometry.zoom);
  const transition = vi.spyOn(document, "startViewTransition").mock.results[0]!
    .value as ViewTransition;
  void transition.ready.then(() => {
    ready = true;
  });
  expect(ready).toBe(false);
  expect(screen.getByText("/systems")).toBeDefined();
  await act(async () => view.rerender(<Sheet path="/manual" />));
  expect(ready).toBe(true);
  expect(view.container.querySelector("[data-modal-scroller]")).toBe(scroller);
  await act(async () => finish());
  expect(document.documentElement.dataset.sheetNavigation).toBeUndefined();
  expect(
    document.documentElement.style.getPropertyValue("--sheet-origin-clip"),
  ).toBe("");
});

it.each(["disabled", "reduced"])(
  "keeps %s navigation free of capture and geometry work",
  async (mode) => {
    if (mode === "disabled")
      useRouteTransitionPrototype.setState({ enabled: false });
    else
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
      }));
    render(<Sheet />);
    await act(async () => fireEvent.click(screen.getByText("Manual")));
    expect(ordinary).toHaveBeenCalledWith("/manual");
    expect(replace).not.toHaveBeenCalled();
    expect(vi.spyOn(document, "startViewTransition")).not.toHaveBeenCalled();
    expect(
      vi.spyOn(Element.prototype, "getBoundingClientRect"),
    ).not.toHaveBeenCalled();
  },
);

it("uses the same source clip after commit without native snapshots", async () => {
  Reflect.deleteProperty(document, "startViewTransition");
  const view = render(<Sheet />);
  const scroller = view.container.querySelector<HTMLElement>(
    "[data-modal-scroller]",
  )!;
  const cancel = vi.fn();
  scroller.animate = vi.fn(() => ({
    finished: Promise.resolve(),
    cancel,
  })) as unknown as typeof scroller.animate;
  await act(async () => fireEvent.click(screen.getByText("Manual")));
  expect(vi.spyOn(scroller, "animate")).not.toHaveBeenCalled();
  await act(async () => view.rerender(<Sheet path="/manual" />));
  expect(vi.spyOn(scroller, "animate")).toHaveBeenCalledWith(
    expect.arrayContaining([
      { clipPath: geometry.clip, opacity: 0, offset: 0 },
    ]),
    expect.objectContaining({ duration: 620 }),
  );
  expect(cancel).toHaveBeenCalledOnce();
});

it.each(["disable", "unmount"])(
  "releases a held capture on %s without issuing navigation twice",
  async (action) => {
    let update!: () => Promise<void>;
    let resolve!: () => void;
    const done = new Promise<void>((ready) => {
      resolve = ready;
    });
    document.startViewTransition = vi.fn((callback: () => Promise<void>) => {
      update = async () => {
        await callback();
        resolve();
      };
      return {
        ready: done,
        finished: done,
        updateCallbackDone: done,
        skipTransition: vi.fn(),
      } as unknown as ViewTransition;
    }) as typeof document.startViewTransition;
    const view = render(<Sheet />);
    await act(async () => fireEvent.click(screen.getByText("Manual")));
    expect(replace).not.toHaveBeenCalled();
    act(() => {
      if (action === "disable")
        useRouteTransitionPrototype.setState({ enabled: false });
      else view.unmount();
    });
    await act(async () => update());
    expect(replace).toHaveBeenCalledTimes(action === "disable" ? 1 : 0);
    expect(document.documentElement.dataset.sheetNavigation).toBeUndefined();
  },
);
