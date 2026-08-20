import { describe, expect, it } from "vitest";

import { arrivalBeatDuration } from "./ArrivalBeats";

describe("Arrival Beats", () => {
  it("authors only About and Books in this slice", () => {
    expect(arrivalBeatDuration(0)).toBe(900);
    expect(arrivalBeatDuration(1)).toBe(700);
    expect(arrivalBeatDuration(2)).toBe(0);
  });
});
