// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import React, { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResidentRoom } from "./ResidentRoom";
import { ResidentRoomHost, useRoomActive } from "./ResidentRoomHost";
import { ROOM_RETURN_WINDOW_MS, roomResidency } from "./roomResidency";

const boot = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
  ready: true,
  retire: vi.fn(),
  setDocumentActive: vi.fn(),
}));
vi.mock("../boot/worldBootSession", () => ({
  worldBoot: {
    getView: () => ({ revealed: boot.ready }),
    scope: () => ({ send: boot.retire }),
    subscribe: (listener: () => void) => {
      boot.listeners.add(listener);
      return () => boot.listeners.delete(listener);
    },
    setDocumentActive: boot.setDocumentActive,
  },
}));
vi.mock("../store", () => ({
  useStacks: { getState: () => ({ activeUnit: 1, golfStop: false }) },
}));

const mounted = vi.fn();
const unmounted = vi.fn();
function Room() {
  const active = useRoomActive();
  const [position, setPosition] = useState(1);
  useEffect(() => {
    mounted();
    return unmounted;
  }, []);
  return (
    <>
      {/* The live canvas wrapper explicitly restores visibility after boot. */}
      <div style={{ position: "fixed", inset: 0, visibility: "visible" }}>
        <canvas data-testid="room-canvas" />
      </div>
      <button onClick={() => setPosition(position + 1)}>
        {active ? "active" : "paused"} shelf {position}
      </button>
    </>
  );
}

// Check paint suppression, not accessibility: aria-hidden and inert do not
// stop a canvas from covering a destination page. Visibility can be overridden
// by a descendant; display and group opacity cannot.
function canPaint(element: HTMLElement) {
  if (getComputedStyle(element).visibility === "hidden") return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.opacity === "0") return false;
  }
  return true;
}
function App({ home }: { home: boolean }) {
  return (
    <>
      <ResidentRoomHost />
      {home ? (
        <ResidentRoom fallback={<p>server document</p>}>
          <Room />
        </ResidentRoom>
      ) : (
        <p>Weightlifting page</p>
      )}
    </>
  );
}
afterEach(() => {
  cleanup();
  roomResidency.evict();
  roomResidency.setEnabled(true);
  boot.ready = true;
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("shared room host", () => {
  it("hides the frozen canvas after leaving for Weightlifting and restores it on return", () => {
    const app = render(<App home />);
    const canvas = screen.getByTestId("room-canvas");
    expect(canPaint(canvas)).toBe(true);

    app.rerender(<App home={false} />);
    expect(canPaint(canvas)).toBe(false);
    expect(unmounted).not.toHaveBeenCalled();

    app.rerender(<App home />);
    expect(screen.getByTestId("room-canvas")).toBe(canvas);
    expect(canPaint(canvas)).toBe(true);
    expect(mounted).toHaveBeenCalledTimes(1);
  });

  it("loads no room on a direct reading-page visit", () => {
    render(<App home={false} />);
    expect(mounted).not.toHaveBeenCalled();
    expect(document.querySelector("[data-resident-room]")).toBeNull();
  });

  it("keeps the same mounted room and state on a quick round trip", () => {
    vi.useFakeTimers();
    const app = render(<App home />);
    fireEvent.click(screen.getByRole("button"));
    app.rerender(<App home={false} />);
    expect(
      document
        .querySelector("[data-resident-room='parked']")
        ?.hasAttribute("inert"),
    ).toBe(true);
    expect(screen.queryByRole("button")).toBeNull();
    expect(unmounted).not.toHaveBeenCalled();
    void act(() => vi.advanceTimersByTime(120_000));
    app.rerender(<App home />);
    expect(screen.getByRole("button").textContent).toBe("active shelf 2");
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(boot.retire).not.toHaveBeenCalled();
    expect(boot.setDocumentActive).toHaveBeenLastCalledWith(true);
  });

  it("unmounts after expiry and mounts a fresh room on a later return", () => {
    vi.useFakeTimers();
    const app = render(<App home />);
    app.rerender(<App home={false} />);
    void act(() => vi.advanceTimersByTime(ROOM_RETURN_WINDOW_MS));
    expect(unmounted).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-resident-room]")).toBeNull();
    app.rerender(<App home />);
    expect(mounted).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button").textContent).toBe("active shelf 1");
  });

  it("rebuilds after a throttled deadline even when eviction and entry share one commit", () => {
    vi.useFakeTimers();
    const app = render(<App home />);
    app.rerender(<App home={false} />);
    vi.setSystemTime(Date.now() + ROOM_RETURN_WINDOW_MS + 1);
    app.rerender(<App home />);
    expect(mounted).toHaveBeenCalledTimes(2);
    expect(unmounted).toHaveBeenCalledOnce();
    expect(boot.retire).toHaveBeenCalledOnce();
  });

  it("evicts a parked room when its WebGL readiness is lost", () => {
    const app = render(<App home />);
    app.rerender(<App home={false} />);
    void act(() => {
      boot.ready = false;
      for (const listener of boot.listeners) listener();
    });
    expect(unmounted).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-resident-room]")).toBeNull();
    expect(boot.retire).toHaveBeenCalledOnce();
  });

  it("drops a room that has not finished booting", () => {
    boot.ready = false;
    const app = render(<App home />);
    app.rerender(<App home={false} />);
    expect(unmounted).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-resident-room]")).toBeNull();
  });
});
