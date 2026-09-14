// @vitest-environment jsdom
import { LIVED_PLACES, VISITED_PLACES } from "../scene/aboutTravel";
import { globeChapterHover } from "../scene/globeChapterHover";
import { act, cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import GlobeChapterLabel from "./GlobeChapterLabel";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  globeChapterHover.set(null);
  vi.useRealTimers();
});

it("names only the highest-tier chapter and counts the nearby chapters", () => {
  globeChapterHover.set({
    kind: "chapter",
    index: 0,
    x: 200,
    y: 200,
    chapters: [
      {
        id: "sf",
        name: "San Francisco",
        emoji: "🌉",
        tier: "Silver",
        lat: 37.77,
        lon: -122.42,
      },
      {
        id: "bay",
        name: "Bay Area",
        emoji: "🌁",
        tier: "Diamond",
        lat: 37.77,
        lon: -122.42,
      },
    ],
  });
  render(<GlobeChapterLabel />);
  act(() => {
    vi.advanceTimersByTime(0);
  });
  act(() => {
    vi.advanceTimersByTime(40);
  });
  expect(screen.getByRole("status").textContent).toContain("🌁 Bay Area");
  expect(screen.queryByText(/San Francisco/)).toBeNull();
  expect(screen.getByText("+1 more nearby")).toBeTruthy();
  expect(screen.getByText("View chapters")).toBeTruthy();
  expect(screen.getByText("The AI Collective")).toBeTruthy();
  act(() => globeChapterHover.set(null));
  act(() => {
    vi.advanceTimersByTime(420);
  });
  expect(screen.queryByRole("status")).toBeNull();
});

const mark = {
  kind: "chapter" as const,
  index: 0,
  x: 200,
  y: 200,
  chapters: [{ id: "sf", name: "San Francisco", lat: 37.77, lon: -122.42 }],
};

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

it("paints a transparent entrance and keeps the label mounted through its exit", () => {
  globeChapterHover.set(mark);
  const { container } = render(<GlobeChapterLabel />);
  tick(0);
  const label = container.querySelector<HTMLElement>(
    "[data-stacks-globe-label]",
  )!;
  expect(label.style.getPropertyValue("--portal-label-opacity")).toBe("0");
  tick(40);
  expect(label.style.getPropertyValue("--portal-label-opacity")).toBe("1");
  act(() => globeChapterHover.set(null));
  expect(label.style.getPropertyValue("--portal-label-opacity")).toBe("0");
  tick(320);
  expect(label.isConnected).toBe(true);
  tick(100);
  expect(label.isConnected).toBe(false);
});

it("finishes fading the old city before replacing it and tolerates moving coordinates", () => {
  globeChapterHover.set(mark);
  render(<GlobeChapterLabel />);
  tick(0);
  tick(40);
  act(() =>
    globeChapterHover.set({
      ...mark,
      index: 1,
      chapters: [{ ...mark.chapters[0]!, id: "nyc", name: "New York" }],
    }),
  );
  tick(200);
  act(() => globeChapterHover.set({ ...globeChapterHover.current!, x: 210 }));
  expect(screen.getByText("San Francisco")).toBeTruthy();
  expect(screen.queryByText("New York")).toBeNull();
  tick(140);
  expect(screen.getByText("New York")).toBeTruthy();
  tick(40);
  expect(
    screen.getByRole("status").style.getPropertyValue("--portal-label-opacity"),
  ).toBe("1");
});

it("cancels a pending removal when the pointer returns", () => {
  globeChapterHover.set(mark);
  render(<GlobeChapterLabel />);
  tick(0);
  tick(40);
  act(() => globeChapterHover.set(null));
  tick(200);
  act(() => globeChapterHover.set(mark));
  tick(0);
  tick(440);
  expect(
    screen.getByRole("status").style.getPropertyValue("--portal-label-opacity"),
  ).toBe("1");
});

it.each(VISITED_PLACES)("shows the country flag for $name", (place) => {
  globeChapterHover.set({ kind: "visited", index: 0, x: 200, y: 200, place });
  render(<GlobeChapterLabel />);
  tick(0);
  tick(40);
  expect(screen.getByText(`${place.flag} ${place.name}`)).toBeTruthy();
  expect(screen.queryByText(/View chapter/)).toBeNull();
});

it.each(LIVED_PLACES)("shows a home beside $name", (place) => {
  globeChapterHover.set({ kind: "lived", index: 0, x: 200, y: 200, place });
  render(<GlobeChapterLabel />);
  tick(0);
  tick(40);
  expect(screen.getByText(`🏡 ${place.name}`)).toBeTruthy();
});

it("counts every additional chapter without listing their names", () => {
  globeChapterHover.set({
    ...mark,
    chapters: Array.from({ length: 11 }, (_, index) => ({
      ...mark.chapters[0]!,
      id: `chapter-${index}`,
      name: `City ${index}`,
      tier: index === 8 ? "Gold" : null,
    })),
  });
  render(<GlobeChapterLabel />);
  tick(0);
  tick(40);
  expect(screen.getByText("City 8")).toBeTruthy();
  expect(screen.getByText("+10 more nearby")).toBeTruthy();
  expect(screen.queryByText("City 0")).toBeNull();
});

it("omits the nearby count for a single chapter", () => {
  globeChapterHover.set(mark);
  render(<GlobeChapterLabel />);
  tick(0);
  tick(40);
  expect(screen.getByText("San Francisco")).toBeTruthy();
  expect(screen.queryByText(/more nearby/)).toBeNull();
  expect(screen.getByText("View chapter")).toBeTruthy();
});
