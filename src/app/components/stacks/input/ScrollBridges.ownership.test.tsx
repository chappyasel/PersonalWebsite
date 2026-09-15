// @vitest-environment jsdom
//
// The four contract counterexamples asset-memory-codex derived by executing
// the real module, as listener-level regressions.
//
// Each one failed against the first attempt at this fix, and each failed for a
// reason a helper-input test cannot see:
//   R1 the clamp pins the position, so two ends at the same value certified a
//      quiet that never happened and ownership was released mid-momentum;
//   R2 an explicit keyboard jump wrote Talks and the still-armed clamp pulled
//      it back to Systems, because revocation only existed at settle time;
//   R3 the same with the search palette, where the takeover flag is gone again
//      by the time a late settle looks for it;
//   R4 a predecessor's pointerup released its successor's gesture, because
//      ownership was a boolean rather than a contact.
import { scrollOffsetForUnit } from "../scene/worldLayout";
import { useStacks } from "../store";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COARSE_TRAVEL_QUIET_MS } from "./coarseTravelOwnership";
import RoomNavigation, { navigateRoom } from "./RoomNavigation";
import ScrollBridges from "./ScrollBridges";

/** The room on a 390px phone: 7 pages of 390 gives a 2340px range. */
const RANGE = 2340;
const stopPx = (unit: number) => scrollOffsetForUnit(unit) * RANGE;
const ABOUT = stopPx(0); // ~101.739 — the 1.2-unit lead-in
const BOOKS = stopPx(1);
const SYSTEMS = stopPx(3);
const TALKS = stopPx(6);

let element: HTMLDivElement;
let travelTo: ReturnType<typeof vi.fn>;
/** Typed, non-empty, and never asserted on: the store requires a jumpTo, the
 * tests only ever read travelTo. */
const noopTravel = (unit: number): void => {
  void unit;
};

/** Models the container the browser actually gives us: it ROUNDS the value it
 * stores (a bound of 101.739 reads back as 102), and it does not dispatch the
 * resulting scroll event synchronously — it queues it. Both details defeated
 * an earlier version of the echo bookkeeping, so the fixture has to have them
 * or the test cannot see the bug. */
function makeScrollElement() {
  const node = document.createElement("div");
  let value = 0;
  Object.defineProperty(node, "scrollWidth", { value: RANGE + 390 });
  Object.defineProperty(node, "clientWidth", { value: 390 });
  Object.defineProperty(node, "scrollLeft", {
    get: () => value,
    set: (next: number) => {
      const clamped = Math.min(RANGE, Math.max(0, next));
      const rounded = Math.round(clamped);
      if (rounded === value) return;
      value = rounded;
      pendingScrollEvents.push(node);
    },
    configurable: true,
  });
  return node;
}

/** Scroll events the container owes. The browser delivers these on its own
 * schedule, and a correction echo can arrive long after the write that caused
 * it — which is the whole point of the late-echo case, so the test has to be
 * able to hold one back. */
let pendingScrollEvents: HTMLElement[] = [];
const flushScroll = () => {
  const queued = pendingScrollEvents;
  pendingScrollEvents = [];
  for (const node of queued) node.dispatchEvent(new Event("scroll"));
};
/** The browser coalesces: a queued event can be superseded and never
 * delivered. A correction echo lost this way leaves its token with nothing to
 * retire it, which is the only way a stale token can reach a later gesture. */
const dropPendingScroll = () => {
  pendingScrollEvents = [];
};

/** `target` is getter-only on a real Event, so the listener's own dispatch
 * has to set it — never Object.assign. */
const pointer = (type: string, pointerId: number, pointerType = "touch") => {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  Object.defineProperty(event, "button", { value: 0 });
  return event;
};
const press = (node: HTMLElement, id = 1, pointerType = "touch") =>
  node.dispatchEvent(pointer("pointerdown", id, pointerType));
const lift = (node: HTMLElement, id = 1) =>
  node.dispatchEvent(pointer("pointerup", id));
const scrollTo = (node: HTMLDivElement, to: number) => {
  node.scrollLeft = to;
  flushScroll();
};
/** Place the room before a gesture starts, draining the event the write queues
 * so setup can never leak a scroll into the case under test. */
const seed = (node: HTMLDivElement, to: number) => {
  node.scrollLeft = to;
  flushScroll();
};
const scrollEnd = (node: HTMLDivElement) =>
  node.dispatchEvent(new Event("scrollend"));
/** CameraRig's write for an explicit destination. */
const writeDestination = (node: HTMLDivElement, unit: number) => {
  node.scrollLeft = stopPx(unit);
  flushScroll();
};

beforeEach(() => {
  vi.useFakeTimers();
  pendingScrollEvents = [];
  element = makeScrollElement();
  document.body.append(element);
  travelTo = vi.fn();
  useStacks.setState({
    scrollEl: element,
    travelTo: travelTo as unknown as (unit: number) => void,
    jumpTo: noopTravel,
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
  document.documentElement.removeAttribute("data-universal-search-open");
  useStacks.setState({ scrollEl: null, travelTo: null, jumpTo: null });
  vi.useRealTimers();
});

describe("coarse travel ownership, through the real listeners", () => {
  it("R1 does not accept a clamped position as proof the gesture went quiet", () => {
    seed(element, BOOKS);
    press(element);
    // Momentum drives below the left boundary; the clamp pins it at About.
    scrollTo(element, 90);
    scrollEnd(element);
    scrollTo(element, 80);
    // A second end at the SAME clamped value, with no time elapsed. The first
    // fix settled here and released ownership.
    scrollEnd(element);
    // Residual momentum after that release escaped all the way to 0.
    scrollTo(element, 0);
    act(() => void vi.advanceTimersByTime(200));

    expect(element.scrollLeft).toBeGreaterThanOrEqual(Math.floor(ABOUT));
  });

  it("R2 lets an explicit keyboard jump win over a gesture still in flight", () => {
    seed(element, BOOKS);
    press(element);
    scrollTo(element, 300);
    scrollEnd(element);
    // The real registered keydown listener: digit 7 is unit 6, Talks. The
    // travelTo stub performs CameraRig's scroll write, so this fails if the
    // keydown path stops announcing its takeover.
    travelTo.mockImplementation((unit: number) => writeDestination(element, unit));
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "7", bubbles: true }),
      );
    });
    act(() => void vi.advanceTimersByTime(300));

    // Before the takeover hook this was clamped back to Systems.
    expect(element.scrollLeft).toBeCloseTo(TALKS, 0);
    expect(element.scrollLeft).not.toBeCloseTo(SYSTEMS, 0);
  });

  it("R3 keeps a chosen search result even after the palette closes again", () => {
    seed(element, BOOKS);
    press(element);
    scrollTo(element, 300);
    scrollEnd(element);
    document.documentElement.setAttribute("data-universal-search-open", "");
    act(() => {
      // A chosen search result navigates through navigateRoom — the real
      // funnel, and NOT ScrollBridges' keydown, which correctly ignores keys
      // while the palette owns them. This fails if navigateRoom stops
      // announcing its takeover.
      travelTo.mockImplementation((unit: number) => writeDestination(element, unit));
      navigateRoom(6);
    });
    document.documentElement.removeAttribute("data-universal-search-open");
    scrollEnd(element);
    act(() => void vi.advanceTimersByTime(300));

    expect(element.scrollLeft).toBeCloseTo(TALKS, 0);
  });

  it("R4 does not let a predecessor's pointerup release its successor", () => {
    seed(element, BOOKS);
    press(element, 1);
    scrollTo(element, 300);
    scrollEnd(element);
    // A second contact takes over before the first has lifted.
    press(element, 2);
    // The first contact's lift arrives while the second has not moved.
    lift(element, 1);
    // The second gesture's own momentum must still be clamped.
    scrollTo(element, 0);
    act(() => void vi.advanceTimersByTime(200));

    expect(element.scrollLeft).toBeGreaterThanOrEqual(Math.floor(ABOUT));
  });

  it("settles once the container is genuinely still", () => {
    seed(element, BOOKS);
    press(element);
    scrollTo(element, 300);
    scrollEnd(element);
    act(() => void vi.advanceTimersByTime(300));

    expect(travelTo).toHaveBeenCalledTimes(1);
  });


  it("R5 settles from scrollend itself, before any fallback timer is drained", () => {
    // asset-memory-codex disproved my claim that redundancy made this
    // unprovable. It does not: advance the CLOCK past the quiet window without
    // draining the timer queue, then dispatch scrollend. Only the listener can
    // have settled, because the fallback has not been allowed to run.
    seed(element, BOOKS);
    press(element);
    scrollTo(element, 300);
    vi.setSystemTime(Date.now() + COARSE_TRAVEL_QUIET_MS + 1);
    vi.spyOn(performance, "now").mockReturnValue(
      performance.now() + COARSE_TRAVEL_QUIET_MS + 1,
    );
    scrollEnd(element);

    expect(travelTo).toHaveBeenCalledTimes(1);
  });

  it("ignores a fine pointer, which owns no coarse travel", () => {
    seed(element, BOOKS);
    press(element, 1, "mouse");
    scrollTo(element, 300);
    scrollEnd(element);
    act(() => void vi.advanceTimersByTime(300));

    expect(travelTo).not.toHaveBeenCalled();
  });

  it("R6 gives up a contact that never scrolled instead of polling forever", async () => {
    // A touchstart with no scroll behind it, then an isolated scrollend. There
    // is no activity to attribute, so there is nothing to settle and nothing
    // to wait for. Re-arming here left one timer rescheduling itself every
    // quiet window for as long as the room stayed open.
    press(element);
    scrollEnd(element);
    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(1000);
    });

    expect(travelTo).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("R7 does not attribute a predecessor's echo to a successor with no motion", () => {
    // asset-memory-codex's counterexample, stated exactly. G1 scrolls below
    // the boundary; the clamp corrects and the browser queues the echo. A
    // synchronous takeover lands, then G2 presses and never moves anything.
    // The only scroll G2 ever sees is G1's correction arriving late. It is not
    // G2's motion, so G2 must travel nowhere — the earlier version counted it
    // and settled travelTo(0) on a gesture that had not moved.
    seed(element, BOOKS);
    press(element, 1);
    scrollTo(element, 40); // clamped; echo queued, still in flight
    act(() => {
      navigateRoom(6); // synchronous takeover
    });
    travelTo.mockClear();
    press(element, 2); // G2 arms, and will not move the container at all
    act(() => void flushScroll()); // G1's echo finally lands, on G2's watch
    act(() => void vi.advanceTimersByTime(COARSE_TRAVEL_QUIET_MS + 40));

    expect(travelTo).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("R7b lets a genuine equal-value scroll extend the quiet deadline", () => {
    // The sensitive case for token RETIREMENT, which the previous version of
    // this test missed entirely: it wrote the value the container already held,
    // so the fixture enqueued nothing and no genuine event existed.
    //
    // G1's clamp leaves a token at the About stop and its echo is COALESCED
    // AWAY, so nothing retires it. G2 then scrolls to 300 — a delivered
    // position that disproves the token — and 50ms later makes a genuine move
    // that happens to equal the old token's value. That move is motion, so the
    // deadline must run from it. A lingering token suppresses it and the
    // gesture settles a full 50ms early.
    const Q = COARSE_TRAVEL_QUIET_MS;
    seed(element, BOOKS);
    press(element, 1);
    scrollTo(element, 40); // clamp -> token at the About stop
    act(() => {
      navigateRoom(1); // revokes G1
    });
    dropPendingScroll(); // the echo never arrives

    press(element, 2);
    scrollTo(element, 300); // t=0 for G2, and disproves any surviving token
    travelTo.mockClear();
    act(() => void vi.advanceTimersByTime(50));
    scrollTo(element, Math.round(ABOUT)); // genuine, equal to the stale token

    act(() => void vi.advanceTimersByTime(Q - 45)); // past t=0 + Q
    expect(travelTo).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(60)); // past t=50 + Q
    expect(travelTo).toHaveBeenCalledTimes(1);
  });

  it("R8 revokes for a chosen result that names the stop already showing", () => {
    // travelToLocation returns early when the destination matches the mirrored
    // unit, so a result naming the CURRENT section never reaches navigateRoom.
    // Driving it through a mounted RoomNavigation and a real popstate is the
    // only way to exercise that closure.
    //
    // The assertion has to land OUTSIDE the old gesture's window or it proves
    // nothing: from Projects the clamp allows origin ±3, i.e. down to Golf at
    // ~668.8. A residual scroll to 0 is therefore pulled to 668.8 by a gesture
    // that still owns the container, and left alone by one that has given it
    // up. An earlier version of this test chose Talks, which sits inside that
    // window, and passed whether or not anything revoked.
    cleanup();
    window.history.replaceState(null, "", "/projects");
    useStacks.setState({ activeUnit: 4 });
    render(
      <RoomNavigation rendererEnabled>
        <ScrollBridges />
      </RoomNavigation>,
    );
    seed(element, stopPx(4));
    press(element);
    scrollTo(element, stopPx(4) - 400); // in flight, clamp armed
    act(() => {
      // The chosen result is the section already showing.
      window.history.pushState(null, "", "/projects");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    // Residual motion after the choice, well outside the old window.
    act(() => void scrollTo(element, 0));
    act(() => void vi.advanceTimersByTime(COARSE_TRAVEL_QUIET_MS + 40));

    expect(element.scrollLeft).toBe(0);
    expect(element.scrollLeft).not.toBeCloseTo(stopPx(1.52), 0);
  });

  it("R9 does not let a late correction echo postpone the deadline", () => {
    // asset-memory-codex's counterexample. Last genuine scroll at t=0, below
    // the boundary, so the clamp corrects and the browser QUEUES the echo. The
    // echo lands at t=99. It is not motion, so it must not move the deadline:
    // the settle is due at t=100, not t=199.
    const Q = COARSE_TRAVEL_QUIET_MS;
    seed(element, BOOKS);
    press(element);
    scrollTo(element, 40); // genuine motion at t=0; the clamp queues its echo
    act(() => void vi.advanceTimersByTime(Q - 1));
    act(() => void flushScroll()); // the echo finally lands, at t = Q-1
    expect(travelTo).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(2)); // t = Q+1, past the real deadline
    // A full re-arm on the echo path would have pushed this out to 2Q-1.
    expect(travelTo).toHaveBeenCalledTimes(1);
  });

  it("writes nothing after unmount with a settle still pending", () => {
    seed(element, BOOKS);
    press(element);
    scrollTo(element, 300);
    cleanup();
    travelTo.mockClear();
    act(() => void vi.advanceTimersByTime(600));
    scrollEnd(element);
    act(() => void vi.advanceTimersByTime(600));

    expect(travelTo).not.toHaveBeenCalled();
  });
});
