import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWeightLog } from "./data";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  load: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.get }) }));
vi.mock("~/server/db", () => ({ db: { synthetic: true } }));
vi.mock("./database", () => ({ loadWeightLogRecords: mocks.load }));

const empty = {
  weighIns: [],
  phases: [],
  plannedWeeks: [],
  setPoints: [],
  scans: [],
  recollections: [],
  strength: [],
};

describe("weight log server data boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds the chart from the database without an access cookie", async () => {
    mocks.load.mockResolvedValue({
      ...empty,
      weighIns: [
        {
          date: "2030-01-07",
          pounds: 150,
          excluded: false,
          updatedAt: new Date("2030-01-07T08:00:00Z"),
        },
      ],
      phases: [{ id: 1, kind: "cut", startDate: "2030-01-07", endDate: null }],
      plannedWeeks: [
        {
          weekStart: "2030-01-07",
          phaseId: 1,
          target: 149,
          originalTarget: 149,
        },
      ],
    });
    const log = await getWeightLog();
    expect(mocks.load).toHaveBeenCalledWith({ synthetic: true });
    expect(log.phases[0]!.label).toBe("Cut Jan '30 - Jan '30");
    expect(log.weeks[0]!.weights[0]).toBe(150);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("propagates a database failure instead of returning an empty chart", async () => {
    mocks.load.mockRejectedValue(new Error("synthetic outage"));
    await expect(getWeightLog()).rejects.toThrow("synthetic outage");
  });
});
