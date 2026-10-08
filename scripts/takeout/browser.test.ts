import { afterEach, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  close: vi.fn(() => new Promise<void>(() => undefined)),
  pages: vi.fn(() => []),
  newPage: vi.fn(),
}));

vi.mock("playwright", () => ({
  chromium: { launchPersistentContext: vi.fn(async () => context) },
}));

import { close, getContext } from "./browser";

afterEach(() => {
  vi.useRealTimers();
});

describe("close", () => {
  it("gives up on a browser whose close never finishes", async () => {
    // Headed Chrome for Testing leaves chrome_crashpad_handler holding the
    // browser's stderr, and Playwright's close waits for that pipe (live,
    // 2026-10-08): the holder logged host_finished and never exited.
    vi.useFakeTimers();
    await getContext({ headless: true });
    let settled = false;
    const closing = close().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await closing;
    expect(settled).toBe(true);
    expect(context.close).toHaveBeenCalledTimes(1);
  });
});
