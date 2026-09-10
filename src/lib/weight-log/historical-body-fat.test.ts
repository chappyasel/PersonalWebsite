import { describe, expect, it } from "vitest";

import { fitHistoricalBodyFat, historicalBodyFat } from "./historical-body-fat";
import {
  type HistoricalContext,
  type WeightLog,
  historicalContextSchema,
} from "./schema";

const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
const context: HistoricalContext = {
  anchor: {
    date: "2020-01-01",
    bodyFatLow: 20,
    bodyFatHigh: 30,
    note: "Synthetic approximate recollection.",
  },
  strength: [],
};
const scans: WeightLog["scans"] = [
  {
    date: "2024-01-01",
    weight: 100,
    leanMass: null,
    fatMass: 10,
    bodyFatPercent: 10,
  },
];
const points = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((year) => ({
  time: time(`${year}-01-01`),
  trailing: 100,
  projectedWeight: 200,
}));

describe("recollection-to-DEXA reconstruction", () => {
  it("requires a recollection with a matching weight before a usable scan", () => {
    expect(fitHistoricalBodyFat(scans)).toBeNull();
    expect(fitHistoricalBodyFat([], context)).toBeNull();
    expect(
      fitHistoricalBodyFat([{ ...scans[0]!, date: "2019-01-01" }], context),
    ).toBeNull();
    expect(
      historicalBodyFat(
        points.filter((p) => p.time !== time(context.anchor.date)),
        fitHistoricalBodyFat(scans, context),
      ).every((p) => p.bodyFatHistorical === null),
    ).toBe(true);
    expect(
      historicalBodyFat(points, null).every(
        (p) => p.bodyFatHistorical === null,
      ),
    ).toBe(true);
  });

  it("matches the recollection range, reaches the reported DEXA, and allows different composition at equal weights", () => {
    const values = historicalBodyFat(
      points,
      fitHistoricalBodyFat(scans, context),
    );
    expect(values[1]!.bodyFatHistorical).toBeCloseTo(25);
    expect(values[1]!.bodyFatHistoricalRange![0]).toBeCloseTo(20);
    expect(values[1]!.bodyFatHistoricalRange![1]).toBeCloseTo(30);
    expect(values[2]!.bodyFatHistorical).toBeLessThan(25);
    expect(values[3]!.bodyFatHistorical).toBeLessThan(
      values[2]!.bodyFatHistorical!,
    );
    expect(values[5]!.bodyFatHistorical).toBeCloseTo(10);
    expect(values[5]!.bodyFatHistoricalRange![0]).toBeCloseTo(8);
    expect(values[5]!.bodyFatHistoricalRange![1]).toBeCloseTo(12);
    expect(values[0]!.bodyFatHistorical).toBeNull();
    expect(values[6]!.bodyFatHistorical).toBeNull();
  });

  it("uses comparable strength progress to change timing without changing either composition anchor", () => {
    const strength = (fast: boolean) =>
      [2020, 2021, 2022, 2023, 2024].flatMap((year, index) =>
        ["Upper", "Lower"].flatMap((lift) =>
          [1, 7, 14].map((day) => ({
            date: `${year}-01-${String(day).padStart(2, "0")}`,
            lift,
            value: fast
              ? [100, 180, 190, 195, 200][index]!
              : [100, 105, 110, 120, 200][index]!,
          })),
        ),
      );
    const fast = historicalBodyFat(
      points,
      fitHistoricalBodyFat(scans, { ...context, strength: strength(true) }),
    );
    const slow = historicalBodyFat(
      points,
      fitHistoricalBodyFat(scans, { ...context, strength: strength(false) }),
    );
    expect(fast[2]!.bodyFatHistorical).toBeLessThan(
      slow[2]!.bodyFatHistorical!,
    );
    expect(fast[1]).toEqual(slow[1]);
    expect(fast[5]).toEqual(slow[5]);
    expect(fast[2]!.bodyFatHistoricalRange).not.toEqual(
      slow[2]!.bodyFatHistoricalRange,
    );
    for (const p of fast.filter((p) => p.bodyFatHistorical !== null)) {
      expect(p.bodyFatHistoricalRange![0]).toBeLessThanOrEqual(
        p.bodyFatHistorical!,
      );
      expect(p.bodyFatHistoricalRange![1]).toBeGreaterThanOrEqual(
        p.bodyFatHistorical!,
      );
    }
  });

  it("lets bulk timing influence the interior while preserving both anchors", () => {
    const weighted = points.map((p, i) => ({
      ...p,
      trailing: [100, 100, 120, 110, 120, 100, 100][i]!,
    }));
    const phase: WeightLog["phases"][number] = {
      id: "bulk",
      label: "Synthetic bulk",
      kind: "bulk",
      start: "2020-01-01",
      end: "2021-01-01",
    };
    const bulk = historicalBodyFat(
      weighted,
      fitHistoricalBodyFat(scans, context, [phase]),
    );
    const calendar = historicalBodyFat(
      weighted,
      fitHistoricalBodyFat(scans, context),
    );
    expect(bulk[2]!.bodyFatHistorical).not.toBe(calendar[2]!.bodyFatHistorical);
    expect(bulk[1]).toEqual(calendar[1]);
    expect(bulk[5]).toEqual(calendar[5]);
  });

  it("tapers the scale offset toward the scan and preserves long gaps and impossible estimates", () => {
    const adjusted = points.map((p, i) => ({
      ...p,
      trailing: i === 2 ? null : i === 3 ? 1 : i === 5 ? 95 : p.trailing,
    }));
    const values = historicalBodyFat(
      adjusted,
      fitHistoricalBodyFat(scans, context),
    );
    expect(values[1]!.bodyFatHistorical).toBeCloseTo(25);
    expect(values[5]!.bodyFatHistorical).toBeCloseTo(10);
    expect(values[2]!.bodyFatHistorical).toBeNull();
    expect(values[3]!.bodyFatHistorical).toBeNull();
    expect(values[6]!.bodyFatHistorical).toBeNull();
  });

  it("validates private assumptions rather than accepting reversed ranges or invalid performance", () => {
    expect(historicalContextSchema.safeParse(context).success).toBe(true);
    expect(
      historicalContextSchema.safeParse({
        ...context,
        anchor: { ...context.anchor, bodyFatLow: 40 },
      }).success,
    ).toBe(false);
    expect(
      historicalContextSchema.safeParse({
        ...context,
        strength: [{ date: "2020-01-01", lift: "Upper", value: -1 }],
      }).success,
    ).toBe(false);
  });
});
