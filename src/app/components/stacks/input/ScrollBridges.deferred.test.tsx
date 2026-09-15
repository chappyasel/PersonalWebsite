// @vitest-environment jsdom
//
// The deferred-settle contract: a coarse gesture interrupted by the search
// palette is paused, not cancelled.
//
// Dismissing the palette without choosing anything restores the stop that
// gesture had earned. Choosing anything at all — a result, a destination, a
// command action — discards it, because the visitor has said where they want
// to be and a snap afterwards would take it away from them.
//
// Selection is announced on its own channel BEFORE the palette closes, so none
// of this depends on the order in which a MutationObserver happens to run.
// Both deliveries are exercised: the synchronous selection notification, and
// the queued root-attribute observer.
import { scrollOffsetForUnit } from "../scene/worldLayout";
import { useStacks } from "../store";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  UNIVERSAL_SEARCH_OPEN_ATTRIBUTE,
  notifyUniversalSearchSelection,
} from "~/lib/universal-search/overlay";

import { COARSE_TRAVEL_QUIET_MS } from "./coarseTravelOwnership";
import { navigateRoom } from "./RoomNavigation";
import ScrollBridges from "./ScrollBridges";

const RANGE = 2340;
const stopPx = (unit: number) => scrollOffsetForUnit(unit) * RANGE;
const BOOKS = stopPx(1);

let element: HTMLDivElement;
/** Every accepted write to scrollLeft, in order. A clamp is a WRITE; watching
 * travelTo alone cannot see one, which is how the first D6 passed over it. */
let writes: number[] = [];
let travelTo: ReturnType<typeof vi.fn>;
let pendingScrollEvents: HTMLElement[] = [];
const flushScroll = () => {
  const queued = pendingScrollEvents;
  pendingScrollEvents = [];
  for (const node of queued) node.dispatchEvent(new Event("scroll"));
};

function makeScrollElement() {
  const node = document.createElement("div");
  let value = 0;
  Object.defineProperty(node, "scrollWidth", { value: RANGE + 390 });
  Object.defineProperty(node, "clientWidth", { value: 390 });
  Object.defineProperty(node, "scrollLeft", {
    get: () => value,
    set: (next: number) => {
      const rounded = Math.round(Math.min(RANGE, Math.max(0, next)));
      if (rounded === value) return;
      value = rounded;
      writes.push(rounded);
      pendingScrollEvents.push(node);
    },
    configurable: true,
  });
  return node;
}

const pointer = (type: string, pointerId: number) => {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  Object.defineProperty(event, "button", { value: 0 });
  return event;
};
const press = (id = 1) => element.dispatchEvent(pointer("pointerdown", id));
const seed = (to: number) => {
  element.scrollLeft = to;
  flushScroll();
};
const scrollTo = (to: number) => {
  element.scrollLeft = to;
  flushScroll();
};
const scrollEnd = () => element.dispatchEvent(new Event("scrollend"));

/** The palette's real markers. Opening and closing are attribute writes; the
 * observer that reads them is queued, so tests must await a microtask. */
const openPalette = () =>
  document.documentElement.setAttribute(UNIVERSAL_SEARCH_OPEN_ATTRIBUTE, "");
const closePalette = () =>
  document.documentElement.removeAttribute(UNIVERSAL_SEARCH_OPEN_ATTRIBUTE);

const settleObserver = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  pendingScrollEvents = [];
  writes = [];
  element = makeScrollElement();
  document.body.append(element);
  travelTo = vi.fn();
  window.history.replaceState(null, "", "/");
  useStacks.setState({
    scrollEl: element,
    travelTo: travelTo as unknown as (unit: number) => void,
    jumpTo: null,
    dragging: null,
    modalOpen: false,
    panelState: "closed",
    visionRidePhase: "idle",
    activeUnit: 1,
    golfFocused: false,
  });
  render(<ScrollBridges />);
});

afterEach(() => {
  cleanup();
  element.remove();
  closePalette();
  useStacks.setState({ scrollEl: null, travelTo: null });
  vi.useRealTimers();
});

/** A gesture heading back toward About, interrupted by the palette. */
const interruptedGesture = () => {
  seed(BOOKS);
  press();
  scrollTo(40); // clamped toward About; this gesture has earned that stop
  openPalette();
  scrollEnd();
  act(() => void vi.advanceTimersByTime(COARSE_TRAVEL_QUIET_MS + 20));
};

describe("deferred settle across the search palette", () => {
  it("D6 writes nothing to the container while the palette is open", async () => {
    // The real shape: a genuine swipe, the palette opens mid-flight, and the
    // browser's own momentum keeps delivering scrolls afterwards. Ownership is
    // still live at that point — scrollend has not fired — so the clamp is
    // still armed, and clamping now drags the room while the visitor is
    // reading the palette. Watching travelTo cannot see it: the write goes
    // straight to scrollLeft.
    seed(BOOKS);
    press();
    scrollTo(300); // genuine, attributable motion
    openPalette();
    await settleObserver();
    const before = writes.length;
    scrollTo(0); // residual momentum, palette open, no scrollend yet

    expect(writes.slice(before)).toEqual([0]);
    expect(element.scrollLeft).toBe(0);
    expect(travelTo).not.toHaveBeenCalled();
  });

  it("D6b waits for real stillness before restoring, not for the dismissal", async () => {
    // Momentum outlives the palette. A dismissal that restores instantly is
    // writing into a container that is still moving, and the visitor sees the
    // room fight the tail of their own swipe.
    seed(BOOKS);
    press();
    scrollTo(300);
    openPalette();
    await settleObserver();
    scrollEnd();
    act(() => void vi.advanceTimersByTime(COARSE_TRAVEL_QUIET_MS + 20));
    // Residual motion arrives while the palette is still up, then the visitor
    // dismisses immediately.
    act(() => void vi.advanceTimersByTime(80));
    scrollTo(0);
    closePalette();
    await settleObserver();

    expect(travelTo).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(COARSE_TRAVEL_QUIET_MS + 20));
    expect(travelTo).toHaveBeenCalledTimes(1);
  });

  it("D1 restores the authored stop when the palette is dismissed unused", async () => {
    interruptedGesture();
    closePalette();
    await settleObserver();

    expect(travelTo).toHaveBeenCalledTimes(1);
    expect(travelTo.mock.calls.at(-1)?.[0]).toBe(0);
  });

  it("D2 does not snap after a selection whose destination navigates", async () => {
    interruptedGesture();
    // The palette announces the choice BEFORE it closes.
    act(() => void notifyUniversalSearchSelection());
    closePalette();
    await settleObserver();
    act(() => void vi.advanceTimersByTime(1000));

    expect(travelTo).not.toHaveBeenCalled();
  });

  it("D2b does not snap after a command action, which never navigates at all", async () => {
    interruptedGesture();
    // An action closes the palette without a destination, so no navigation
    // takeover is raised anywhere — the selection signal is the only evidence.
    act(() => void notifyUniversalSearchSelection());
    closePalette();
    await settleObserver();
    act(() => void vi.advanceTimersByTime(1000));

    expect(travelTo).not.toHaveBeenCalled();
  });

  it("D3 does not snap after an explicit navigation while the palette is open", async () => {
    interruptedGesture();
    act(() => {
      navigateRoom(6); // an explicit destination, outside Search's own signal
    });
    closePalette();
    await settleObserver();
    act(() => void vi.advanceTimersByTime(1000));

    expect(travelTo.mock.calls.every(([unit]) => unit !== 0)).toBe(true);
  });

  it("D4 drops a deferred restoration when a new gesture takes the room", async () => {
    interruptedGesture();
    press(2); // a fresh contact owns the container now
    closePalette();
    await settleObserver();
    act(() => void vi.advanceTimersByTime(1000));

    expect(travelTo).not.toHaveBeenCalled();
  });

  it("D5 writes nothing after unmount with a restoration pending", async () => {
    interruptedGesture();
    cleanup();
    travelTo.mockClear();
    closePalette();
    await settleObserver();
    act(() => void vi.advanceTimersByTime(1000));

    expect(travelTo).not.toHaveBeenCalled();
  });

  it("D7 drops a record superseded by a new palette session", async () => {
    // Close and reopen fast enough and the observer has not run once: both
    // attribute writes are waiting in the same queue. Whatever the first close
    // would have restored belongs to a session the visitor has already left,
    // and the second close must not act on it. Waiting for the first close to
    // settle first tests duplicate consumption instead, which is a different
    // and easier thing.
    interruptedGesture();
    closePalette();
    openPalette(); // BEFORE the observer sees either write
    await settleObserver();
    closePalette();
    await settleObserver();
    act(() => void vi.advanceTimersByTime(1000));

    expect(travelTo).not.toHaveBeenCalled();
  });

  it("D7b settles once when a reopened palette is dismissed after the first close settled", async () => {
    interruptedGesture();
    closePalette();
    await settleObserver();
    openPalette();
    await settleObserver();
    closePalette();
    await settleObserver();
    act(() => void vi.advanceTimersByTime(1000));

    expect(travelTo).toHaveBeenCalledTimes(1);
  });

  it("D9 restores when the opening is delivered only after the gesture ended", async () => {
    // scrollend can beat the observer. The record is then saved while the
    // palette's own opening is still queued, and a session counted at
    // delivery time throws away a legitimate record the moment that opening
    // finally arrives.
    seed(BOOKS);
    press();
    scrollTo(40);
    openPalette();
    scrollEnd(); // BEFORE the opening is ever delivered
    act(() => void vi.advanceTimersByTime(COARSE_TRAVEL_QUIET_MS + 20));
    await settleObserver(); // the opening lands on its own, alone
    act(() => void vi.advanceTimersByTime(120));
    closePalette();
    await settleObserver();
    act(() => void vi.advanceTimersByTime(COARSE_TRAVEL_QUIET_MS + 20));

    expect(travelTo).toHaveBeenCalledTimes(1);
    expect(travelTo.mock.calls.at(-1)?.[0]).toBe(0);
  });

  it("D10 drops a record when a whole reopen round trip arrives in one batch", async () => {
    // close, reopen and close again before the observer runs once: the batch
    // ends closed, so live state alone cannot see the reopen in the middle.
    interruptedGesture();
    await settleObserver(); // the opening is delivered first
    closePalette();
    openPalette();
    closePalette();
    await settleObserver(); // one batch, three records
    act(() => void vi.advanceTimersByTime(1000));

    expect(travelTo).not.toHaveBeenCalled();
  });

  it("D11 waits for motion that arrives after the dismissal", async () => {
    interruptedGesture();
    await settleObserver();
    act(() => void vi.advanceTimersByTime(80));
    scrollTo(0); // residual while open
    closePalette();
    await settleObserver(); // restoration now scheduled for the remaining 100
    act(() => void vi.advanceTimersByTime(90));
    scrollTo(40); // genuine motion, palette CLOSED and nobody owns the room
    act(() => void vi.advanceTimersByTime(20)); // the old deadline passes

    expect(travelTo).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(COARSE_TRAVEL_QUIET_MS));
    expect(travelTo).toHaveBeenCalledTimes(1);
  });

  it("D8 leaves nothing pending when the palette opens with no gesture in flight", async () => {
    seed(BOOKS);
    openPalette();
    await settleObserver();
    closePalette();
    await settleObserver();
    act(() => void vi.advanceTimersByTime(1000));

    expect(travelTo).not.toHaveBeenCalled();
  });
});
