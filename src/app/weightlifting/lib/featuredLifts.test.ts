import { expect, it } from "vitest";

import { withBaseNameLifts } from "./featuredLifts";

const exercise = (
  displayName: string,
  name: string,
  setCount: number,
  bestOneRM: number,
  category = "Legs",
) => ({ displayName, name, category, setCount, bestOneRM });

it("adds one Deadlifts entry across every variation and keeps the variations", () => {
  const list = withBaseNameLifts([
    exercise("Back Squats", "Squats", 900, 600),
    exercise("Conventional Deadlifts", "Deadlifts", 250, 580),
    exercise("Sumo Deadlifts", "Deadlifts", 200, 535),
    exercise("Romanian Deadlifts", "Deadlifts", 30, 262),
    exercise("Flat Barbell Bench Press", "Barbell Bench Press", 2000, 500),
    exercise("Incline Barbell Bench Press", "Barbell Bench Press", 800, 393),
  ]);
  expect(list.map((e) => e.displayName)).toEqual([
    "Back Squats",
    "Conventional Deadlifts",
    "Deadlifts",
    "Sumo Deadlifts",
    "Flat Barbell Bench Press",
    "Incline Barbell Bench Press",
    "Romanian Deadlifts",
  ]);
  expect(list.find((e) => e.displayName === "Deadlifts")).toEqual(
    exercise("Deadlifts", "Deadlifts", 480, 580),
  );
});

it("folds a variation-less row of the same name into the lift", () => {
  const list = withBaseNameLifts([
    exercise("Deadlifts", "Deadlifts", 40, 400, "Back"),
    exercise("Sumo Deadlifts", "Deadlifts", 200, 535),
  ]);
  expect(list).toEqual([
    exercise("Sumo Deadlifts", "Deadlifts", 200, 535),
    exercise("Deadlifts", "Deadlifts", 240, 535),
  ]);
});

it("adds nothing when no variation qualifies for the picker", () => {
  const squats = exercise("Back Squats", "Squats", 900, 600);
  expect(withBaseNameLifts([squats])).toEqual([squats]);
});
