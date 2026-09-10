import { PALETTES } from "../../theme";
import {
  COVER_H,
  COVER_W,
  FEATURED_COVER_Z,
  type SpineBookLength,
  bookRowXBounds,
  coverSeat,
  flatVolumeHeights,
  flatVolumeSeats,
  packRow,
  packedBookDepth,
} from "../primitives";
import { SHELF_GEOMETRY } from "../shelfGeometry";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import {
  LOWER_FEATURED_ROW_Z,
  LOWER_PACKED_ROW_Z,
  TOP_FEATURED_ROW_Z,
  TOP_PACKED_ROW_OFFSET_X,
  TOP_PACKED_ROW_Z,
  featuredLeanWindows,
  featuredStackCenters,
  layoutFeatured,
} from "./UnitBooks";
import {
  featuredBookThickness,
  spineBookHeight,
  spineBookWidth,
} from "./featuredBookGeometry";

const primitivesSource = fs.readFileSync(
  new URL("../primitives.tsx", import.meta.url),
  "utf8",
);
const unitSource = fs.readFileSync(
  new URL("./UnitBooks.tsx", import.meta.url),
  "utf8",
);

const PALETTE = PALETTES.light;

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

describe("packed rows built from the real library", () => {
  const library: SpineBookLength[] = [
    {
      id: "a",
      title: "A",
      author: "Author A",
      pageCount: 180,
      audioLengthMin: null,
    },
    {
      id: "b",
      title: "B",
      author: "Author B",
      pageCount: 795,
      audioLengthMin: null,
    },
    {
      id: "c",
      title: "C",
      author: "Author C",
      pageCount: 320,
      audioLengthMin: null,
    },
    {
      id: "d",
      title: "D",
      author: "Author D",
      pageCount: null,
      audioLengthMin: 1_350,
    },
  ];
  /** Enough varied lengths to still have books left when the walker reaches
   * the horizontal stack, which is most of the way along the row. */
  const fullLibrary: SpineBookLength[] = Array.from({ length: 64 }, (_, i) => ({
    id: `full-${i}`,
    title: `Full ${i}`,
    author: `Author ${i}`,
    pageCount: [180, 240, 320, 288, 795, 210, 368, 640, 192, 272][i % 10]!,
    audioLengthMin: null,
  }));
  const shelved = (row: ReturnType<typeof packRow>) =>
    row.flatMap((item) =>
      item.kind === "flat"
        ? (item.books ?? []).flatMap((book) => (book ? [book.id] : []))
        : (item.kind === "spine" || item.kind === "lean") && item.book
          ? [item.book.id]
          : [],
    );

  it("sizes a spine from the book's own length, not a roll", () => {
    const short = spineBookWidth(120, null);
    const long = spineBookWidth(900, null);

    // packRow's own measured spine range — a real page count has to land
    // inside the silhouette the invented widths produced.
    expect(short).toBeCloseTo(0.046, 8);
    expect(long).toBeCloseTo(0.14, 8);
    expect(spineBookWidth(400, null)).toBeGreaterThan(short);
    expect(spineBookWidth(400, null)).toBeLessThan(long);
    expect(spineBookWidth(null, 1_350)).toBeGreaterThan(
      spineBookWidth(null, 360),
    );

    const row = packRow(2.42, [], PALETTE, 15, library);
    for (const item of row) {
      if ((item.kind !== "spine" && item.kind !== "lean") || !item.book)
        continue;
      const source = library.find((book) => book.id === item.book!.id)!;
      // The end book closes the row against the bookend and keeps its
      // authored width; every other real volume is its book's length.
      if (item !== row.at(-1))
        expect(item.w).toBeCloseTo(
          spineBookWidth(source.pageCount, source.audioLengthMin),
          8,
        );
    }
  });

  it("grows every axis with length, thickness fastest", () => {
    const shortW = spineBookWidth(120, null);
    const longW = spineBookWidth(900, null);
    const shortH = spineBookHeight(120, null, 0);
    const longH = spineBookHeight(900, null, 0);

    expect(longW).toBeGreaterThan(shortW);
    expect(longH).toBeGreaterThan(shortH);
    // Real books vary hugely in thickness and only modestly in trim size.
    // Scaling every axis alike would give an 800-page book a comic board.
    expect(longW / shortW).toBeGreaterThan(2);
    expect(longH / shortH).toBeLessThan(1.5);
  });

  it("has no height cliff between two books of similar length", () => {
    // The old rule jumped a whole band at ~392 pages, so two books a few pages
    // apart differed 25% in height on an invisible cutoff.
    let worst = 0;
    for (let pages = 120; pages < 900; pages += 5) {
      const step = Math.abs(
        spineBookHeight(pages + 5, null, 0.5) -
          spineBookHeight(pages, null, 0.5),
      );
      worst = Math.max(worst, step);
    }
    expect(worst).toBeLessThan(0.005);
  });

  it("keeps every real book inside the shelf's readable range", () => {
    for (const pages of [null, 40, 120, 300, 795, 2_000]) {
      const w = spineBookWidth(pages, null);
      const h = spineBookHeight(pages, null, 1);
      expect(w).toBeGreaterThanOrEqual(0.046);
      expect(w).toBeLessThanOrEqual(0.14);
      expect(h).toBeGreaterThanOrEqual(0.4);
      expect(h).toBeLessThanOrEqual(0.66);
    }
  });

  it("builds varied slimmer piles without duplicating library books", () => {
    for (const [width, salt] of [
      [2.54, 15],
      [2.6, 40],
    ]) {
      for (const books of [fullLibrary, library, []]) {
        const row = packRow(
          width!,
          [],
          PALETTE,
          salt!,
          books,
          {
            left: -0.9,
            right: -0.17,
          },
          "tall",
        );
        const stacks = row.filter((item) => item.kind === "flat");
        expect(stacks).toHaveLength(1);
        for (const stack of stacks) {
          expect([4, 5]).toContain(stack.n);
          const heights = flatVolumeHeights(stack);
          expect(heights).toHaveLength(stack.n);
          expect(heights.reduce((sum, h) => sum + h, 0)).toBeGreaterThanOrEqual(
            0.35,
          );
          expect(heights.reduce((sum, h) => sum + h, 0)).toBeLessThanOrEqual(
            0.385,
          );
          expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(
            0.025,
          );
          const volumes = stack.volumes!;
          expect(volumes).toHaveLength(stack.n);
          expect(
            Math.max(...volumes.map((v) => v.width)) -
              Math.min(...volumes.map((v) => v.width)),
          ).toBeGreaterThan(0.06);
          for (const [j, volume] of volumes.entries()) {
            const cosine = Math.cos(volume.yaw);
            const sine = Math.sin(volume.yaw);
            const halfWidth =
              (volume.width * cosine + volume.depth * Math.abs(sine)) / 2;
            const halfDepth =
              (volume.width * Math.abs(sine) + volume.depth * cosine) / 2;
            expect(stack.x + volume.x - halfWidth).toBeGreaterThan(-width! / 2);
            expect(stack.x + volume.x + halfWidth).toBeLessThan(width! / 2);
            expect(volume.z - halfDepth).toBeGreaterThan(-0.15);
            expect(volume.z + halfDepth).toBeLessThan(0.19);
            expect(Math.abs(volume.yaw)).toBeGreaterThanOrEqual(0.12);
            if (j > 0) expect(volume.yaw * volumes[j - 1]!.yaw).toBeLessThan(0);
            // Every upper book's center stays inside this support footprint,
            // so their combined center of mass does too.
            for (const above of volumes.slice(j + 1)) {
              const dx = above.x - volume.x;
              const dz = above.z - volume.z;
              expect(Math.abs(dx * cosine - dz * sine)).toBeLessThan(
                volume.width / 2,
              );
              expect(Math.abs(dx * sine + dz * cosine)).toBeLessThan(
                volume.depth / 2,
              );
            }
          }
        }
        const intervals = row.map((item) => bookRowXBounds([item]));
        expect(intervals[0]!.min).toBeCloseTo(-width! / 2 + 0.04);
        expect(intervals.at(-1)!.max).toBeCloseTo(width! / 2 - 0.044);
        for (let j = 1; j < intervals.length; j++) {
          const gap = intervals[j]!.min - intervals[j - 1]!.max;
          expect(gap).toBeGreaterThanOrEqual(-1e-9);
          expect(gap).toBeLessThan(0.06);
        }
        const ids = shelved(row);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it("groups three piles around featured books and seats four visible supported leans", () => {
    let pileCount = 0;
    let leanCount = 0;
    const angles: number[] = [];
    for (const [salt, count, offset] of [
      [15, 2, TOP_PACKED_ROW_OFFSET_X],
      [40, 1, 0],
    ] as const) {
      const covers = layoutFeatured(
        Array.from({ length: 4 }, (_, i) => ({
          key: `featured-${i}`,
          label: `Featured ${i}`,
          url: `/cover-${i}.jpg`,
          color: "#765432",
          thickness: 0.06,
        })),
        salt + 1,
        salt === 15 ? -1.3 : -1.24,
      );
      const width = salt === 15 ? 2.66 : 2.6;
      const row = packRow(
        width,
        [],
        PALETTE,
        salt,
        fullLibrary,
        undefined,
        "tall",
        featuredStackCenters(covers, offset, count),
        featuredLeanWindows(covers, offset),
      );
      const rowBounds = bookRowXBounds(row);
      expect(rowBounds.min).toBeGreaterThanOrEqual(-SHELF_GEOMETRY.width / 2);
      expect(rowBounds.max).toBeLessThanOrEqual(SHELF_GEOMETRY.width / 2);
      if (salt === 15) expect(rowBounds.max + offset).toBeGreaterThan(1.24);
      const piles = row.filter((item) => item.kind === "flat");
      expect(piles).toHaveLength(count);
      pileCount += piles.length;
      for (const pile of piles) {
        const bounds = bookRowXBounds([pile]);
        const neighboringCover = covers.some(
          (cover) =>
            cover.kind === "cover" &&
            Math.abs(cover.x - (pile.x + offset)) < 0.3,
        );
        expect(neighboringCover).toBe(true);
        expect(bounds.min).toBeGreaterThan(-width / 2);
        expect(bounds.max).toBeLessThan(width / 2);
      }
      for (const [index, item] of row.entries()) {
        if (item.kind !== "lean") continue;
        leanCount++;
        const theta = item.angle!;
        angles.push(theta);
        const support = row[index + (theta > 0 ? -1 : 1)]!;
        expect(support.kind).toBe("spine");
        if (support.kind !== "spine") continue;
        expect(support.roll).toBe(0);
        const halfExtent =
          (item.w * Math.cos(theta) + item.h * Math.abs(Math.sin(theta))) / 2;
        const contactX = item.x + (theta > 0 ? -halfExtent : halfExtent);
        expect(contactX).toBeCloseTo(
          support.x + (theta > 0 ? support.w / 2 : -support.w / 2),
          8,
        );
        expect(item.h * Math.cos(theta)).toBeLessThan(support.h);
        expect(Math.abs(theta)).toBeGreaterThanOrEqual(0.2);
        expect(
          featuredLeanWindows(covers, offset).some(
            (window) => contactX >= window.left && contactX <= window.right,
          ),
        ).toBe(true);
      }
    }
    expect(pileCount).toBe(3);
    expect(leanCount).toBe(4);
    expect(angles.filter((angle) => angle < 0)).toHaveLength(2);
    expect(angles.filter((angle) => angle > 0)).toHaveLength(2);
    expect(
      new Set(angles.map((angle) => Math.abs(angle).toFixed(2))).size,
    ).toBeGreaterThanOrEqual(3);
  });

  it("makes a book lying flat as thick as it is long", () => {
    // A book on its side shows the SAME dimension a standing book spends on
    // its spine width. Every flat volume used to render at 0.052, so a
    // 550-page book in the pile looked identical to a 224-page one — which is
    // how Barbarians at the Gate ended up the smallest thing on the shelf.
    // A full shelf's worth: the four-book fixture is spent on spines long
    // before the walker reaches the stack, and an empty stack proves nothing.
    const row = packRow(2.42, [], PALETTE, 15, fullLibrary, {
      left: -0.9,
      right: -0.17,
    });
    const stack = row.find((item) => item.kind === "flat");

    expect(stack?.kind).toBe("flat");
    if (stack?.kind !== "flat") return;
    const heights = flatVolumeHeights(stack);
    const stacked = stack.books ?? [];
    expect(stacked.filter(Boolean).length).toBeGreaterThan(1);
    for (const [j, book] of stacked.entries()) {
      if (!book) continue;
      const source = fullLibrary.find((entry) => entry.id === book.id)!;
      expect(heights[j]).toBeCloseTo(
        spineBookWidth(source.pageCount, source.audioLengthMin),
        8,
      );
    }
  });

  it("never lays a long read face-down", () => {
    // A book on its face shows an edge a few pixels tall whatever its page
    // count, so length is unreadable there. Putting a 550-page read in the
    // pile threw away the one thing the shelf is meant to say about it.
    const row = packRow(2.42, [], PALETTE, 15, fullLibrary, {
      left: -0.9,
      right: -0.17,
    });
    const laidFlat = row.flatMap((item) =>
      item.kind === "flat" ? (item.books ?? []).filter(Boolean) : [],
    );
    const standing = row.flatMap((item) =>
      (item.kind === "spine" || item.kind === "lean") && item.book
        ? [item.book]
        : [],
    );
    const lengthOf = (id: string) => {
      const book = fullLibrary.find((entry) => entry.id === id)!;
      return spineBookWidth(book.pageCount, book.audioLengthMin);
    };

    expect(laidFlat.length).toBeGreaterThan(0);
    expect(standing.length).toBeGreaterThan(0);
    // Every book in the pile is shorter than every book left standing that
    // did not simply run out of room.
    const fattestFlat = Math.max(...laidFlat.map((b) => lengthOf(b!.id)));
    const longest = Math.max(
      ...fullLibrary.map((b) => spineBookWidth(b.pageCount, b.audioLengthMin)),
    );
    expect(fattestFlat).toBeLessThan(longest);
    // The longest read on the shelf stands up.
    expect(standing.some((b) => lengthOf(b.id) === longest)).toBe(true);
  });

  it("seats each volume on the pile below it, not on a fixed step", () => {
    const row = packRow(2.42, [], PALETTE, 15, fullLibrary, {
      left: -0.9,
      right: -0.17,
    });
    const stack = row.find((item) => item.kind === "flat");
    if (stack?.kind !== "flat") throw new Error("expected a stack");
    const heights = flatVolumeHeights(stack);
    const seats = flatVolumeSeats(stack);

    // Bottom volume rests on the plank, and adjacent boards touch exactly:
    // no floating above a thin book, no burying inside a fat one.
    expect(seats[0]).toBeCloseTo(heights[0]! / 2, 8);
    for (let j = 1; j < seats.length; j++) {
      const gap =
        seats[j]! - heights[j]! / 2 - (seats[j - 1]! + heights[j - 1]! / 2);
      expect(gap).toBeCloseTo(0, 8);
    }
  });

  it("shelves each supplied book exactly once", () => {
    const ids = shelved(packRow(2.42, [], PALETTE, 15, library));

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => library.some((book) => book.id === id))).toBe(
      true,
    );
  });

  it("keeps a book out of the leaning slot when it is too wide to lean", () => {
    // The leaner's authored gap clears 0.085 and no more; a 795-page book is
    // 0.127 wide. It must be placed upright somewhere else rather than
    // dropped from the shelf or driven through the book behind it.
    const wideFirst: SpineBookLength[] = [
      library[1]!,
      library[0]!,
      library[2]!,
    ];
    const row = packRow(2.42, [], PALETTE, 15, wideFirst);
    const leaner = row.find((item) => item.kind === "lean" && item.book);

    if (leaner?.kind === "lean") expect(leaner.w).toBeLessThanOrEqual(0.085);
    expect(shelved(row)).toContain("b");
  });

  it("puts the horizontal stack where the rank in front has a hole", () => {
    // Left to the roll, both stacks landed directly behind a featured cover,
    // which hides the stack AND the props resting on it — the headphones were
    // invisible in a real capture. The window is what fixes that.
    const window = { left: -0.9, right: -0.17 };
    const row = packRow(2.42, [], PALETTE, 15, library, window);
    const stacks = row.filter((item) => item.kind === "flat");

    expect(stacks.length).toBeGreaterThan(0);
    expect(
      stacks.some((item) => item.x >= window.left && item.x <= window.right),
    ).toBe(true);
    // And it has to FIT the hole, not merely start inside it.
    const inWindow = stacks.find(
      (item) => item.x >= window.left && item.x <= window.right,
    )!;
    expect(inWindow.x + 0.17).toBeLessThanOrEqual(window.right);
  });

  it("still lays down a stack when no window is supplied", () => {
    const row = packRow(2.42, [], PALETTE, 15, library);

    expect(row.some((item) => item.kind === "flat")).toBe(true);
  });

  it("still fills the shelf when the library query returns nothing", () => {
    const row = packRow(2.42, [], PALETTE, 15, []);

    expect(row.length).toBeGreaterThan(8);
    expect(shelved(row)).toEqual([]);
    expect(
      row.every((item) =>
        item.kind === "spine" || item.kind === "lean"
          ? item.w >= 0.046 && item.w <= 0.14
          : true,
      ),
    ).toBe(true);
  });

  it("gives a book the same board color wherever the row puts it", () => {
    const first = packRow(2.42, [], PALETTE, 15, library);
    // Same books, one extra read finished since — every volume shifts along.
    const shifted = packRow(2.42, [], PALETTE, 15, [
      {
        id: "z",
        title: "Z",
        author: "Author Z",
        pageCount: 240,
        audioLengthMin: null,
      },
      ...library,
    ]);
    const colorOf = (row: ReturnType<typeof packRow>, id: string) =>
      row.flatMap((item) =>
        (item.kind === "spine" || item.kind === "lean") && item.book?.id === id
          ? [item.color]
          : [],
      )[0];

    expect(colorOf(first, "c")).toBeDefined();
    expect(colorOf(shifted, "c")).toBe(colorOf(first, "c"));
  });
});

describe("featured book carrying clearance", () => {
  it("keeps the original covers and background books at a similar height", () => {
    for (const salt of [16, 41]) {
      const books = Array.from({ length: 4 }, (_, i) => ({
        url: `/cover-${i}.jpg`,
        key: `cover-${i}`,
        label: `Cover ${i}`,
        color: "#765432",
        thickness: 0.09,
      }));
      const featured = layoutFeatured(books, salt, -1.24);
      const packed = packRow(2.6, [], PALETTE, salt, [], undefined, "tall");
      const tallest = Math.max(
        ...packed.map((item) =>
          item.kind === "flat"
            ? flatVolumeHeights(item).reduce((a, b) => a + b, 0)
            : item.kind === "spine" || item.kind === "lean"
              ? item.h
              : 0,
        ),
      );
      for (const item of featured) {
        if (item.kind !== "cover") continue;
        expect(item.s).toBeGreaterThanOrEqual(0.88);
        expect(item.s).toBeLessThanOrEqual(0.98);
        expect(Math.abs(COVER_H * item.s! - 0.004 - tallest)).toBeLessThan(
          0.065,
        );
        const yaw = Math.abs(item.yaw!);
        const back =
          LOWER_FEATURED_ROW_Z +
          FEATURED_COVER_Z +
          item.dz! -
          item.s! *
            ((item.thickness! + 0.006) * Math.cos(yaw) +
              (COVER_W / 2) * Math.sin(yaw));
        expect(back - (LOWER_PACKED_ROW_Z + 0.19)).toBeGreaterThan(0.008);
      }
    }
  });

  it("gives every featured book a small left/right tilt while seating its lower corner", () => {
    for (const salt of [16, 41]) {
      for (let count = 1; count <= 5; count++) {
        const books = Array.from({ length: count }, (_, index) => ({
          url: `/cover-${index}.jpg`,
          key: `cover-${index}`,
          label: `Cover ${index}`,
          color: "#765432",
          thickness: 0.056,
        }));
        for (const item of layoutFeatured(books, salt, -1.24)) {
          if (item.kind !== "cover") continue;
          expect(Math.abs(item.lean!)).toBeGreaterThanOrEqual(0.012);
          expect(Math.abs(item.lean!)).toBeLessThanOrEqual(0.026);
          expect(item.riser).toBe(0);
          const bottom =
            coverSeat(item.s!, item.lean!, item.riser!) -
            item.s! *
              ((COVER_H / 2) * Math.cos(item.lean!) +
                (COVER_W / 2) * Math.abs(Math.sin(item.lean!)));
          expect(bottom).toBeCloseTo(-0.004, 8);
        }
      }
    }
  });

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
    // The top row's x offset is a named constant now, because anything
    // measured against the featured rank has to be shifted by it to reach this
    // row's frame. Assert the VALUE and its use rather than the old literal.
    expect(TOP_PACKED_ROW_OFFSET_X).toBe(0);
    expect(unitSource).toContain(
      "position={[TOP_PACKED_ROW_OFFSET_X, 0, TOP_PACKED_ROW_Z]}",
    );
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
  it("preserves vertical hover travel when packed books are draggable", () => {
    const start = primitivesSource.indexOf("function ShelfBook");
    const end = primitivesSource.indexOf("const SPINE_LIFT", start);
    const carrier = primitivesSource.slice(start, end);

    expect(carrier).toContain("hoverTiltAngle={hoverSlide ? undefined : 0}");
    expect(carrier).toContain(
      "hoverLift={hoverSlide ? 0 : lift[1] * HOVER_MOTION_SCALE}",
    );
    expect(carrier).toContain("hoverSlide={hoverSlide}");
    expect(carrier).toContain("<group rotation={rest}>{children}</group>");
  });

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
    // Starts at FlatStack rather than BookRowMesh: the horizontal pile moved
    // into its own component when its volumes stopped sharing one thickness.
    const rowStart = primitivesSource.indexOf("function FlatStack");
    const rowEnd = primitivesSource.indexOf(
      "function FirstCoverArrival",
      rowStart,
    );
    const row = primitivesSource.slice(rowStart, rowEnd);

    expect(rowStart).toBeGreaterThanOrEqual(0);
    expect(row).toContain("export function BookRowMesh");

    expect(row).toContain("<UprightBookVolume");
    expect(row).toContain("<FlatBookVolume");
    expect(row).toMatch(
      /pages=\{\s*subdued \? subduedBookColor\(palette.pages\) : palette.pages\s*\}/,
    );
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
