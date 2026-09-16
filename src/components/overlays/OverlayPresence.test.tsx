// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { overlayCoordinator } from "~/lib/overlays/coordinator";

import { OverlayPresence } from "./OverlayPresence";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("waits for entrance before pausing, resumes at exit start, and cancels abandoned timers", async () => {
  vi.useFakeTimers();
  const show = (closing: boolean) => (
    <div data-overlay-surface>
      <OverlayPresence
        kind="album"
        phase={closing ? "closing" : "open"}
        onDismiss={() => undefined}
      />
    </div>
  );
  const view = render(show(false));
  expect(overlayCoordinator.getSnapshot().pauseBackground).toBe(false);
  await act(() => vi.advanceTimersByTime(760));
  expect(overlayCoordinator.getSnapshot().freezeRoom).toBe(true);
  view.rerender(show(true));
  expect(overlayCoordinator.getSnapshot()).toMatchObject({
    pauseBackground: false,
    freezeRoom: false,
    blockRoom: true,
  });
  view.unmount();
  expect(overlayCoordinator.getSnapshot().pauseBackground).toBe(false);
  const abandoned = render(show(false));
  abandoned.unmount();
  await act(() => vi.runAllTimers());
  expect(overlayCoordinator.getSnapshot()).toMatchObject({
    depth: 0,
    pauseBackground: false,
  });
});
