import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { LOWER_FEATURED_ROW_Z, layoutFeatured } from "./UnitBooks";
import { featuredBookThickness } from "./featuredBookGeometry";

const primitivesSource = fs.readFileSync(
  new URL("../primitives.tsx", import.meta.url),
  "utf8",
);
const unitSource = fs.readFileSync(
  new URL("./UnitBooks.tsx", import.meta.url),
  "utf8",
);

describe("featured book physical thickness", () => {
  it("is monotonic with printed length and clamps outliers", () => {
    const short = featuredBookThickness(120, null);
    const medium = featuredBookThickness(400, null);
    const long = featuredBookThickness(900, null);

    expect(short).toBeCloseTo(0.036, 8);
    expect(medium).toBeGreaterThan(short);
    expect(long).toBeCloseTo(0.09, 8);
    expect(featuredBookThickness(2_000, null)).toBe(long);
  });

  it("uses audiobook runtime when a page count is unavailable", () => {
    expect(featuredBookThickness(null, 1_350)).toBeGreaterThan(
      featuredBookThickness(null, 360),
    );
  });
});

describe("featured book carrying clearance", () => {
  it("keeps the lower-left cover clear of the packed spine fronts", () => {
    const books = Array.from({ length: 4 }, (_, index) => ({
      url: `/cover-${index}.jpg`,
      key: `cover-${index}`,
      label: `Cover ${index}`,
      color: "#765432",
      thickness: 0.056,
    }));
    const first = layoutFeatured(books, 41, -1.24)[0];
    expect(first?.kind).toBe("cover");
    if (first?.kind !== "cover") return;

    const scale = first.s ?? 1;
    const coverBack =
      LOWER_FEATURED_ROW_Z +
      0.06 +
      (first.dz ?? 0) -
      (first.thickness ?? 0.048) * scale;

    // The packed volume behind this x reaches z ~= 0.176. Keep a visible and
    // physical 8 mm gap so the carry probe does not begin inside a static.
    expect(coverBack).toBeGreaterThanOrEqual(0.184);
  });

  it("does not request carry tilt for shelf-supported featured covers", () => {
    const start = primitivesSource.indexOf(
      "grabbable && linkUnit !== undefined",
    );
    const end = primitivesSource.indexOf("</Grabbable>", start);
    const carrier = primitivesSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(carrier).toContain("tiltWhileHeld={false}");
  });
});

describe("Book Notes bookshelf carrying", () => {
  it("keeps featured-cover interaction mounted when visual LOD is plain", () => {
    const start = primitivesSource.indexOf("function FeaturedCover");
    const end = primitivesSource.indexOf("export function BookRowMesh", start);
    const featuredCover = primitivesSource.slice(start, end);
    const interactionBranch = featuredCover.indexOf(
      "grabbable && linkUnit !== undefined",
    );
    const visualLodBranch = featuredCover.indexOf("!textured");

    expect(start).toBeGreaterThanOrEqual(0);
    expect(interactionBranch).toBeGreaterThanOrEqual(0);
    expect(visualLodBranch).toBeGreaterThanOrEqual(0);
    expect(interactionBranch).toBeLessThan(visualLodBranch);
  });

  it("makes every rendered book row opt into per-volume dragging", () => {
    const rows = unitSource.match(/<BookRowMesh[\s\S]*?\/>/g) ?? [];

    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.includes("grabbableVolumes"))).toBe(true);
  });
});
