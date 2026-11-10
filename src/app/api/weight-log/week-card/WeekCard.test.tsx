import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { weekSummary } from "~/lib/weight-log/week-summary";
import { HALF_TENTH_LOG } from "~/lib/weight-log/week-summary.fixture";

import { WeekCard } from "./WeekCard";

/**
 * The card's text, read from its markup. The route test renders it through
 * satori; this one only checks what it says. Every number is invented.
 */
describe("WeekCard", () => {
  it("rounds a mean ending in a hundredths 5 as the editor's table does", () => {
    // 150.2 and 150.5 average to 150.35, which the editor shows as 150.3.
    const markup = renderToStaticMarkup(
      <WeekCard summary={weekSummary(HALF_TENTH_LOG, "2030-02-05")} />,
    );
    expect(markup).toContain(">150.3<");
    expect(markup).not.toContain("150.4");
    expect(markup).toContain(">+0.3<");
  });
});
