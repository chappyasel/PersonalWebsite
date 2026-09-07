import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import PersonalSystems from "./PersonalSystems";
import { UNITS } from "./stacks/data";

vi.mock("./TiltCard", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("PersonalSystems", () => {
  it("uses one section heading before its three card headings", () => {
    const markup = renderToStaticMarkup(<PersonalSystems />);
    const sectionTitle = markup.indexOf("Personal Systems");
    const systemsTitle = markup.indexOf("Personal Systems", sectionTitle + 1);
    const manualTitle = markup.indexOf("Personal Operating Manual");
    const routineTitle = markup.indexOf("Core Daily Routine");

    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup.match(/<h2/g)).toHaveLength(3);
    expect(sectionTitle).toBeGreaterThanOrEqual(0);
    expect(manualTitle).toBeGreaterThan(sectionTitle);
    expect(systemsTitle).toBeGreaterThan(manualTitle);
    expect(routineTitle).toBeGreaterThan(systemsTitle);
  });

  it("gives each document its own cover at its own hour", () => {
    const markup = renderToStaticMarkup(<PersonalSystems />);
    expect(markup.match(/data-doc-cover="(dawn|day|night)"/g)).toEqual([
      'data-doc-cover="day"',
      'data-doc-cover="night"',
      'data-doc-cover="dawn"',
    ]);
    // One copy of the skyline geometry, referenced by every cover.
    expect(markup.match(/<symbol id="doc-skyline"/g)).toHaveLength(1);
    expect(markup.match(/href="#doc-skyline"/g)).toHaveLength(3);
    expect(markup).toContain("Last updated");
  });

  it("uses the same section name in the sheet and resident panels", () => {
    // The placard header prints unit.label and hides the body h1 only when
    // the two say the same thing, so the full title lives in both places.
    // The rail alone gets the short form.
    const unit = UNITS.find((u) => u.slug === "systems");
    expect(unit?.label).toBe("Personal Systems");
    expect(unit?.railLabel).toBe("Systems");
  });
});
