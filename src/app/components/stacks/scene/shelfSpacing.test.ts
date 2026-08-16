import { describe, expect, it } from "vitest";

import {
  auditShelfSpacing,
  layoutShelfRow,
  splitShelfRows,
} from "./shelfSpacing";

describe("shelf spacing", () => {
  it("reports physical gaps after merging overlapping mesh spans", () => {
    const report = auditShelfSpacing(
      [
        { left: -1, right: -0.5 },
        { left: -0.7, right: -0.2 },
        { left: 0.2, right: 0.6 },
      ],
      { left: -1.2, right: 0.8 },
    );
    expect(report.occupied).toEqual([
      { left: -1, right: -0.2 },
      { left: 0.2, right: 0.6 },
    ]);
    expect(report.largestGap).toBeCloseTo(0.4);
    expect(report.coverage).toBeCloseTo(0.6);
  });

  it("spreads a row without violating its minimum air gap", () => {
    const row = layoutShelfRow(
      [
        { id: "a", halfWidth: 0.2 },
        { id: "b", halfWidth: 0.1 },
        { id: "c", halfWidth: 0.15 },
      ],
      { left: -1, right: 1 },
      { minGap: 0.08, gapWeights: [1, 2] },
    );
    expect(row[1]!.x - 0.1 - (row[0]!.x + 0.2)).toBeGreaterThanOrEqual(0.08);
    expect(row[2]!.x - 0.15 - (row[1]!.x + 0.1)).toBeGreaterThanOrEqual(0.08);
    expect(row[2]!.x + 0.15).toBeCloseTo(1);
  });

  it("refuses to solve by clipping neighbors", () => {
    expect(() =>
      layoutShelfRow(
        [
          { id: "a", halfWidth: 0.5 },
          { id: "b", halfWidth: 0.5 },
        ],
        { left: 0, right: 1 },
        { minGap: 0.05 },
      ),
    ).toThrow(/needs/);
  });

  it("supports contact gaps without giving them a share of the row air", () => {
    const row = layoutShelfRow(
      [
        { id: "leaning", halfWidth: 0.2 },
        { id: "support", halfWidth: 0.2 },
        { id: "spaced", halfWidth: 0.2 },
      ],
      { left: -0.8, right: 0.8 },
      { minGap: 0.08, minGaps: [0.004, 0.08], gapWeights: [0.01, 1] },
    );
    const contactGap = row[1]!.x - 0.2 - (row[0]!.x + 0.2);
    const displayGap = row[2]!.x - 0.2 - (row[1]!.x + 0.2);
    expect(contactGap).toBeLessThan(0.02);
    expect(displayGap).toBeGreaterThan(contactGap * 20);
  });

  it("caps two physical rows without throwing when source content grows", () => {
    const rows = splitShelfRows(Array.from({ length: 11 }, (_, i) => i), 4);
    expect(rows.top).toEqual([0, 1, 2, 3]);
    expect(rows.lower).toEqual([4, 5, 6, 7]);
    expect(rows.overflow).toEqual([8, 9, 10]);
  });
});
