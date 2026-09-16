// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { motionValue } from "framer-motion";
import { afterEach, expect, it, vi } from "vitest";

import { bookCardVisualEffects } from "~/lib/books/cardVisualEffects";
import { bookCoverShadow } from "~/lib/books/coverShadow";

import { BookCoverSurface } from "./BookCoverSurface";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  bookCardVisualEffects.setCoverLiftShadows(true);
});

it("follows the cover's actual spring values and scales down with the header", async () => {
  const motion = {
    rotateX: motionValue(0),
    rotateY: motionValue(0),
    scale: motionValue(1),
  };
  const shadowSize = motionValue(1);
  const { container } = render(
    <BookCoverSurface motion={motion} shadowSize={shadowSize}>
      Cover
    </BookCoverSurface>,
  );
  const surface = container.firstElementChild as HTMLElement;
  expect(surface.style.boxShadow).toContain(bookCoverShadow());
  act(() => {
    motion.rotateX.set(12);
    motion.rotateY.set(-10);
    motion.scale.set(1.1);
  });
  await waitFor(() =>
    expect(surface.style.boxShadow).toContain(bookCoverShadow(12, -10, 1.1)),
  );
  act(() => shadowSize.set(0.25));
  await waitFor(() =>
    expect(surface.style.boxShadow).toContain(
      bookCoverShadow(12, -10, 1.1, 0.25),
    ),
  );
});

it("removes the hover shadow subscription when disabled and restores it live", async () => {
  const motion = {
    rotateX: motionValue(0),
    rotateY: motionValue(0),
    scale: motionValue(1),
  };
  const unsubscribe = vi.fn();
  const originalOn = motion.scale.on.bind(motion.scale);
  const subscribe = vi
    .spyOn(motion.scale, "on")
    .mockImplementation((event, callback) => {
      const remove = originalOn(event, callback);
      return () => {
        unsubscribe();
        remove();
      };
    });
  const { container } = render(
    <BookCoverSurface motion={motion}>Cover</BookCoverSurface>,
  );
  expect(subscribe).toHaveBeenCalled();
  unsubscribe.mockClear();
  act(() => bookCardVisualEffects.setCoverLiftShadows(false));
  expect(unsubscribe).toHaveBeenCalled();
  subscribe.mockClear();
  act(() => {
    motion.scale.set(1.1);
    motion.rotateX.set(15);
  });
  expect(
    (container.firstElementChild as HTMLElement).style.boxShadow,
  ).toContain(bookCoverShadow());
  expect(subscribe).not.toHaveBeenCalled();
  act(() => bookCardVisualEffects.setCoverLiftShadows(true));
  await waitFor(() =>
    expect(
      (container.firstElementChild as HTMLElement).style.boxShadow,
    ).toContain(bookCoverShadow(15, 0, 1.1)),
  );
});

it("keeps a static shadow without subscribing to motion for reduced-motion and touch callers", () => {
  const { container } = render(<BookCoverSurface>Cover</BookCoverSurface>);
  expect(
    (container.firstElementChild as HTMLElement).style.boxShadow,
  ).toContain(bookCoverShadow());
});
