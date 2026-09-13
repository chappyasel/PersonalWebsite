// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TweetEmbed } from "./TweetEmbed";

const mocks = vi.hoisted(() => ({
  theme: "light",
  load: vi.fn(),
  create: vi.fn(),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: mocks.theme }),
}));
vi.mock("~/lib/musings/twitterWidgets", () => ({
  loadTwitterWidgets: mocks.load,
}));

describe("tweet embeds", () => {
  let approach: () => void;
  beforeEach(() => {
    mocks.theme = "light";
    mocks.load
      .mockReset()
      .mockResolvedValue({ widgets: { createTweet: mocks.create } });
    mocks.create
      .mockReset()
      .mockImplementation(async (_id: string, target: HTMLElement) => {
        const tweet = document.createElement("blockquote");
        tweet.textContent = "Embedded post";
        target.appendChild(tweet);
        return tweet;
      });
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          approach = () =>
            callback(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads near the viewport and rebuilds when the theme changes", async () => {
    const view = render(
      <TweetEmbed id="123" url="https://x.com/i/web/status/123" />,
    );
    expect(mocks.load).not.toHaveBeenCalled();
    act(() => approach());
    await waitFor(() => expect(view.getByText("Embedded post")).toBeTruthy());
    expect(view.queryByRole("link")).toBeNull();
    expect(mocks.create).toHaveBeenLastCalledWith(
      "123",
      expect.any(HTMLElement),
      { theme: "light", align: "center", dnt: true },
    );
    const oldTarget = mocks.create.mock.calls[0]![1] as HTMLElement;
    mocks.theme = "dark";
    view.rerender(<TweetEmbed id="123" url="https://x.com/i/web/status/123" />);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(oldTarget.isConnected).toBe(false);
    expect(view.getAllByText("Embedded post")).toHaveLength(1);
    expect(mocks.create).toHaveBeenLastCalledWith(
      "123",
      expect.any(HTMLElement),
      { theme: "dark", align: "center", dnt: true },
    );
  });

  it("retains a link when a post cannot load and allows retry", async () => {
    mocks.load.mockRejectedValueOnce(new Error("blocked"));
    const view = render(
      <TweetEmbed id="123" url="https://x.com/i/web/status/123" />,
    );
    act(() => approach());
    await waitFor(() =>
      expect(view.getByText("This post couldn't load.")).toBeTruthy(),
    );
    expect(view.getByRole("link").getAttribute("href")).toBe(
      "https://x.com/i/web/status/123",
    );
    fireEvent.click(view.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(view.getByText("Embedded post")).toBeTruthy());
    expect(view.queryByRole("button")).toBeNull();
    expect(view.queryByRole("link")).toBeNull();
  });

  it("does not render after leaving the article while the script loads", async () => {
    let resolve!: (value: {
      widgets: { createTweet: typeof mocks.create };
    }) => void;
    mocks.load.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const view = render(
      <TweetEmbed id="123" url="https://x.com/i/web/status/123" />,
    );
    act(() => approach());
    view.unmount();
    await act(async () => resolve({ widgets: { createTweet: mocks.create } }));
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
