import { describe, expect, it } from "vitest";

import {
  nextPlacardToPrepare,
  placardPreparationOrder,
} from "./placardResidency";

describe("placard residency", () => {
  it("prepares outward from a middle destination", () => {
    expect(placardPreparationOrder(3, 7)).toEqual([3, 2, 4, 1, 5, 0, 6]);
  });

  it("follows the only available direction from an edge", () => {
    expect(placardPreparationOrder(0, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(placardPreparationOrder(6, 7)).toEqual([6, 5, 4, 3, 2, 1, 0]);
  });

  it("selects the nearest document that is not already resident", () => {
    const prepared = new Set([3, 2, 4]);
    expect(nextPlacardToPrepare(3, 7, prepared)).toBe(1);
    expect(nextPlacardToPrepare(3, 7, new Set([0, 1, 2, 3, 4, 5, 6]))).toBe(
      undefined,
    );
  });

  it("keeps invalid boundary input inside the available units", () => {
    expect(placardPreparationOrder(-4, 3)).toEqual([0, 1, 2]);
    expect(placardPreparationOrder(20, 3)).toEqual([2, 1, 0]);
    expect(placardPreparationOrder(0, 0)).toEqual([]);
  });
});
