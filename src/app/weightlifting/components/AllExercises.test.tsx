// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AllExercises } from "./AllExercises";

const mocks = vi.hoisted(() => ({ directory: vi.fn(), occurrences: vi.fn() }));
vi.mock("~/trpc/react", () => ({
  api: {
    weightlifting: {
      getExerciseDirectory: { useQuery: mocks.directory },
      getExerciseOccurrences: { useQuery: mocks.occurrences },
    },
  },
}));
vi.mock("~/components/modal-sheet/SheetLink", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
beforeEach(() => {
  mocks.directory.mockReturnValue({
    data: [
      {
        displayName: "Walking",
        category: "Cardio",
        instanceCount: 50,
        lastPerformed: "2026-09-13T08:00",
        slug: "exercise~walking",
      },
      {
        displayName: "Bench Press",
        category: "Chest",
        instanceCount: 100,
        lastPerformed: "2026-09-12T08:00",
        slug: "bench-press",
      },
    ],
    isLoading: false,
    isError: false,
  });
  mocks.occurrences.mockReturnValue({
    data: {
      hasMore: false,
      instances: [
        {
          workoutUuid: "stable-workout",
          workoutName: "Morning Workout",
          ts: "2026-09-13T08:00",
          order: 0,
          style: "duration",
          sets: [
            {
              reps: null,
              weight: null,
              durationSeconds: 600,
              distance: null,
              calories: null,
              custom: null,
            },
          ],
        },
      ],
    },
    isLoading: false,
    isError: false,
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("links every row directly to its details modal without inline history", () => {
  render(<AllExercises />);
  expect(
    screen.getByRole("link", { name: /Walking/ }).getAttribute("href"),
  ).toBe("/weightlifting/exercise~walking");
  expect(
    screen.getByRole("link", { name: /Bench Press/ }).getAttribute("href"),
  ).toBe("/weightlifting/bench-press");
  expect(screen.queryByRole("button", { name: /Walking/ })).toBeNull();
  expect(mocks.occurrences).not.toHaveBeenCalled();
});
it("searches names and categories while preserving direct detail links", () => {
  render(<AllExercises />);
  fireEvent.change(screen.getByRole("textbox", { name: "Search exercises" }), {
    target: { value: "chest" },
  });
  expect(screen.queryByRole("link", { name: /Walking/ })).toBeNull();
  expect(
    screen.getByRole("link", { name: /Bench Press/ }).getAttribute("href"),
  ).toBe("/weightlifting/bench-press");
});

it("shows category colors in the filter and keeps the selected color visible", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  render(<AllExercises />);
  fireEvent.keyDown(
    screen.getByRole("combobox", { name: "Exercise category" }),
    { key: "ArrowDown" },
  );
  const option = screen.getByRole("option", { name: "Chest" });
  const dot = option.querySelector("[style]");
  expect(dot?.getAttribute("style")).toContain("background-color");
  fireEvent.click(option);
  await waitFor(() =>
    expect(
      screen
        .getByRole("combobox", { name: "Exercise category" })
        .querySelector("[style*=background-color]")
        ?.getAttribute("style"),
    ).toBe(dot?.getAttribute("style")),
  );
});
