// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import Weightlifting from "./Weightlifting";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

vi.mock("./TiltCard", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

afterEach(cleanup);

const activity = {
  months: 12,
  startDate: "2023-04-01",
  endDate: "2024-03-15",
  days: [
    {
      date: "2024-02-29",
      workoutCount: 1,
      durationSeconds: 1200,
      setCount: 3,
      volume: 0,
      categories: { Cardio: 1 },
    },
  ],
  activeDays: 1,
  totalWorkouts: 1,
  maxVolume: 0,
  topCategory: "Cardio",
};
const data = {
  latestWorkout: null,
  stats: {
    totalWorkouts: 1,
    totalSets: 3,
    totalVolume: 0,
    totalDurationSeconds: 1200,
    earliestWorkout: "2024-02-29",
  },
  yearly: [],
  records: [],
};

it("titles a record with its exercise name and shows when it was achieved", () => {
  render(
    <Weightlifting
      activity={activity}
      data={{
        ...data,
        records: [
          {
            key: "bench",
            label: "Bench",
            exerciseName: "Flat Barbell Bench Press",
            category: "Chest",
            bestOneRM: 315,
            reps: 5,
            weight: 275,
            achievedDate: "2026-09-01",
          },
        ],
      }}
    />,
  );
  const name = screen.getByText("Flat Barbell Bench Press");
  expect(name.tagName).toBe("STRONG");
  const exerciseLink = name.closest("a");
  expect(exerciseLink?.getAttribute("href")).toBe(
    "/weightlifting/flat-barbell-bench-press",
  );
  expect(exerciseLink?.getAttribute("data-route-transition")).toBe("preserve");
  expect(exerciseLink?.parentElement?.closest("a")).toBeNull();
  expect(screen.queryByText("Bench")).toBeNull();
  expect(name.nextElementSibling?.textContent).toBe("Sep 1, 2026");
  expect(name.nextElementSibling?.querySelector("time")?.dateTime).toBe(
    "2026-09-01",
  );
  expect(screen.getByText("315 lbs")).toBeTruthy();
  expect(screen.getByText("5 × 275")).toBeTruthy();
});

it("shows twelve named calendar months with real weekday positions and leap days", () => {
  render(<Weightlifting activity={activity} data={data} />);
  const months = screen.getAllByRole("group", { name: /20\d\d$/ });
  expect(months).toHaveLength(12);
  expect(months[0]?.getAttribute("aria-label")).toBe("April 2023");
  expect(months.at(-1)?.getAttribute("aria-label")).toBe("March 2024");
  const february = screen.getByRole("group", { name: "February 2024" });
  expect(within(february).getByText("Feb '24")).toBeTruthy();
  expect(
    within(february).queryAllByText(
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/,
    ),
  ).toHaveLength(0);
  expect(february.querySelectorAll("[data-date]")).toHaveLength(29);
  const leapDay = february.querySelector('[data-date="2024-02-29"]')!;
  expect(leapDay instanceof HTMLElement ? leapDay.style.gridColumn : null).toBe(
    "4",
  );
  expect(leapDay.getAttribute("aria-label")).toContain("Cardio 1");
  expect(leapDay.textContent).toBe("29");
  expect(leapDay.classList.contains("rounded-full")).toBe(true);
  expect(leapDay instanceof HTMLElement ? leapDay.style.gridRow : null).toBe(
    "5",
  );
  expect(leapDay.getAttribute("aria-label")).not.toContain("Rest");
  const march = screen.getByRole("group", { name: "March 2024" });
  expect(march.querySelectorAll("[data-date]")).toHaveLength(31);
  expect(
    march.querySelector('[data-date="2024-03-01"]')?.getAttribute("style"),
  ).toContain("grid-column: 5");
  expect(
    march.querySelector('[data-date="2024-03-16"]')?.getAttribute("aria-label"),
  ).toContain("Upcoming");
});

it("lets keyboard users inspect a workout with zero lifted weight", async () => {
  render(<Weightlifting activity={activity} data={data} />);
  const workout = screen.getByRole("button", {
    name: /February 29, 2024:.*Cardio 1/,
  });
  expect(workout.tabIndex).toBe(0);
  fireEvent.focus(workout);
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip.textContent).toContain("Feb 29, 2024");
  expect(tooltip.textContent).toContain("1 workout · 0 lbs lifted");
  expect(tooltip.textContent).toContain("Cardio ×1");
  expect(tooltip.querySelector(".text-muted-foreground")).toBeNull();
});

it("distinguishes unavailable history from a calendar with no workouts", () => {
  render(
    <Weightlifting
      activity={{ ...activity, startDate: null, endDate: null, days: [] }}
      data={data}
    />,
  );
  expect(screen.getByText("Workout history is unavailable.")).toBeTruthy();
  expect(screen.queryAllByRole("group", { name: /20\d\d$/ })).toHaveLength(0);
});

it("keeps the parked latest-workout card hidden even when data is available", () => {
  render(
    <Weightlifting
      activity={activity}
      data={{
        ...data,
        latestWorkout: {
          uuid: "latest-session",
          name: "Morning Workout",
          date: "2026-09-13",
          durationSeconds: 4500,
          setCount: 18,
          volume: 24000,
          categories: ["Chest", "Triceps"],
          supersets: [[0, 1]],
          exercises: [
            {
              order: 0,
              displayName: "Flat Barbell Bench Press",
              category: "Chest",
              style: "reps_weight",
              sets: [
                {
                  reps: 10,
                  weight: 185,
                  volume: 1850,
                  durationSeconds: null,
                  distance: null,
                  calories: null,
                  custom: null,
                },
              ],
            },
            {
              order: 1,
              displayName: "Triceps Extensions",
              category: "Triceps",
              style: "reps_weight",
              sets: [
                {
                  reps: 12,
                  weight: 55,
                  volume: 660,
                  durationSeconds: null,
                  distance: null,
                  calories: null,
                  custom: null,
                },
              ],
            },
          ],
        },
      }}
    />,
  );
  expect(
    screen.queryByRole("link", {
      name: "View last workout: Morning Workout, 2026-09-13",
    }),
  ).toBeNull();
  expect(screen.queryByText("Last workout")).toBeNull();
});
