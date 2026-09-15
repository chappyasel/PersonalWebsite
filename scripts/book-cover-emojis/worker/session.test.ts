import { BrowserSessionError, BrowserSetupError } from "./browser";
import { describe, expect, it, vi } from "vitest";

/**
 * The batch-poisoning bug, reduced to its shape.
 *
 * The cache was assigned before setup finished, so a browser that never
 * reached the emoji settings was handed to every later book, each of which
 * then timed out waiting for "Add emoji". One failed setup, three hundred
 * bogus failures.
 */
function makeGetSession(setup: () => Promise<void>, closed: string[]) {
  let session: { id: number } | null = null;
  let opened = 0;
  return async (): Promise<{ id: number }> => {
    if (session) return session;
    const candidate = { id: ++opened };
    try {
      await setup();
    } catch (error) {
      closed.push(`closed-${candidate.id}`);
      throw error instanceof BrowserSetupError
        ? error
        : new BrowserSetupError(String(error));
    }
    session = candidate;
    return session;
  };
}

describe("session caching", () => {
  it("caches a session only after setup succeeds", async () => {
    const closed: string[] = [];
    const getSession = makeGetSession(async () => undefined, closed);
    const first = await getSession();
    expect(await getSession()).toBe(first);
    expect(closed).toEqual([]);
  });

  it("never hands a half-built session to the next book", async () => {
    const closed: string[] = [];
    const setup = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new BrowserSetupError("sidebar never rendered"));
    const getSession = makeGetSession(setup, closed);

    await expect(getSession()).rejects.toBeInstanceOf(BrowserSetupError);
    // A second book asking for a session must not receive the broken one.
    await expect(getSession()).rejects.toBeInstanceOf(BrowserSetupError);
    expect(setup).toHaveBeenCalledTimes(2);
  });

  it("closes the browser it could not set up", async () => {
    const closed: string[] = [];
    const getSession = makeGetSession(async () => {
      throw new BrowserSetupError("emoji settings never opened");
    }, closed);
    await expect(getSession()).rejects.toThrow(/never opened/);
    expect(closed).toEqual(["closed-1"]);
  });

  it("wraps an unexpected setup failure so callers can still classify it", async () => {
    const closed: string[] = [];
    const getSession = makeGetSession(async () => {
      throw new Error("some playwright internal");
    }, closed);
    await expect(getSession()).rejects.toBeInstanceOf(BrowserSetupError);
  });
});

describe("classifying a shared failure", () => {
  const fatal = (error: unknown) => error instanceof BrowserSetupError;

  it("treats a setup failure as fatal to the batch, not to one book", () => {
    // Recording it per book burned the retry budget of every remaining page.
    expect(fatal(new BrowserSetupError("sidebar never rendered"))).toBe(true);
  });

  it("leaves a genuine per-book failure bounded and retryable", () => {
    expect(fatal(new Error("cover download failed"))).toBe(false);
  });
});

describe("a browser fault partway through a batch", () => {
  // Books uploaded fine, then "Add emoji" vanished at one book and every book
  // after it failed the same way. The earlier fix only covered setup, so a
  // mid-run fault was still recorded against each book in turn.
  const fatal = (error: unknown) => error instanceof BrowserSessionError;

  it("treats a failed upload as a session fault, not a book fault", () => {
    expect(fatal(new BrowserSessionError("registering book-einstein failed"))).toBe(
      true,
    );
  });

  it("treats a vanished panel as a session fault", () => {
    expect(
      fatal(new BrowserSessionError("the emoji panel vanished and could not be re-opened")),
    ).toBe(true);
  });

  it("still catches setup faults, which are the same family", () => {
    expect(fatal(new BrowserSetupError("sidebar never rendered"))).toBe(true);
  });

  it("leaves a genuine per-book failure bounded", () => {
    expect(fatal(new Error("cover download failed"))).toBe(false);
    expect(fatal(new Error("asset digest mismatch"))).toBe(false);
  });

  it("names the diagnostics file in the message", () => {
    const error = new BrowserSessionError("registering book-einstein failed", {
      diagnostics: "/tmp/diag/2026-09-15-upload-failed.png",
    });
    expect(error.message).toContain("/tmp/diag/2026-09-15-upload-failed.png");
  });

  it("keeps the original error as the cause", () => {
    const cause = new Error("Timeout 30000ms exceeded");
    expect(new BrowserSessionError("wrapped", { cause }).cause).toBe(cause);
  });
});
