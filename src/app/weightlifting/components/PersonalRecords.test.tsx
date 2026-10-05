// @vitest-environment jsdom
import { DEFAULT_EXERCISES } from "../lib/searchParams";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { PersonalRecords } from "./PersonalRecords";

const mocks = vi.hoisted(() => ({ records: vi.fn() }));
vi.mock("~/trpc/react", () => ({
  api: {
    weightlifting: { getPersonalRecords: { useQuery: mocks.records } },
  },
}));
vi.mock("~/components/modal-sheet/SheetLink", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const record = (
  exerciseName: string,
  bestOneRM: number,
  instanceCount: number,
  slug: string | null,
) => ({
  exerciseName,
  category: "Legs",
  bestOneRM,
  reps: 3,
  weight: 500,
  instanceCount,
  slug,
});

it("lists the default Deadlifts lift once, linked to its all-variations page", () => {
  mocks.records.mockReturnValue({
    data: [
      record("Back Squats", 600, 120, "back-squats"),
      record("Sumo Deadlifts", 535, 60, "sumo-deadlifts"),
      record("Conventional Deadlifts", 580, 90, "conventional-deadlifts"),
      record("Deadlifts", 580, 150, "all~deadlifts-abc123"),
    ],
    isLoading: false,
    isError: false,
  });
  render(<PersonalRecords selectedExercises={DEFAULT_EXERCISES} />);

  const rows = screen.getAllByRole("row").slice(1);
  expect(rows.map((row) => row.querySelector("a")?.textContent)).toEqual([
    "Back Squats",
    "Deadlifts",
  ]);
  expect(
    screen.getByRole("link", { name: /^Deadlifts$/ }).getAttribute("href"),
  ).toBe("/weightlifting/all~deadlifts-abc123");
  expect(rows[1]!.textContent).toContain("150 instances");
});
