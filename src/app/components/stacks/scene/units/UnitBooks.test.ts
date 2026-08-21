import { COVER_W, FEATURED_COVER_Z, packedBookDepth } from "../primitives";
import { SHELF_GEOMETRY } from "../shelfGeometry";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import {
  LOWER_FEATURED_ROW_Z,
  LOWER_PACKED_ROW_Z,
  TOP_FEATURED_ROW_Z,
  TOP_PACKED_ROW_Z,
  layoutFeatured,
} from "./UnitBooks";
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
      FEATURED_COVER_Z +
      (first.dz ?? 0) -
      (first.thickness ?? 0.048) * scale;

    // The deepest possible packed volume reaches 0.19 past its row origin.
    // Measure clearance between the shifted ranks, not against the obsolete
    // absolute position used before the lower shelf was brought back over wood.
    const packedFront = LOWER_PACKED_ROW_Z + 0.19;
    expect(coverBack - packedFront).toBeGreaterThanOrEqual(0.008);
  });

  it("gives both featured ranks deliberate clearance from packed books", () => {
    expect(TOP_FEATURED_ROW_Z - TOP_PACKED_ROW_Z).toBeGreaterThanOrEqual(0.19);
    expect(LOWER_FEATURED_ROW_Z - LOWER_PACKED_ROW_Z).toBeGreaterThanOrEqual(
      0.19,
    );
    expect(unitSource).toContain("position={[0, 0, LOWER_PACKED_ROW_Z]}");
    expect(unitSource).toContain("position={[-0.05, 0, TOP_PACKED_ROW_Z]}");
    expect(unitSource).toContain("position={[0, 0, TOP_FEATURED_ROW_Z]}");
    expect(unitSource).toContain("position={[0, 0, LOWER_FEATURED_ROW_Z]}");
  });

  it("keeps lower featured covers and risers over the shallow plank", () => {
    const books = Array.from({ length: 4 }, (_, index) => ({
      url: `/cover-${index}.jpg`,
      key: `cover-${index}`,
      label: `Cover ${index}`,
      color: "#765432",
      thickness: 0.056,
    }));
    const frontEdge =
      SHELF_GEOMETRY.lower.centerZ + SHELF_GEOMETRY.lower.depth / 2;
    const backEdge =
      SHELF_GEOMETRY.lower.centerZ - SHELF_GEOMETRY.lower.depth / 2;
    const lower = layoutFeatured(books, 41, -1.24);

    // Packed-book backs are invariant because their varying fronts are all
    // aligned from the old 0.3-deep row.
    expect(LOWER_PACKED_ROW_Z - 0.15).toBeGreaterThanOrEqual(backEdge);

    for (const item of lower) {
      if (item.kind !== "cover") continue;
      const scale = item.s ?? 1;
      const yaw = item.yaw ?? 0;
      const centerZ = LOWER_FEATURED_ROW_Z + FEATURED_COVER_Z + (item.dz ?? 0);
      const coverFront =
        centerZ +
        scale *
          ((COVER_W / 2) * Math.abs(Math.sin(yaw)) +
            0.003 * Math.abs(Math.cos(yaw)));
      expect(coverFront).toBeLessThanOrEqual(frontEdge);

      if ((item.riser ?? 0) > 0) {
        const riserYaw = yaw * 0.5 + 0.06;
        const riserHalfDepth =
          0.12 * Math.abs(Math.cos(riserYaw)) +
          ((COVER_W * scale * 0.86) / 2) * Math.abs(Math.sin(riserYaw));
        expect(centerZ + riserHalfDepth).toBeLessThanOrEqual(frontEdge);
      }
    }
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
    const physicalShell = featuredCover.indexOf("<FaceOutBookVolume");
    const jacketLod = featuredCover.indexOf("{textured && (");

    expect(start).toBeGreaterThanOrEqual(0);
    expect(interactionBranch).toBeGreaterThanOrEqual(0);
    expect(physicalShell).toBeGreaterThanOrEqual(0);
    expect(jacketLod).toBeGreaterThan(physicalShell);
    expect(featuredCover).not.toContain(") : !textured ? (");
  });

  it("builds packed books from boards, recessed pages, and a spine", () => {
    const rowStart = primitivesSource.indexOf("export function BookRowMesh");
    const rowEnd = primitivesSource.indexOf(
      "function FirstCoverArrival",
      rowStart,
    );
    const row = primitivesSource.slice(rowStart, rowEnd);

    expect(row).toContain("<UprightBookVolume");
    expect(row).toContain("<FlatBookVolume");
    expect(row).toContain("pages={palette.pages}");
  });

  it("makes every rendered book row opt into per-volume dragging", () => {
    const rows = unitSource.match(/<BookRowMesh[\s\S]*?\/>/g) ?? [];

    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.includes("grabbableVolumes"))).toBe(true);
  });
});

describe("packed book proportions", () => {
  it("scales depth with height and keeps it in the shelf-safe range", () => {
    const short = packedBookDepth(0.4, 3, 15);
    const tall = packedBookDepth(0.62, 3, 15);

    expect(short).toBeGreaterThanOrEqual(0.24);
    expect(tall).toBeGreaterThan(short);
    expect(tall).toBeLessThanOrEqual(0.34);
  });

  it("soft-caps tall books without flattening them to one depth", () => {
    const depths = Array.from({ length: 8 }, (_, index) =>
      packedBookDepth(0.62, index, 15),
    );

    expect(
      new Set(depths.map((depth) => depth.toFixed(6))).size,
    ).toBeGreaterThan(1);
    expect(depths.every((depth) => depth < 0.34)).toBe(true);
  });
});
