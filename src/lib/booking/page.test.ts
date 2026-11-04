import { describe, expect, it } from "vitest";

import { stepLabel } from "./page";

describe("the day nav's words", () => {
  it("counts a week's steps", () => {
    expect(stepLabel(0, 7)).toBe("This week");
    expect(stepLabel(7, 7)).toBe("Next week");
    expect(stepLabel(14, 7)).toBe("In 2 weeks");
    expect(stepLabel(56, 7)).toBe("In 8 weeks");
  });

  it("counts a phone's few Days, then weeks", () => {
    expect(stepLabel(0, 3)).toBe("Next 3 days");
    expect(stepLabel(1, 3)).toBe("From tomorrow");
    expect(stepLabel(3, 3)).toBe("In 3 days");
    expect(stepLabel(12, 3)).toBe("In 12 days");
    expect(stepLabel(15, 3)).toBe("In 2 weeks");
  });
});
