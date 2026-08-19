import fs from "node:fs";
import { describe, expect, it } from "vitest";

function source(name: string) {
  return fs.readFileSync(new URL(`./${name}.tsx`, import.meta.url), "utf8");
}

describe("leafy prop collider authoring", () => {
  it.each([
    ["UnitBlog", "grab:plant:musings"],
    ["UnitTalks", "grab:plant:talks-pothos"],
    ["UnitTalks", "grab:plant:talks-top"],
    ["UnitProjects", "grab:plant:projects-yucca"],
  ])("uses planter-only collision for %s %s", (unit, hoverKey) => {
    const unitSource = source(unit);
    const start = unitSource.indexOf(`hoverKey="${hoverKey}"`);
    const end = unitSource.indexOf(">", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(unitSource.slice(start, end)).toContain(
      'colliderProfile="foliage-base"',
    );
  });
});
