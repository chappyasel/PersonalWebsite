import { expect, it } from "vitest";

import { dayTime } from "./chart";
import { annualWeightAverage } from "./estimates";

it("averages only observed values inside twelve calendar months, including leap years", () => {
  const points = [
    ["2019-02-28", 100],
    ["2019-03-01", 110],
    ["2020-02-28", null],
    ["2020-02-29", 130],
    ["2020-03-01", 150],
    ["2020-03-02", null],
  ] as const;
  expect(
    annualWeightAverage(
      points.map(([date, weight]) => ({ time: dayTime(date), weight })),
    ),
  ).toEqual([100, 105, 110, 120, 140, null]);
});

it("leaves an empty trailing year blank and resumes with available readings", () => {
  const points = [
    ["2020-01-01", 100],
    ["2021-02-01", null],
    ["2021-03-01", 140],
  ] as const;
  expect(
    annualWeightAverage(
      points.map(([date, weight]) => ({ time: dayTime(date), weight })),
    ),
  ).toEqual([100, null, 140]);
});
