import { afterEach, describe, expect, it, vi } from "vitest";

import { ROOM_RETURN_WINDOW_MS, RoomResidency } from "./roomResidency";

afterEach(() => vi.useRealTimers());

function room() {
  vi.useFakeTimers();
  const cache = new RoomResidency();
  const owner = Symbol();
  const retire = vi.fn();
  cache.enter(owner, "canvas");
  return { cache, owner, retire };
}

describe("room return window", () => {
  it("keeps a ready room paused for three minutes, then retires it once", () => {
    const { cache, owner, retire } = room();
    cache.leave(owner, true, "#books", retire);
    expect(cache.getSnapshot()).toMatchObject({
      active: false,
      content: "canvas",
      returnHash: "#books",
    });
    vi.advanceTimersByTime(ROOM_RETURN_WINDOW_MS - 1);
    expect(cache.hasReadyRoom()).toBe(true);
    expect(retire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cache.getSnapshot()).toMatchObject({
      content: null,
      expiresAt: null,
      returnHash: "#books",
    });
    expect(retire).toHaveBeenCalledTimes(1);
    cache.evict();
    expect(retire).toHaveBeenCalledTimes(1);
  });

  it("cancels expiry on return and grants a new window only on the next departure", () => {
    const { cache, owner, retire } = room();
    cache.leave(owner, true, "#books", retire);
    vi.advanceTimersByTime(120_000);
    const returning = Symbol();
    cache.enter(returning, "canvas");
    vi.advanceTimersByTime(ROOM_RETURN_WINDOW_MS);
    expect(cache.getSnapshot()).toMatchObject({
      active: true,
      content: "canvas",
      expiresAt: null,
    });
    expect(retire).not.toHaveBeenCalled();
    cache.leave(returning, true, "#training", retire);
    vi.advanceTimersByTime(ROOM_RETURN_WINDOW_MS);
    expect(retire).toHaveBeenCalledOnce();
  });

  it("ignores stale cleanup and page updates while the visitor reads elsewhere", () => {
    const { cache, owner, retire } = room();
    cache.leave(owner, true, "#books", retire);
    const expiresAt = cache.getSnapshot().expiresAt;
    vi.advanceTimersByTime(60_000);
    cache.update(owner, "replacement");
    cache.leave(owner, true, "#training", retire);
    expect(cache.getSnapshot()).toMatchObject({
      content: "canvas",
      expiresAt,
      returnHash: "#books",
    });
  });

  it("checks elapsed wall time before reusing a room when browser timers were throttled", () => {
    const { cache, owner, retire } = room();
    cache.leave(owner, true, "#books", retire);
    vi.setSystemTime(Date.now() + ROOM_RETURN_WINDOW_MS + 1);
    expect(cache.hasReadyRoom()).toBe(false);
    cache.enter(Symbol(), "new canvas");
    expect(retire).toHaveBeenCalledOnce();
    expect(cache.getSnapshot()).toMatchObject({
      active: true,
      content: "new canvas",
    });
  });

  it("never keeps an incomplete room", () => {
    const { cache, owner, retire } = room();
    cache.leave(owner, false, "#about", retire);
    expect(cache.getSnapshot().content).toBeNull();
    expect(retire).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the live off control releases a parked room immediately and does not rebuild on enable", () => {
    const { cache, owner, retire } = room();
    cache.leave(owner, true, "#books", retire);
    cache.setEnabled(false);
    expect(cache.getSnapshot().content).toBeNull();
    expect(retire).toHaveBeenCalledOnce();
    cache.setEnabled(true);
    expect(cache.getSnapshot().content).toBeNull();
  });

  it("the live off control leaves an active room alone, then releases on departure", () => {
    const { cache, owner, retire } = room();
    cache.setEnabled(false);
    expect(cache.getSnapshot().content).toBe("canvas");
    cache.leave(owner, true, "#books", retire);
    expect(cache.getSnapshot().content).toBeNull();
    expect(retire).toHaveBeenCalledOnce();
  });
});

it("calls browser timers without rebinding their Window receiver", () => {
  const original = globalThis.clearTimeout;
  vi.stubGlobal(
    "clearTimeout",
    function (this: unknown, timer: ReturnType<typeof setTimeout>) {
      if (this !== undefined && this !== globalThis)
        throw new TypeError("Illegal invocation");
      original(timer);
    },
  );
  try {
    const cache = new RoomResidency();
    const owner = Symbol();
    cache.enter(owner, "canvas");
    cache.leave(owner, true, "#books", () => undefined);
    expect(() => cache.enter(Symbol(), "canvas")).not.toThrow();
  } finally {
    vi.unstubAllGlobals();
  }
});
