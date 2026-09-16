// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import speaking from "public/data/speaking.json";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { overlayCoordinator } from "~/lib/overlays/coordinator";

import { VideoGallery, VideoTrigger } from "./VideoGallery";
import { isStacksScrollableTarget } from "~/app/components/stacks/input/roomNavigationKeys";
import { artifactPreviewVisualEffects } from "~/app/components/stacks/scene/artifactPreviewVisualEffects";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  artifactPreviewVisualEffects.resetForTests();
  vi.unstubAllGlobals();
  expect(overlayCoordinator.getSnapshot().depth).toBe(0);
});

function gallery() {
  return render(
    <VideoGallery
      videos={speaking.talks.map((talk) => ({
        id: talk.videoId,
        title: talk.title,
      }))}
    >
      {speaking.talks.map((talk) => (
        <VideoTrigger
          key={talk.videoId}
          videoId={talk.videoId}
          title={talk.title}
        >
          {talk.title}
        </VideoTrigger>
      ))}
    </VideoGallery>,
  );
}

it("loads only the requested talk and replaces the player when navigating", async () => {
  gallery();
  const user = userEvent.setup();
  expect(document.querySelector("iframe")).toBeNull();
  await user.click(screen.getAllByRole("button", { name: /^Play / })[0]!);
  expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
  const first = document.querySelector("iframe")!;
  expect(isStacksScrollableTarget(first)).toBe(true);
  expect(first.src).toContain(`/embed/${speaking.talks[0]!.videoId}?`);
  expect(first.getAttribute("referrerpolicy")).toBe(
    "strict-origin-when-cross-origin",
  );
  expect(
    screen
      .getByRole("button", { name: "Previous video" })
      .hasAttribute("disabled"),
  ).toBe(true);
  for (const talk of speaking.talks.slice(1)) {
    await user.click(screen.getByRole("button", { name: "Next video" }));
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    expect(document.querySelector("iframe")!.title).toBe(talk.title);
  }
  expect(first.isConnected).toBe(false);
  expect(
    screen.getByRole("button", { name: "Next video" }).hasAttribute("disabled"),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Previous video" }));
  expect(document.querySelector("iframe")!.title).toBe(
    speaking.talks[2]!.title,
  );
});

it("opens by keyboard, closes with Escape, stops playback and restores focus", async () => {
  gallery();
  const user = userEvent.setup();
  const trigger = screen.getAllByRole("button", { name: /^Play / })[2]!;
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(overlayCoordinator.getSnapshot().depth).toBe(1);
  await user.keyboard("{Escape}");
  expect(document.querySelector("iframe")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(document.documentElement.hasAttribute("data-overlay-open")).toBe(
    false,
  );
});

it("dismisses with its close control or backdrop, but not the player", async () => {
  gallery();
  const user = userEvent.setup();
  const trigger = screen.getAllByRole("button", { name: /^Play / })[0]!;
  await user.click(trigger);
  expect(screen.getByRole("heading").className).toBe("sr-only");
  expect(screen.queryByText(speaking.talks[0]!.excerpt)).toBeNull();
  fireEvent.click(document.querySelector("iframe")!);
  expect(screen.queryByRole("dialog")).not.toBeNull();
  await user.click(screen.getByRole("button", { name: /^Close / }));
  expect(document.querySelector("iframe")).toBeNull();
  await user.click(trigger);
  fireEvent.pointerDown(screen.getByRole("dialog"));
  fireEvent.click(screen.getByRole("dialog"));
  expect(document.querySelector("iframe")).toBeNull();
});

it("honors the live preview blur switch and releases the overlay on unmount", async () => {
  const view = gallery();
  await userEvent.click(screen.getAllByRole("button", { name: /^Play / })[0]!);
  expect(
    document.querySelector(".document-gallery-mask--blurred"),
  ).not.toBeNull();
  act(() => artifactPreviewVisualEffects.setBackdropBlur(false));
  expect(document.querySelector(".document-gallery-mask--blurred")).toBeNull();
  view.unmount();
  expect(document.querySelector("iframe")).toBeNull();
  expect(overlayCoordinator.getSnapshot().depth).toBe(0);
});

it("keeps the player mounted through its exit, then restores focus", async () => {
  vi.stubGlobal("CSS", { escape: (name: string) => name });
  // jsdom does not run CSS animations. Supply the live computed animation
  // name so Radix follows its real animated dismissal path.
  const computedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const styles = computedStyle(element);
    if (element.getAttribute("role") === "dialog") {
      Object.defineProperty(styles, "animationName", {
        get: () =>
          element.getAttribute("data-state") === "open"
            ? "appear"
            : "disappear",
      });
    }
    return styles;
  });
  gallery();
  const user = userEvent.setup();
  const trigger = screen.getAllByRole("button", { name: /^Play / })[0]!;
  await user.click(trigger);
  const dialog = screen.getByRole("dialog");
  const player = document.querySelector("iframe")!;
  await user.click(screen.getByRole("button", { name: /^Close / }));
  expect(dialog.getAttribute("data-state")).toBe("closed");
  expect(player.isConnected).toBe(true);
  expect(overlayCoordinator.getSnapshot().depth).toBe(1);
  fireEvent(
    dialog,
    Object.assign(new Event("animationend", { bubbles: true }), {
      animationName: "disappear",
    }),
  );
  await waitFor(() => expect(player.isConnected).toBe(false));
  expect(overlayCoordinator.getSnapshot().depth).toBe(0);
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
