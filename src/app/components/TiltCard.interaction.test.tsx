// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { desktopMotionPreference } from "~/lib/desktopMotionPreference";

import TiltCard from "./TiltCard";

afterEach(() => {
  cleanup();
  desktopMotionPreference.setReduced(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("projects hover tilt on the card surface when the sidebar flattens its descendants", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: !query.includes("reduced-motion"),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const { container } = render(
    <div className="placard-scroll">
      <TiltCard interactive>
        <a href="#books">Books</a>
      </TiltCard>
    </div>,
  );
  const card = container.querySelector<HTMLElement>("[data-tilt-card]")!;
  const surface = container.querySelector<HTMLElement>("[data-tilt-motion]")!;
  vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 100,
    width: 200,
    height: 100,
    right: 300,
    bottom: 200,
    x: 100,
    y: 100,
    toJSON: vi.fn(),
  });
  fireEvent.mouseMove(card, { clientX: 290, clientY: 110 });
  await waitFor(() => {
    expect(surface.style.transform).toContain("rotateX(");
    expect(surface.style.transform).toContain("rotateY(");
  });
  // Perspective must live in the surface transform: the sidebar deliberately
  // clears inherited perspective and preserve-3d to keep glass behind text.
  expect(surface.style.transform).toContain("perspective(800px)");
  expect(card.className).not.toContain("[perspective:");
  act(() => desktopMotionPreference.setReduced(true));
  await waitFor(() => {
    expect(surface.style.transform).not.toContain("rotateX(");
    expect(surface.style.transform).not.toContain("rotateY(");
  });
  fireEvent.mouseMove(card, { clientX: 110, clientY: 190 });
  expect(surface.style.transform).not.toContain("rotateX(");
  fireEvent.mouseEnter(card);
  await waitFor(() => expect(surface.style.transform).toContain("scale("));
  expect(surface.style.transform).not.toContain("rotateX(");
  expect(surface.style.transform).not.toContain("rotateY(");
  act(() => desktopMotionPreference.setReduced(false));
  fireEvent.mouseMove(card, { clientX: 110, clientY: 190 });
  await waitFor(() => expect(surface.style.transform).toContain("rotateX("));
});
