import fs from "node:fs";
import { describe, expect, it } from "vitest";

function source(name: string) {
  return fs.readFileSync(new URL(`./${name}.tsx`, import.meta.url), "utf8");
}

describe("leafy prop collider authoring", () => {
  // Every plant in the scene, not a sample. ADR 0020 derives the sway band
  // from this exact tag, so an untagged plant does not merely collide oddly —
  // it silently answers a pointer by nodding like a book. The Systems
  // sansevieria was missing from both this list and the scene when band one
  // landed, which is how the gap was found.
  it.each([
    ["UnitAbout", "grab:plant:about-cactus"],
    ["UnitAbout", "grab:plant:about-succulent"],
    ["UnitAbout", "grab:plant:about-large"],
    ["UnitBlog", "grab:plant:musings"],
    ["UnitTalks", "grab:plant:talks-pothos"],
    ["UnitTalks", "grab:plant:talks-top"],
    ["UnitProjects", "grab:plant:projects-small"],
    ["UnitProjects", "grab:plant:projects-yucca"],
    ["UnitSystems", "grab:plant:sansevieria"],
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
