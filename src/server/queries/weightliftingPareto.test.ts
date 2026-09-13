import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCachedWeightliftingPareto } from "./weightliftingPareto";

const mocks = vi.hoisted(() => ({ weights: vi.fn(), lifting: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/lib/weight-log/data", () => ({ getWeightLog: mocks.weights }));
vi.mock("~/lib/weightlifting/pareto/database", () => ({
  loadParetoAttempts: mocks.lifting,
}));

describe("weightlifting Pareto server boundary", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each([
    "Flat Barbell Bench Press",
    "Incline Barbell Bench Press",
    "Dumbbell Curls",
  ])(
    "analyzes %s without an allowlist and returns only the analysis DTO",
    async (displayName) => {
      mocks.weights.mockResolvedValue({
        importedAt: "2024-01-01T00:00:00Z",
        weeks: [
          {
            date: "2024-01-01",
            weights: [100, null, null, null, null, null, null],
          },
        ],
        historicalContext: { note: "sensitive context" },
        scans: [{ weight: 100 }],
      });
      mocks.lifting.mockResolvedValue({
        attempts: [
          {
            date: "2024-01-03",
            oneRM: 200,
            weight: 150,
            reps: 10,
            workoutUuid: "private-uuid",
          },
        ],
        liftingSyncedAt: null,
      });
      const payload = await getCachedWeightliftingPareto(displayName);
      expect(mocks.lifting).toHaveBeenCalledWith({}, displayName);
      expect(payload.displayFloor).toBe(
        displayName === "Flat Barbell Bench Press" ? 300 : 0,
      );
      expect(payload.evaluatedCount).toBe(1);
      expect(payload.unestimatedCount).toBe(0);
      expect(payload.latest).toMatchObject({
        confidence: "low",
        method: "carried",
      });
      expect(JSON.stringify(payload)).not.toMatch(
        /sensitive context|private-uuid|historicalContext|scans|weeks/,
      );
    },
  );
  it("returns a generic error when storage fails instead of leaking provider details", async () => {
    mocks.weights.mockRejectedValue(
      new Error("sensitive storage path and credential"),
    );
    mocks.lifting.mockResolvedValue({ attempts: [], liftingSyncedAt: null });
    await expect(
      getCachedWeightliftingPareto("Flat Barbell Bench Press"),
    ).rejects.toThrow("Bodyweight analysis is temporarily unavailable");
  });
  it("does not return a misleading partial payload when there are no actual weights", async () => {
    mocks.weights.mockResolvedValue({ weeks: [] });
    mocks.lifting.mockResolvedValue({
      attempts: [{ date: "2024-01-03", oneRM: 200 }],
      liftingSyncedAt: null,
    });
    await expect(
      getCachedWeightliftingPareto("Flat Barbell Bench Press"),
    ).rejects.toThrow("temporarily unavailable");
  });
});
