import { readFile } from "node:fs/promises";
import { createLoader } from "nuqs/server";
import { describe, expect, it, vi } from "vitest";

import {
  type WeightliftingExerciseRow,
  searchWeightliftingExercises,
  serializeExerciseDestination,
} from "./weightlifting";
import { wlSearchParams } from "~/app/weightlifting/lib/searchParams";

describe("weightlifting search", () => {
  it("uses the chart-selectable corpus and caps ranked destinations", async () => {
    const rows: WeightliftingExerciseRow[] = [
      {
        displayName: "Incline Barbell Bench Press",
        name: "Barbell Bench Press",
        category: "Chest",
        setCount: 40,
        bestOneRM: 225,
      },
      {
        displayName: "Back Squats",
        name: "Squats",
        category: "Legs",
        setCount: 50,
        bestOneRM: 350,
      },
    ];
    const load = vi.fn(async () => rows);

    const results = await searchWeightliftingExercises("bench", {
      load,
      location: new URL("https://www.chappyasel.com"),
    });

    expect(load).toHaveBeenCalledWith(10, expect.any(AbortSignal));
    expect(results).toHaveLength(1);
    expect(results[0]?.href).toContain("https://weightlifting.chappyasel.com/");
  });

  it("round-trips exercise names through the shared nuqs parser", () => {
    const href = serializeExerciseDestination(
      "Incline Bench, Paused",
      new URL("http://books.localhost:4310"),
    );
    const parsed = createLoader(wlSearchParams)(href);

    expect(href).toMatch(/^http:\/\/weightlifting\.localhost:4310\//);
    expect(parsed.exercises).toEqual(["Incline Bench, Paused"]);
  });

  it("keeps exercise destinations inside a preview deployment", () => {
    expect(
      serializeExerciseDestination(
        "Bench Press",
        new URL("https://personal-website.vercel.app"),
      ),
    ).toMatch(/^https:\/\/personal-website\.vercel\.app\/weightlifting\//);
  });

  it("shares the chart corpus and its bounded database query", async () => {
    const querySource = await readFile(
      new URL(
        "../../../server/queries/weightliftingExercises.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const routerSource = await readFile(
      new URL("../../../server/api/routers/weightlifting.ts", import.meta.url),
      "utf8",
    );

    expect(querySource).toContain("SET LOCAL statement_timeout = '8000ms'");
    expect(querySource).toContain("s.one_rm > 0");
    expect(querySource).toContain("e.style = 'reps_weight'");
    expect(querySource).toContain("HAVING COUNT(s.id) >= ${minSets}");
    expect(routerSource).toContain(
      "getChartSelectableExercises(input.minSets)",
    );
  });
});
