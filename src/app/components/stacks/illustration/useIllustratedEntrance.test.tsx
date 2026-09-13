// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  ILLUSTRATED_ENTRANCE as P,
  useIllustratedEntrance,
} from "./useIllustratedEntrance";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300"><g data-part="shelf"><path d="M0 100H500"/></g><g data-part="plant"><path d="M10 20L20 40"/></g><g data-part="photo"><rect width="20" height="30"/></g><g data-part="mac"><rect width="40" height="30"/></g></svg>';
let root: { current: HTMLDivElement };
let motion: EventTarget;
let reduced = false;
let hidden = false;
let animations: TestAnimation[];
let decode: ReturnType<typeof vi.fn<() => Promise<void>>>;
class TestAnimation {
  playState = "running";
  resolve!: () => void;
  reject!: (error: Error) => void;
  finished = new Promise<void>((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
  constructor(
    readonly element: Element,
    readonly frames: Keyframe[],
    readonly options: KeyframeAnimationOptions,
  ) {
    animations.push(this);
  }
  finish() {
    this.playState = "finished";
    this.resolve();
  }
  pause() {
    this.playState = "paused";
  }
  play() {
    this.playState = "running";
  }
  cancel() {
    this.playState = "idle";
    this.reject(new Error("cancelled"));
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  animations = [];
  reduced = false;
  hidden = false;
  root = { current: document.createElement("div") };
  root.current.innerHTML =
    '<div data-illustration-positioned><div data-illustration-selected><div class="room-illustration-stage" style="transform: translate(10px, 20px) scale(0.78)"><img data-illustration-image src="/images/stacks/boot/projects/light-desktop.svg"></div></div></div>';
  document.body.append(root.current);
  motion = new EventTarget();
  Object.defineProperty(motion, "matches", { get: () => reduced });
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.stubGlobal("matchMedia", () => motion);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, text: async () => SVG }),
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
  decode = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: decode,
  });
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: function (
      this: Element,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      return new TestAnimation(this, frames, options);
    },
  });
});
afterEach(() => {
  cleanup();
  root.current.remove();
  document.querySelector(".room-entry-wordmark")?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function prepare() {
  await act(async () => {
    await Promise.resolve();
  });
}
async function finishAll() {
  await act(async () => {
    animations
      .filter((animation) => animation.playState === "running")
      .forEach((animation) => animation.finish());
  });
}

it("assembles separate items, waits for their actual finish, then places the shelf", async () => {
  const view = renderHook(() =>
    useIllustratedEntrance(true, root, "projects:light"),
  );
  expect(view.result.current).toBe("shelf");
  await prepare();
  expect(view.result.current).toBe("items");
  expect(
    animations.map((animation) => animation.element.getAttribute("data-part")),
  ).toEqual(["plant", "photo", "mac"]);
  expect(animations.map((animation) => animation.options.delay)).toEqual([
    P.emptyMs,
    P.emptyMs + P.itemStepMs,
    P.emptyMs + 2 * P.itemStepMs,
  ]);
  expect(root.current.querySelectorAll(".room-entrance-artwork")).toHaveLength(
    1,
  );
  await act(async () => animations[0]!.finish());
  expect(view.result.current).toBe("items");
  await finishAll();
  expect(view.result.current).toBe("placing");
  expect(animations.at(-1)!.frames.at(-1)).toEqual({ transform: "none" });
  expect(animations.at(-1)!.element.className).toBe("room-illustration-stage");
  await finishAll();
  expect(view.result.current).toBe("complete");
  expect(root.current.querySelector(".room-entrance-artwork")).toBeNull();
  expect(root.current.querySelector("[data-entrance-artwork]")).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

it("holds the name through every item and waits for its corner arrival before handoff", async () => {
  const name = document.createElement("span");
  name.className = "room-entry-wordmark";
  name.style.transform = "translate(300px, 200px) scale(1.8)";
  document.body.append(name);
  const view = renderHook(() => useIllustratedEntrance(true, root, "projects"));
  await prepare();
  await act(async () => animations[0]!.finish());
  expect(animations.some((animation) => animation.element === name)).toBe(
    false,
  );
  await finishAll();
  expect(view.result.current).toBe("placing");
  const nameArrival = animations.find(
    (animation) => animation.element === name,
  )!;
  expect(nameArrival.options.duration).toBe(P.nameMs);
  expect(nameArrival.frames).toEqual([
    { transform: name.style.transform },
    { transform: "none" },
  ]);
  const placement = animations.at(-1)!;
  expect(placement.element.className).toBe("room-illustration-stage");
  await act(async () => placement.finish());
  expect(view.result.current).toBe("placing");
  await act(async () => nameArrival.finish());
  expect(view.result.current).toBe("complete");
  expect(animations.every((animation) => animation.playState === "idle")).toBe(
    true,
  );
});

it("waits for initial URL positioning before borrowing the selected shelf", async () => {
  root.current.firstElementChild!.removeAttribute(
    "data-illustration-positioned",
  );
  const view = renderHook(() => useIllustratedEntrance(true, root, "projects"));
  await prepare();
  expect(view.result.current).toBe("shelf");
  expect(fetch).not.toHaveBeenCalled();
  root.current.firstElementChild!.setAttribute(
    "data-illustration-positioned",
    "",
  );
  await act(async () => vi.advanceTimersByTime(16));
  expect(view.result.current).toBe("items");
});

it.each(["pointerdown", "touchstart", "wheel", "keydown", "resize"])(
  "settles immediately on %s during placement without consuming input",
  async (type) => {
    const view = renderHook(() =>
      useIllustratedEntrance(true, root, "projects"),
    );
    await prepare();
    await finishAll();
    expect(view.result.current).toBe("placing");
    const event = new Event(type, { bubbles: true, cancelable: true });
    await act(async () => fireEvent(window, event));
    expect(view.result.current).toBe("complete");
    expect(event.defaultPrevented).toBe(false);
    expect(
      animations.every((animation) => animation.playState === "idle"),
    ).toBe(true);
    expect(root.current.querySelector(".room-entrance-artwork")).toBeNull();
  },
);

it("releases the reader after stalled preparation and rejects its eventual stale result", async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = renderHook(() => useIllustratedEntrance(true, root, "projects"));
  await prepare();
  await act(async () => vi.advanceTimersByTime(P.assetWaitMs));
  expect(view.result.current).toBe("complete");
  await act(async () =>
    resolve({ ok: true, text: async () => SVG } as Response),
  );
  expect(animations).toHaveLength(0);
  expect(root.current.querySelector(".room-entrance-artwork")).toBeNull();
});

it("skips a failed image without blocking the reader", async () => {
  decode.mockRejectedValue(new Error("decode failed"));
  const view = renderHook(() => useIllustratedEntrance(true, root, "projects"));
  await prepare();
  expect(view.result.current).toBe("complete");
  expect(fetch).not.toHaveBeenCalled();
});

it("waits for embedded photo decoding before starting the inline item timeline", async () => {
  let decoded!: () => void;
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    text: async () =>
      SVG.replace(
        '<rect width="20" height="30"/>',
        '<image href="data:image/png;base64,photo"/>',
      ),
  } as Response);
  decode.mockResolvedValueOnce(undefined).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        decoded = resolve;
      }),
  );
  const view = renderHook(() => useIllustratedEntrance(true, root, "projects"));
  await prepare();
  expect(view.result.current).toBe("shelf");
  expect(animations).toHaveLength(0);
  expect(root.current.querySelector(".room-entrance-artwork")).toBeNull();
  await act(async () => decoded());
  expect(view.result.current).toBe("items");
});

it("settles a changed shelf/theme and does not replay on retry or resident return", async () => {
  const view = renderHook(
    ({ enabled, identity }) => useIllustratedEntrance(enabled, root, identity),
    { initialProps: { enabled: true, identity: "projects:light" } },
  );
  await prepare();
  view.rerender({ enabled: true, identity: "books:dark" });
  expect(view.result.current).toBe("complete");
  view.rerender({ enabled: false, identity: "books:dark" });
  view.rerender({ enabled: true, identity: "books:dark" });
  await prepare();
  expect(view.result.current).toBe("complete");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("pauses visible motion while hidden and resumes without restarting finished items", async () => {
  renderHook(() => useIllustratedEntrance(true, root, "projects"));
  await prepare();
  await act(async () => animations[0]!.finish());
  act(() => {
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(animations.map((animation) => animation.playState)).toEqual([
    "finished",
    "paused",
    "paused",
  ]);
  act(() => {
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(animations.map((animation) => animation.playState)).toEqual([
    "finished",
    "running",
    "running",
  ]);
});

it("skips reduced motion and explicit live promotion, and reacts to a changed preference", async () => {
  reduced = true;
  const first = renderHook(() =>
    useIllustratedEntrance(true, root, "projects"),
  );
  expect(first.result.current).toBe("complete");
  first.unmount();
  reduced = false;
  const second = renderHook(
    ({ skip }) => useIllustratedEntrance(true, root, "projects", skip),
    { initialProps: { skip: false } },
  );
  await prepare();
  act(() => {
    reduced = true;
    motion.dispatchEvent(new Event("change"));
  });
  expect(second.result.current).toBe("complete");
  second.unmount();
  reduced = false;
  const third = renderHook(() =>
    useIllustratedEntrance(true, root, "projects", true),
  );
  expect(third.result.current).toBe("complete");
});

it("survives Strict Mode pre-start cleanup and removes all work on unmount", async () => {
  const view = renderHook(
    () => useIllustratedEntrance(true, root, "projects"),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StrictMode>{children}</StrictMode>
      ),
    },
  );
  await prepare();
  expect(view.result.current).toBe("items");
  expect(root.current.querySelectorAll(".room-entrance-artwork")).toHaveLength(
    1,
  );
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(root.current.querySelector(".room-entrance-artwork")).toBeNull();
});

it("orders About by its visible rows rather than its old cadence, without fetching another drawing", async () => {
  root.current.querySelector(".room-illustration-stage")!.innerHTML =
    '<svg class="stacks-boot-scene"><g class="stacks-boot-landmarks"><g data-cadence-slot="1"><g class="stacks-boot-item-motion"/></g><g data-cadence-slot="0"><g class="stacks-boot-item-motion"/></g></g></svg>';
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const left = this.parentElement?.dataset.cadenceSlot === "1" ? 10 : 90;
      return {
        x: left,
        y: 0,
        left,
        top: 0,
        right: left + 30,
        bottom: 40,
        width: 30,
        height: 40,
        toJSON: () => ({}),
      };
    },
  );
  const view = renderHook(() => useIllustratedEntrance(true, root, "about"));
  await prepare();
  expect(view.result.current).toBe("items");
  expect(fetch).not.toHaveBeenCalled();
  expect(
    animations.map((animation) =>
      animation.element.parentElement?.getAttribute("data-cadence-slot"),
    ),
  ).toEqual(["1", "0"]);
});

it("reveals rows left to right despite different object heights and reversed SVG paint order", async () => {
  const boxes: Record<string, [number, number, number, number]> = {
    plant: [10, 70, 40, 30],
    photo: [220, 10, 80, 90],
    mac: [10, 200, 100, 100],
  };
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    text: async () =>
      '<svg xmlns="http://www.w3.org/2000/svg"><g data-part="shelf"/><g data-part="mac"/><g data-part="photo"/><g data-part="plant"/></svg>',
  } as Response);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const [x, y, width, height] = boxes[
        this.getAttribute("data-part") ?? ""
      ] ?? [0, 0, 0, 0];
      return {
        x,
        y,
        left: x,
        top: y,
        right: x + width,
        bottom: y + height,
        width,
        height,
        toJSON: () => ({}),
      };
    },
  );
  renderHook(() => useIllustratedEntrance(true, root, "talks"));
  await prepare();
  expect(animations.map((a) => a.element.getAttribute("data-part"))).toEqual([
    "plant",
    "photo",
    "mac",
  ]);
  expect(
    [...root.current.querySelectorAll(".room-entrance-item")].map((item) =>
      item.getAttribute("data-part"),
    ),
  ).toEqual(["mac", "photo", "plant"]);
});
