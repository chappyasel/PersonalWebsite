// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { StrengthProgressionChart } from "./StrengthProgressionChart";

const mocks = vi.hoisted(() => ({
  topExercises: vi.fn(),
  progression: vi.fn(),
}));
vi.mock("~/trpc/react", () => ({
  api: {
    weightlifting: {
      getTopExercises: { useQuery: mocks.topExercises },
      getStrengthProgression: { useQuery: mocks.progression },
    },
  },
}));
vi.mock("nuqs", () => ({
  useQueryStates: () => [{ mode: "pr", range: 0 }, vi.fn()],
}));
vi.mock("../hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));

const lift = (displayName: string, category: string, bestOneRM: number) => ({
  displayName,
  name: displayName.replace(/^\S+ /, ""),
  category,
  setCount: 100,
  bestOneRM,
});

beforeEach(() => {
  mocks.topExercises.mockReturnValue({
    data: [
      lift("Back Squats", "Legs", 600),
      { ...lift("Deadlifts", "Back", 580), name: "Deadlifts" },
      lift("Conventional Deadlifts", "Back", 580),
      lift("Sumo Deadlifts", "Legs", 535),
      lift("Flat Barbell Bench Press", "Chest", 500),
    ],
    isLoading: false,
    isError: false,
  });
  mocks.progression.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const pillLabels = () =>
  screen
    .getAllByRole("button")
    .map((button) => button.textContent ?? "")
    .filter((label) => /Deadlifts|Squats|Bench/.test(label));

it("keeps the Sumo Deadlifts pill distinct from the Deadlifts pill", () => {
  render(
    <StrengthProgressionChart
      selectedExercises={[
        "Deadlifts",
        "Sumo Deadlifts",
        "Back Squats",
        "Flat Barbell Bench Press",
      ]}
      setSelectedExercises={vi.fn()}
    />,
  );
  // Desktop and mobile rows both render; each lists the four lifts once
  expect(pillLabels()).toEqual([
    "Deadlifts",
    "Sumo Deadlifts",
    "Squats",
    "Bench",
    "Deadlifts",
    "Sumo Deadlifts",
    "Squats",
    "Bench",
  ]);
});

it("offers the whole Deadlifts lift in the picker beside single variations", () => {
  const setSelected = vi.fn();
  render(
    <StrengthProgressionChart
      selectedExercises={["Back Squats"]}
      setSelectedExercises={setSelected}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  const options = screen
    .getByPlaceholderText("Search exercises...")
    .closest("div")!.parentElement!;
  fireEvent.change(screen.getByPlaceholderText("Search exercises..."), {
    target: { value: "deadlifts" },
  });
  const names = within(options)
    .getAllByRole("button")
    .map((b) => b.querySelector(".truncate")?.textContent);
  expect(names).toEqual([
    "Deadlifts",
    "Conventional Deadlifts",
    "Sumo Deadlifts",
  ]);

  fireEvent.click(within(options).getAllByRole("button")[0]!);
  const update = setSelected.mock.calls[0]![0] as (prev: string[]) => string[];
  expect(update(["Back Squats"])).toEqual(["Back Squats", "Deadlifts"]);
});
