import { describe, expect, it } from "vitest";

import { paretoAxes } from "./axes";

describe("Pareto axis bounds and grid spacing", () => {
  it("fits a bench-sized cloud with 5 lb bodyweight and 25 lb strength labels", () => {
    const axes = paretoAxes(
      [
        { bodyweight: 188.9, oneRM: 300, frontier: true },
        { bodyweight: 223.7, oneRM: 500, frontier: true },
      ],
      300,
    );
    expect(axes.x.domain).toEqual([185, 225]);
    expect(axes.x.majorTicks).toEqual([
      185, 190, 195, 200, 205, 210, 215, 220, 225,
    ]);
    expect(axes.y.domain).toEqual([300, 525]);
    expect(axes.y.majorStep).toBe(25);
    expect(axes.x.minorTicks).toContain(191);
    expect(axes.y.minorTicks).toContain(305);
    expect(axes.x.minorTicks).not.toContain(190);
    expect(axes.y.minorTicks).not.toContain(325);
  });
  it("fits the full frontier without forcing the axis down to zero", () => {
    const axes = paretoAxes(
      [
        { bodyweight: 190, oneRM: 110, frontier: true },
        { bodyweight: 220, oneRM: 500, frontier: true },
      ],
      0,
    );
    expect(axes.y.domain).toEqual([50, 550]);
    expect(axes.y.majorStep).toBe(50);
  });
  it("leaves space around a single coordinate and never creates a zero-width domain", () => {
    const axes = paretoAxes(
      [{ bodyweight: 200, oneRM: 400, frontier: true }],
      300,
    );
    expect(axes.x.domain).toEqual([195, 205]);
    expect(axes.y.domain).toEqual([395, 405]);
  });
  it("expands horizontal space for long bodyweight histories while keeping every 5 lb label", () => {
    const axes = paretoAxes(
      [
        { bodyweight: 120, oneRM: 100, frontier: true },
        { bodyweight: 250, oneRM: 700, frontier: true },
      ],
      0,
    );
    expect(axes.minWidth).toBeGreaterThan(900);
    expect(
      axes.x.majorTicks.every((tick, i, all) => {
        const previous = all[i - 1];
        return previous === undefined || tick - previous === 5;
      }),
    ).toBe(true);
    expect(axes.y.majorTicks.length).toBeLessThanOrEqual(11);
  });
  it("ignores weak attempts and a weak latest set when fitting the strength axis", () => {
    const frontier = [
      { bodyweight: 192, oneRM: 158, frontier: true },
      { bodyweight: 222, oneRM: 170, frontier: true },
    ];
    const axes = paretoAxes(
      [
        ...frontier,
        { bodyweight: 194, oneRM: 25, frontier: false },
        { bodyweight: 217, oneRM: 148, frontier: false },
      ],
      0,
    );
    expect(axes.y).toEqual(paretoAxes(frontier, 0).y);
    expect(axes.y.domain).toEqual([155, 175]);
    expect(axes.y.majorTicks).toEqual([155, 160, 165, 170, 175]);
    expect(axes.y.minorTicks).toContain(156);
  });
  it("does not silently fit non-frontier points when the frontier is missing", () => {
    expect(() =>
      paretoAxes([{ bodyweight: 200, oneRM: 100, frontier: false }], 0),
    ).toThrow(/frontier/);
  });
  it("requires a visible point instead of inventing bounds for an empty chart", () => {
    expect(() => paretoAxes([], 300)).toThrow();
  });
});
