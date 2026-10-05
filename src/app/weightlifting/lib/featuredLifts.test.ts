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
  const list = withBaseNameLifts(
    [
      exercise("Back Squats", "Squats", 900, 600),
      exercise("Conventional Deadlifts", "Deadlifts", 250, 580),
      exercise("Sumo Deadlifts", "Deadlifts", 200, 535),
      exercise("Romanian Deadlifts", "Deadlifts", 30, 262),
      exercise("Flat Barbell Bench Press", "Barbell Bench Press", 2000, 500),
      exercise("Incline Barbell Bench Press", "Barbell Bench Press", 800, 393),
    ],
    10,
  );
  // The lift sorts above the variation it ties
  expect(list.map((e) => e.displayName)).toEqual([
    "Back Squats",
    "Deadlifts",
    "Conventional Deadlifts",
    "Sumo Deadlifts",
    "Flat Barbell Bench Press",
    "Incline Barbell Bench Press",
    "Romanian Deadlifts",
  ]);
  expect(list[1]).toEqual(exercise("Deadlifts", "Deadlifts", 480, 580));
});

it("counts a rare variation toward the lift without listing it", () => {
  const list = withBaseNameLifts(
    [
      exercise("Trap Bar Deadlifts", "Deadlifts", 5, 600),
      exercise("Sumo Deadlifts", "Deadlifts", 200, 535),
    ],
    10,
  );
  expect(list).toEqual([
    exercise("Deadlifts", "Deadlifts", 205, 600),
    exercise("Sumo Deadlifts", "Deadlifts", 200, 535),
  ]);
});

it("lists the lift once its variations reach the threshold together", () => {
  const rare = [
    exercise("Sumo Deadlifts", "Deadlifts", 4, 535),
    exercise("Romanian Deadlifts", "Deadlifts", 4, 262),
  ];
  expect(withBaseNameLifts(rare, 8)).toEqual([
    exercise("Deadlifts", "Deadlifts", 8, 535),
  ]);
  expect(withBaseNameLifts(rare, 10)).toEqual([]);
});

it("folds a variation-less row of the same name into the lift", () => {
  const list = withBaseNameLifts(
    [
      exercise("Deadlifts", "Deadlifts", 40, 400, "Back"),
      exercise("Sumo Deadlifts", "Deadlifts", 200, 535),
    ],
    10,
  );
  expect(list).toEqual([
    exercise("Deadlifts", "Deadlifts", 240, 535),
    exercise("Sumo Deadlifts", "Deadlifts", 200, 535),
  ]);
});

it("adds nothing when the lift has no variations", () => {
  const squats = exercise("Back Squats", "Squats", 900, 600);
  expect(withBaseNameLifts([squats], 10)).toEqual([squats]);
});
