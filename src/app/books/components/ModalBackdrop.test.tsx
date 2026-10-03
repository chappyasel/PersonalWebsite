// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { AnimatePresence } from "framer-motion";
import { createRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ModalBackdrop } from "./ModalBackdrop";

type FakeAnimation = {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
};
let animations: FakeAnimation[] = [];

beforeEach(() => {
  animations = [];
  // jsdom has no WAAPI.
  HTMLElement.prototype.animate = vi.fn(function (
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const animation: FakeAnimation = {
      keyframes,
      options,
      onfinish: null,
      oncancel: null,
    };
    animations.push(animation);
    return animation as unknown as Animation;
  }) as unknown as HTMLElement["animate"];
});
afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

function renderBackdrop(open: boolean, instant = false) {
  const backdropRef = createRef<HTMLDivElement>();
  const ui = (isOpen: boolean) => (
    <AnimatePresence>
      {isOpen && (
        <ModalBackdrop
          key="backdrop"
          backdropRef={backdropRef}
          instant={instant}
          data-testid="backdrop"
        />
      )}
    </AnimatePresence>
  );
  const view = render(ui(open));
  return { ...view, rerender: (isOpen: boolean) => view.rerender(ui(isOpen)) };
}

it("fades the black in from clear, ending on its own resting opacity", () => {
  renderBackdrop(true);
  expect(animations).toHaveLength(1);
  expect(animations[0]!.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  // No fill: once finished the layer is simply at rest, nothing to revert.
  expect(animations[0]!.options.fill).toBeUndefined();
});

it("holds the faded-out frame until the fade finishes, then leaves", () => {
  const view = renderBackdrop(true);
  view.rerender(false);
  const fadeOut = animations[1]!;
  expect(fadeOut.keyframes.at(-1)).toEqual({ opacity: 0 });
  expect(fadeOut.options.fill).toBe("forwards");
  expect(view.queryByTestId("backdrop")).not.toBeNull();
  fadeOut.onfinish?.();
  return vi.waitFor(() => expect(view.queryByTestId("backdrop")).toBeNull());
});

it("leaves at once when an origin flight has already faded it", async () => {
  const view = renderBackdrop(true, true);
  expect(animations).toHaveLength(0);
  view.rerender(false);
  expect(animations).toHaveLength(0);
  await vi.waitFor(() => expect(view.queryByTestId("backdrop")).toBeNull());
});
