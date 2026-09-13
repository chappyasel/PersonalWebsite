// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

describe("shared X widget loader", () => {
  afterEach(() => {
    document.head
      .querySelectorAll("script[data-musing-twitter-widgets]")
      .forEach((script) => script.remove());
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("shares a script across concurrent tweets and waits for the ready callback", async () => {
    const { loadTwitterWidgets } = await import("./twitterWidgets");
    const first = loadTwitterWidgets();
    expect(loadTwitterWidgets()).toBe(first);
    const scripts = document.head.querySelectorAll(
      "script[data-musing-twitter-widgets]",
    );
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.getAttribute("src")).toBe(
      "https://platform.twitter.com/widgets.js",
    );
    const api = { widgets: { createTweet: vi.fn() } };
    const ready = vi.fn((callback: (value: typeof api) => void) =>
      callback(api),
    );
    vi.stubGlobal("twttr", { ready });
    scripts[0]!.dispatchEvent(new Event("load"));
    await expect(first).resolves.toBe(api);
    expect(ready).toHaveBeenCalledOnce();
  });

  it("retries a failed script load", async () => {
    const { loadTwitterWidgets } = await import("./twitterWidgets");
    const first = loadTwitterWidgets();
    const failed = expect(first).rejects.toThrow("X embeds could not load");
    document.head
      .querySelector("script[data-musing-twitter-widgets]")!
      .dispatchEvent(new Event("error"));
    await failed;
    expect(
      document.head.querySelector("script[data-musing-twitter-widgets]"),
    ).toBeNull();
    const retry = loadTwitterWidgets();
    const api = { widgets: { createTweet: vi.fn() } };
    vi.stubGlobal("twttr", api);
    document.head
      .querySelector("script[data-musing-twitter-widgets]")!
      .dispatchEvent(new Event("load"));
    await expect(retry).resolves.toBe(api);
  });
});
