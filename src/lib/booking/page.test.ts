import { describe, expect, it } from "vitest";

import { daysFitting, stepLabel } from "./page";

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

describe("daysFitting", () => {
  it("shows a phone 3 Days and a wide window up to the week", () => {
    // iPhone widths, less the page's 16px sides.
    expect(daysFitting(361, true)).toBe(3);
    expect(daysFitting(398, true)).toBe(3);
    // A window too narrow for the computer's layout, but wider than a phone.
    expect(daysFitting(460, true)).toBe(4);
    expect(daysFitting(520, true)).toBe(5);
    expect(daysFitting(640, true)).toBe(6);
    // The computer's grid beside the card, from 1024 to its widest.
    expect(daysFitting(616, false)).toBe(5);
    expect(daysFitting(700, false)).toBe(6);
    expect(daysFitting(744, false)).toBe(7);
  });

  it("never shows fewer than 3 or more than 7", () => {
    expect(daysFitting(0, true)).toBe(3);
    expect(daysFitting(3000, false)).toBe(7);
  });
});
