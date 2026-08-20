import { describe, expect, it } from "vitest";

import { scrollLeftAfterResize } from "./scrollResize";

describe("horizontal scene resize", () => {
  it.each([
    { scrollRange: 6000, nextScrollRange: 3600 },
    { scrollRange: 3600, nextScrollRange: 6000 },
  ])(
    "continues the next wheel movement from the same scene position when the range changes from $scrollRange to $nextScrollRange",
    ({ scrollRange, nextScrollRange }) => {
      const offsetBeforeResize = 0.55;
      const wheelDelta = 24;

      const resizedScrollLeft = scrollLeftAfterResize({
        scrollLeft: offsetBeforeResize * scrollRange,
        scrollRange,
        nextScrollRange,
      });
      const offsetAfterWheel =
        (resizedScrollLeft + wheelDelta) / nextScrollRange;

      expect(offsetAfterWheel).toBeCloseTo(
        offsetBeforeResize + wheelDelta / nextScrollRange,
        10,
      );
    },
  );
});
