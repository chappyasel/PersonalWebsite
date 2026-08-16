import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import PersonalSystems from "./PersonalSystems";
import { UNITS } from "./stacks/data";

vi.mock("./TiltCard", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("PersonalSystems", () => {
  it("uses one section heading before its two card headings", () => {
    const markup = renderToStaticMarkup(<PersonalSystems />);
    const sectionTitle = markup.indexOf("Systems");
    const manualTitle = markup.indexOf("Personal Operating Manual");
    const routineTitle = markup.indexOf("Core Daily Routine");

    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup.match(/<h2/g)).toHaveLength(2);
    expect(sectionTitle).toBeGreaterThanOrEqual(0);
    expect(manualTitle).toBeGreaterThan(sectionTitle);
    expect(routineTitle).toBeGreaterThan(manualTitle);
  });

  it("uses the same section name in the rail and resident panels", () => {
    expect(UNITS.find((unit) => unit.slug === "systems")?.label).toBe(
      "Systems",
    );
  });
});
