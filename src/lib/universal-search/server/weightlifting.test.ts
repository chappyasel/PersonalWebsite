import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import {
  type WeightliftingExerciseRow,
  searchWeightliftingExercises,
} from "./weightlifting";

const rows: WeightliftingExerciseRow[] = [
  {
    slug: "incline-barbell-bench-press",
    displayName: "Incline Barbell Bench Press",
    name: "Barbell Bench Press",
    category: "Chest",
    setCount: 40,
    bestOneRM: 225,
  },
  {
    slug: "back-squats",
    displayName: "Back Squats",
    name: "Squats",
    category: "Legs",
    setCount: 50,
    bestOneRM: 350,
  },
];

describe("weightlifting search", () => {
  it("links ranked exercises to their own pages with category details", async () => {
    const load = vi.fn(async () => rows);

    const results = await searchWeightliftingExercises("bench", {
      load,
      location: new URL("https://www.chappyasel.com"),
    });

    expect(load).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(results).toHaveLength(1);
    expect(results[0]?.href).toBe(
      "https://weightlifting.chappyasel.com/incline-barbell-bench-press",
    );
    expect(results[0]?.description).toBe("Chest · 225 lbs est. 1RM");
    expect(results[0]?.accentColor).toBe("#039BE5");
  });

  it("keeps exercise destinations inside a preview deployment", async () => {
    const results = await searchWeightliftingExercises("squat", {
      load: async () => rows,
      location: new URL("https://personal-website.vercel.app"),
    });

    expect(results[0]?.href).toBe(
      "https://personal-website.vercel.app/weightlifting/back-squats",
    );
  });

  it("maps subdomain-local development hosts onto the weightlifting host", async () => {
    const results = await searchWeightliftingExercises("squat", {
      load: async () => rows,
      location: new URL("http://books.localhost:4310"),
    });

    expect(results[0]?.href).toBe(
      "http://weightlifting.localhost:4310/back-squats",
    );
  });

  it("shares the exercise-page index and its bounded database query", async () => {
    const querySource = await readFile(
      new URL(
        "../../../server/queries/weightliftingExercises.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const indexSource = await readFile(
      new URL(
        "../../../server/queries/weightliftingExercise.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(querySource).toContain("SET LOCAL statement_timeout = '8000ms'");
    expect(querySource).toContain("s.one_rm > 0");
    expect(querySource).toContain("e.style = 'reps_weight'");
    expect(querySource).toContain("HAVING COUNT(s.id) >= ${minSets}");
    expect(indexSource).toContain("buildSlugMap");
  });
});
