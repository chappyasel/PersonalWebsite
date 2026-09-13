import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExerciseDetail } from "./ExerciseDetail";

const mocks = vi.hoisted(() => ({ index: vi.fn(), detail: vi.fn() }));
vi.mock("~/server/queries/weightliftingExercise", () => ({
  getCachedExerciseIndex: mocks.index,
  getFreshExerciseIndex: mocks.index,
  getCachedExerciseDetail: mocks.detail,
}));
vi.mock("./ExerciseHeader", () => ({
  ExerciseHeader: () => <p>Exercise header</p>,
}));
vi.mock("./ExerciseExplorer", () => ({
  ExerciseExplorer: ({ displayName }: { displayName: string }) => (
    <p>
      Exercise history
      {displayName ? ` with expandable ${displayName} analysis` : ""}
    </p>
  ),
}));

function exercise(displayName: string) {
  mocks.index.mockResolvedValue([
    {
      slug: "test-lift",
      displayName,
      name: "Barbell Bench Press",
      category: "Chest",
      setCount: 20,
      bestOneRM: 400,
    },
  ]);
  mocks.detail.mockResolvedValue({
    displayName,
    category: "Chest",
    instanceCount: 10,
    totalSets: 20,
    firstPerformed: "2020-01-01",
    lastPerformed: "2024-01-01",
    instances: [],
  });
}

describe("exercise detail Pareto integration", () => {
  beforeEach(() => vi.resetAllMocks());
  it("passes bench analysis to the explorer without adding a separate section", async () => {
    exercise("Flat Barbell Bench Press");
    const html = renderToStaticMarkup(
      await ExerciseDetail({ slug: "test-lift" }),
    );
    expect(html).not.toContain("Strength at bodyweight");
    expect(html).toContain("with expandable Flat Barbell Bench Press analysis");
    expect(html).toContain("Exercise history");
  });
  it("passes every variation to its own analysis without substituting bench data", async () => {
    exercise("Incline Barbell Bench Press");
    const html = renderToStaticMarkup(
      await ExerciseDetail({ slug: "test-lift" }),
    );
    expect(html).toContain(
      "with expandable Incline Barbell Bench Press analysis",
    );
    expect(html).toContain("Exercise history");
  });
});
