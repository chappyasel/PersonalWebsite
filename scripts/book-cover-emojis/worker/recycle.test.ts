import { withWatchdog } from "./browser";
import { describe, expect, it, vi } from "vitest";

/**
 * The recycling rule, reduced to its shape.
 *
 * Chromium reached 9.2 GB resident and 101.8% CPU after 35 uploads and then
 * stopped making progress. Recycling happens inside the worker loop so the S3
 * scan that chooses the work is not repeated every five books.
 */
function makeRecycler(limit: number) {
  const events: string[] = [];
  let session: number | null = null;
  let uploads = 0;
  let opened = 0;

  const recycleIfSpent = () => {
    if (session === null || uploads < limit) return;
    events.push(`close-${session}`);
    session = null;
    uploads = 0;
  };
  const get = () => {
    if (session === null) {
      session = ++opened;
      events.push(`open-${session}`);
    }
    return session;
  };
  const upload = () => {
    recycleIfSpent();
    const id = get();
    uploads += 1;
    events.push(`upload-${id}`);
  };
  return { events, upload, opened: () => opened };
}

describe("session recycling", () => {
  it("replaces the browser after five uploads", () => {
    const r = makeRecycler(5);
    for (let i = 0; i < 5; i++) r.upload();
    expect(r.opened()).toBe(1);
    r.upload();
    expect(r.opened()).toBe(2);
    expect(r.events).toContain("close-1");
  });

  it("opens one browser per five books across a long run", () => {
    const r = makeRecycler(5);
    for (let i = 0; i < 40; i++) r.upload();
    // 40 uploads is 8 sessions, not one that grows to nine gigabytes.
    expect(r.opened()).toBe(8);
  });

  it("closes the old session before opening the next", () => {
    const r = makeRecycler(5);
    for (let i = 0; i < 6; i++) r.upload();
    expect(r.events.indexOf("close-1")).toBeLessThan(r.events.indexOf("open-2"));
  });

  it("never recycles partway through a book's uploads", () => {
    const r = makeRecycler(5);
    for (let i = 0; i < 5; i++) r.upload();
    // The check runs before work begins, so the fifth upload used session 1.
    expect(r.events.filter((e) => e === "upload-1")).toHaveLength(5);
  });
});

describe("watchdogs", () => {
  it("lets work that finishes in time through untouched", async () => {
    await expect(withWatchdog(Promise.resolve("done"), 1000, "task")).resolves.toBe(
      "done",
    );
  });

  it("gives up on work that never settles", async () => {
    // A wedged renderer does not reject, it just never answers.
    const never = new Promise<string>(() => undefined);
    await expect(withWatchdog(never, 20, "stuck task")).rejects.toThrow(
      /stuck task exceeded 20ms/,
    );
  });

  it("passes a real rejection through unchanged", async () => {
    await expect(
      withWatchdog(Promise.reject(new Error("http 500")), 1000, "task"),
    ).rejects.toThrow("http 500");
  });

  it("clears its timer so a fast task does not hold the process open", async () => {
    const clear = vi.spyOn(globalThis, "clearTimeout");
    await withWatchdog(Promise.resolve(1), 5000, "task");
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});

describe("recovering from a wedged browser", () => {
  /**
   * A fifteen-minute stall with no CPU, no open socket and no output came from
   * a single unbounded `isVisible()`. Every browser entry point is now bounded,
   * and a fault throws the session away and charges one book rather than
   * ending a two-hour run or blaming every book after it.
   */
  function makeLoop(faultsAt: Set<number>, maxConsecutive = 3) {
    const events: string[] = [];
    let session: number | null = null;
    let opened = 0;
    let consecutive = 0;
    let aborted = false;

    for (let book = 0; book < 8; book++) {
      if (aborted) break;
      session ??= ++opened;
      if (faultsAt.has(book)) {
        consecutive += 1;
        events.push(`fault-book${book}-session${session}`);
        session = null; // discarded, never reused
        if (consecutive >= maxConsecutive) {
          events.push("abort");
          aborted = true;
        }
        continue;
      }
      consecutive = 0;
      events.push(`ok-book${book}-session${session}`);
    }
    return { events, opened };
  }

  it("charges one book and continues with a fresh browser", () => {
    const { events, opened } = makeLoop(new Set([2]));
    expect(events.filter((e) => e.startsWith("fault"))).toHaveLength(1);
    expect(events).toContain("ok-book3-session2");
    expect(opened).toBe(2);
    expect(events).not.toContain("abort");
  });

  it("never hands the faulted session to the next book", () => {
    const { events } = makeLoop(new Set([0]));
    expect(events[0]).toBe("fault-book0-session1");
    expect(events[1]).toBe("ok-book1-session2");
  });

  it("gives up after three fresh browsers fail in a row", () => {
    const { events } = makeLoop(new Set([1, 2, 3]));
    expect(events).toContain("abort");
    expect(events.filter((e) => e.startsWith("ok-"))).toHaveLength(1);
  });

  it("resets the streak after a success, so scattered faults do not end a run", () => {
    const { events } = makeLoop(new Set([1, 3, 5]));
    expect(events).not.toContain("abort");
    expect(events.filter((e) => e.startsWith("ok-"))).toHaveLength(5);
  });
});
