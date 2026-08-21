import { describe, expect, it } from "vitest";

import { resolveUnitVisualResidency } from "./useUnitLod";

describe("unit visual residency", () => {
  it("keeps every role-sized unit visual mounted when prewarming is enabled", () => {
    expect(
      resolveUnitVisualResidency({
        prewarmAll: true,
        near: false,
        resident: false,
      }),
    ).toBe(true);
  });

  it("retains the proximity release path as the reversible comparison", () => {
    expect(
      resolveUnitVisualResidency({
        prewarmAll: false,
        near: true,
        resident: false,
      }),
    ).toBe(true);
    expect(
      resolveUnitVisualResidency({
        prewarmAll: false,
        near: false,
        resident: true,
      }),
    ).toBe(true);
    expect(
      resolveUnitVisualResidency({
        prewarmAll: false,
        near: false,
        resident: false,
      }),
    ).toBe(false);
  });
});
