"use client";

// The library — packed spine rows on both shelves with the owner's FEATURED
// books standing cover-out in front of them and bookends holding the loose
// row ends. The featured covers open their own notes; every other book on the
// unit — spine, flat stack, leaner, pile — opens the
// library itself (`linkUnit`).
//
// The unit's left flank is deliberately EMPTY FLOOR. It held a step ladder,
// which the owner has now killed outright ("let's just get rid of the
// ladder"), and the composition is solved without one rather than around a
// hole: the shelves carry the weight, and the run of bare floor under the
// case's left end is the only place in the room where you can see the whole
// of a bookcase's silhouette. If a replacement lands later it goes at
// x ≈ −2.2 on the ground, which is the slot the ladder vacated.
import {
  fallbackCoverEdgeColor,
  readingBookMaterialColors,
} from "../../../../../lib/books/coverEdgeColor";
import { arrivalBeatRef, useStacks } from "../../store";
import { rand } from "../../theme";
import {
  type BookInteraction,
  type BookInteractionInput,
  buildBookInteractions,
  setBookInteractionInventory,
  setBookInteractionScreens,
} from "../bookInteractions";
import { HoverProp } from "../links";
import {
  BookRowMesh,
  Bookend,
  COVER_H,
  type RowItem,
  ShelfUnit,
  coverExtent,
  coverSeat,
  packRow,
} from "../primitives";
import { SHELF_SURFACE } from "../shelfGeometry";
import { layoutShelfRow, splitShelfRows } from "../shelfSpacing";
import { useUnitFrame } from "../unitActivity";
import { useUnitLod } from "../useUnitLod";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { featuredBookThickness } from "./featuredBookGeometry";
import { type UnitProps } from "./types";

// Every packed spine now follows the same ordinary shelf behavior. The former
// hidden-room renderer, pivot, special target, debug path and tests are gone;
// there is no dormant branch left to preload or accidentally activate.

/**
 * THE FRONT RANK'S GEOMETRY. Everything here is an EDGE, never a centre.
 *
 * A featured book no longer has one width: it carries its own scale, and a
 * leaning one is wider than an upright one. So the packer below works from
 * real half-extents (`coverExtent`) and only the two outer edges of a row are
 * pinned to these.
 *
 * RIGHT is +1.24. The featured covers deliberately use most of the physical
 * plank instead of bunching into the left half. The desktop placard can cover
 * part of that authored vista while it is open; the same destinations remain
 * present in the placard DOM, and focus mode reveals the complete shelf.
 *
 * LEFT is −1.46, and it is the PHONE that sets it, not the plank. Desktop can
 * read to −1.55, but the 390-wide camera frames this unit at 128.4 px per
 * world unit with x = 0 at screen 185, so its left edge is world −1.44 and
 * anything beyond that is off the side of the phone. −1.46 puts the leftmost
 * cover's edge inside the old layout's own −1.48, so no featured book is worse
 * off on a phone than it was.
 *
 * The LOWER row starts further in again: the golden-hour print leans at x −1.5
 * and reaches −1.412, it stands at z 0.24 which is IN FRONT of the covers, and
 * a print across the corner of a featured book is the one occlusion this rank
 * cannot afford.
 */
const EDGE_R = 1.24;
const EDGE_L_TOP = -1.3;
const EDGE_L_LOWER = -1.24;
export const LOWER_FEATURED_ROW_Z = 0.15;

/** Four enlarged covers preserve legibility and variable air across one row.
 * Source content may grow without changing this measured physical capacity. */
const SHELF_CAP = 4;
/** Canvas-only targets need measured screen centres for real pointer QA.
 * Box centres (rather than object origins) work for hinged spines, whose
 * named pivot intentionally lives at the bottom-front contact edge. */
function BookInteractionProbe({
  index,
  root,
  inventory,
}: {
  index: number;
  root: React.RefObject<THREE.Group | null>;
  inventory: BookInteraction[];
}) {
  const box = useMemo(() => new THREE.Box3(), []);
  const center = useMemo(() => new THREE.Vector3(), []);
  useUnitFrame(({ camera, gl }) => {
    if (
      process.env.NODE_ENV === "production" ||
      useStacks.getState().activeUnit !== index ||
      !root.current
    )
      return;
    const rect = gl.domElement.getBoundingClientRect();
    const screens: Record<string, [number, number]> = {};
    for (const item of inventory) {
      const node = root.current.getObjectByName(item.nodeName);
      if (!node) continue;
      box.setFromObject(node, true);
      if (box.isEmpty()) continue;
      box.getCenter(center).project(camera);
      screens[item.id] = [
        rect.left + (center.x * 0.5 + 0.5) * rect.width,
        rect.top + (-center.y * 0.5 + 0.5) * rect.height,
      ];
    }
    setBookInteractionScreens(screens);
  });
  return null;
}

/**
 * ONE SHELF'S WORTH OF FEATURED BOOKS, arranged the way a person leaves them.
 *
 * The old version of this was four covers at a fixed 0.44 pitch, identical
 * size, identical angle, identical depth, on each of two shelves — which is a
 * 2 × 4 product grid with a plank drawn behind it, and the owner said so.
 * Nothing here rolls a die at render time: every number is `rand(i, salt)`,
 * theme's pure hash of the slot and the shelf, so a book's pose is the same on
 * every frame. Math.random would re-pose the shelf on each re-render and make
 * a hovered cover flicker between two arrangements.
 *
 * The pose is keyed to the SLOT rather than to the book's id on purpose. The
 * arrangement is a composition that has to fit a fixed length of plank — the
 * gaps, the leans and the overlaps are all sized against their neighbours — so
 * when a tick is added or removed the whole row has to recompose anyway. A
 * per-id pose would survive the change and then be wrong for its new
 * neighbour: a book leaning on somebody who is no longer there.
 *
 * Four kinds of joint between adjacent books, and the pitch of each is derived
 * from the two books it joins rather than typed in:
 *   front — the right-hand book steps 0.085 toward the viewer and overlaps its
 *           neighbour by 0.02. A book standing part in front of another is the
 *           most unmistakably un-gridded thing a shelf can do, and it buys
 *           back a little of the width a row of five needs.
 *           The overlap is SMALL because the camera is off to the left of this
 *           unit, so a book 0.085 nearer the lens covers more of its neighbour
 *           on screen than its footprint says — measured at 0.09 of overlap it
 *           took a third of the cover behind it, and this rank is the owner's
 *           curated list. None of it may be lost to composition.
 *   lean  — one of the pair tips onto the other at 0.11…0.18 rad. The pitch is
 *           the exact tangency, extent + extent: any less and the leaner's top
 *           corner passes THROUGH the book it is leaning on, which is the kind
 *           of overlap a screenshot cannot show you because interpenetration
 *           and layering look identical from one camera.
 *   tight — 2 cm of air. Two books that were shelved together.
 *   gap   — 12…26 cm of nothing, with the packed spine row showing through it.
 *           This is also the row's slack absorber: when the ticks outgrow the
 *           plank the gaps close first and the clusters survive.
 *
 * WHICH joint goes where is rolled; HOW MANY of each there are is not. A row
 * drawing all four from a threshold on `rand` produced, at the eight currently
 * ticked, a top row of one lean and three near-identical pitches — which is
 * the grid again, arrived at honestly. So the mix is built as a bag sized off
 * the count (every row of three or more gets a real gap and a leaning pair,
 * every row of four or more an overlap) and the bag is dealt out in an order
 * `rand` decides.
 */
type Pose = {
  s: number;
  yaw: number;
  lean: number;
  riser: number;
  dz: number;
  ext: number;
};
type Joint = "lean" | "tight" | "gap";

export function layoutFeatured(
  slice: {
    url: string;
    key: string;
    label: string;
    color: string;
    thickness: number;
  }[],
  salt: number,
  edgeL: number,
): RowItem[] {
  const n = slice.length;
  if (n === 0) return [];

  // Pass 1 — the per-book pose that owes nothing to its neighbours. The scale
  // band stays close to the About shelf's larger current-reading books while
  // retaining enough organic variation to avoid a rigid display grid.
  // It remains more than twice the width of the fattest spine behind it, which
  // makes a featured book legible as the wide mass on the shelf.
  //
  // `dz` never goes negative and that is a measurement, not a taste call: a
  // packed spine is 0.26…0.34 deep with its BACK squared to the shelf, so the
  // deepest fronts in the row behind reach z 0.19, against a cover's own front
  // at 0.177 + dz. A cover set even slightly back from its neighbours ends up
  // BEHIND a fat spine, and a featured book with a paperback standing in front
  // of its corner is worse than no depth variation at all.
  const pose: Pose[] = slice.map((_, i) => ({
    s: 0.88 + rand(i, salt) * 0.1,
    yaw: (rand(i, salt + 1) - 0.5) * 0.22,
    lean: 0,
    riser: 0,
    dz: 0.03 + rand(i, salt + 4) * 0.05,
    ext: 0,
  }));

  // Pass 2 — the joints, and the pose changes that only make sense as a pair.
  const nj = n - 1;
  const leans = n >= 2 ? 1 + (n >= 6 ? 1 : 0) : 0;
  const gaps = n >= 3 ? Math.max(1, Math.round((nj - leans) * 0.55)) : 0;
  const bag: Joint[] = [
    ...(Array(leans).fill("lean") as Joint[]),
    ...(Array(gaps).fill("gap") as Joint[]),
    ...(Array(Math.max(0, nj - leans - gaps)).fill("tight") as Joint[]),
  ];
  const joint: Joint[] = [];
  Array.from({ length: nj }, (_, k) => k + 1)
    .sort((a, b) => rand(a, salt + 2) - rand(b, salt + 2))
    .forEach((i, k) => {
      joint[i] = bag[k]!;
    });

  for (let i = 1; i < n; i++) {
    if (joint[i] === "lean") {
      const theta = 0.11 + rand(i, salt + 6) * 0.07;
      // A book only leans where there is something to lean ON, so which of the
      // pair tips is decided here, with the joint, and never by the book on its
      // own. Either the right one tips left onto its neighbour or the left one
      // tips right onto its — both are the same tangency, so both cost the same
      // pitch. A book already leaning, or one that has stepped forward out of
      // reach, keeps what it has: a double lean is a domino, not a shelf.
      if (rand(i, salt + 5) > 0.5 || pose[i - 1]!.lean !== 0) {
        pose[i]!.lean = theta;
      } else {
        pose[i - 1]!.lean = -theta;
      }
      // Leaners share a depth with what they are leaning on. Two books at
      // different z cannot touch, and a lean into thin air reads as falling.
      pose[i]!.dz = pose[i - 1]!.dz;
    }
  }

  // Pass 3 — risers. A cover propped on a flat book breaks the one line every
  // face-out row otherwise draws: eight bases at exactly two heights. Only an
  // upright book gets one; a leaning book on a riser needs the riser tilted
  // too, and that is a prop, not a knob.
  for (let i = 0; i < n; i++) {
    if (pose[i]!.lean === 0 && rand(i, salt + 3) > 0.78) pose[i]!.riser = 0.05;
  }
  for (let i = 0; i < n; i++) {
    pose[i]!.ext = coverExtent(pose[i]!.s, pose[i]!.lean);
  }

  // Pass 4 — solve against physical half-extents. The placer has a hard 4.5cm
  // air-gap invariant: it can vary the rhythm, but it is not allowed to gain
  // space by compressing below tangency or stepping one cover through another.
  const placed = layoutShelfRow(
    pose.map((p, index) => ({ index, halfWidth: p.ext })),
    { left: edgeL, right: EDGE_R },
    {
      minGap: 0.045,
      minGaps: Array.from({ length: n - 1 }, (_, index) =>
        joint[index + 1] === "lean" ? 0.004 : 0.045,
      ),
      gapWeights: Array.from({ length: n - 1 }, (_, index) => {
        const kind = joint[index + 1];
        const variation = 0.85 + rand(index + 1, salt + 9) * 0.3;
        return (kind === "gap" ? 2.2 : kind === "lean" ? 0.01 : 1) * variation;
      }),
    },
  );
  return slice.map((cover, i) => {
    const p = pose[i]!;
    return {
      kind: "cover" as const,
      x: placed[i]!.x,
      url: cover.url,
      key: cover.key,
      label: cover.label,
      color: cover.color,
      thickness: cover.thickness,
      s: p.s,
      yaw: p.yaw,
      lean: p.lean,
      dz: p.dz,
      riser: p.riser,
    };
  });
}

export type FeaturedBookPerchInput = Readonly<{
  id: string;
  title: string;
  coverUrl: string | null;
  pageCount: number | null;
  audioLengthMin: number | null;
}>;

export type FeaturedBookPerchDefinition = Readonly<{
  id: string;
  position: readonly [number, number, number];
  normal: readonly [number, number, number];
  tangent: readonly [number, number, number];
  ownerId: string;
}>;

const BOOK_PERCH_IDS = new Map([
  ["the-12-levers", "books:the-12-levers-pages"],
  ["superminds", "books:superminds-pages"],
  ["life-3-0", "books:life-3-0-pages"],
  ["thinking-fast-and-slow", "books:thinking-fast-and-slow-pages"],
  // Four featured covers was the fewest Perches of any shelf, on the Unit
  // with the most props on it. These three cost nothing to place: the whole
  // point of projecting through the layout is that a Perch on a cover is
  // measured by construction rather than authored.
  ["bowling-alone", "books:bowling-alone-pages"],
  ["barking-up-the-wrong-tree", "books:barking-up-the-wrong-tree-pages"],
  ["homo-deus", "books:homo-deus-pages"],
  // The eighth featured cover, and the only one that had no Perch — the top
  // row's rightmost. Owner review: "why can't butterflies land on the top
  // rightmost featured book too?" There was no reason beyond this map: seven
  // ids had been written out by hand against eight covers, so the shelf looked
  // uniform and behaved as though one book were different.
  [
    "7-habits-of-highly-effective-people",
    "books:7-habits-of-highly-effective-people-pages",
  ],
]);

/** Project semantic book Perches through the exact count-dependent layout
 * used by the rendered featured rows. A Featured? edit recomposes both rows,
 * so the stable interaction id cannot safely be paired with a static point. */
export function featuredBookPerchDefinitions(
  books: readonly FeaturedBookPerchInput[],
): FeaturedBookPerchDefinition[] {
  const featured = books
    .filter((book): book is FeaturedBookPerchInput & { coverUrl: string } =>
      Boolean(book.coverUrl),
    )
    .map((book) => ({
      url: book.coverUrl,
      key: book.id,
      label: book.title,
      color: "#000000",
      thickness: featuredBookThickness(book.pageCount, book.audioLengthMin),
    }));
  const rows = splitShelfRows(featured, SHELF_CAP);
  const placed = [
    ...layoutFeatured(rows.top, 16, EDGE_L_TOP).map((item) => ({
      item,
      shelfY: SHELF_SURFACE.top,
    })),
    ...layoutFeatured(rows.lower, 41, EDGE_L_LOWER).map((item) => ({
      item,
      shelfY: SHELF_SURFACE.lower,
    })),
  ];
  return placed.flatMap(({ item, shelfY }) => {
    if (item.kind !== "cover") return [];
    const perchId = BOOK_PERCH_IDS.get(item.key);
    if (!perchId) return [];
    const scale = item.s ?? 1;
    const lean = item.lean ?? 0;
    const thickness = item.thickness ?? 0.048;
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, item.yaw ?? 0, lean),
    );
    const position = new THREE.Vector3(
      0.005,
      (COVER_H - 0.014) / 2,
      -thickness / 2 - 0.003,
    )
      .multiplyScalar(scale)
      .applyQuaternion(quaternion)
      .add(
        new THREE.Vector3(
          item.x,
          shelfY + coverSeat(scale, lean, item.riser ?? 0),
          0.18 + (item.dz ?? 0),
        ),
      );
    const normal = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(quaternion)
      .normalize();
    const tangent = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(quaternion)
      .normalize();
    return [
      {
        id: perchId,
        position: position.toArray() as [number, number, number],
        normal: normal.toArray() as [number, number, number],
        tangent: tangent.toArray() as [number, number, number],
        ownerId: `book:${item.key}`,
      },
    ];
  });
}

/** Bookend hit proxy. The L-steel's vertical plate is 0.012 wide — three
 * pixels from the camera — so hovering it is luck, not aim. A zero-opacity
 * box gives it a 17-pixel target, the same trick the golf ball uses. Kept
 * narrow on purpose: the packed row starts a few centimetres away and a
 * generous proxy would claim the first spine's slot instead. */
function BookendTarget() {
  return (
    <mesh position={[0, 0.11, 0]}>
      <boxGeometry args={[0.07, 0.23, 0.16]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function BooksArrivalBeat({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  useUnitFrame(() => {
    if (group.current)
      group.current.position.z = enabled
        ? -0.11 * (1 - arrivalBeatRef.booksCoverProgress)
        : 0;
  });
  return <group ref={group}>{children}</group>;
}

export default function UnitBooks({
  data,
  palette,
  dark,
  index,
  coverWidth,
  onOpenBook,
}: UnitProps) {
  const textured = useUnitLod(index);
  /**
   * THE FEATURED SHELF — the owner's own `Featured?` checkbox in Notion, not a
   * rule of mine. `data.featuredBooks` arrives already filtered to books with a
   * cover and ordered newest-finished-first, and every one of them is also in
   * `shelfBooks`, so their covers are pre-decoded by Scene's warming pass and
   * clickable through the same `onOpenBook` the row has always used.
   *
   * The checkbox list can grow beyond the measured eight-cover physical rank.
   * The scene keeps the newest two rows and the complete collection remains in
   * the DOM library; a content edit can never crash the canvas. An EMPTY list
   * renders no front row at
   * all and leaves two full packed rows of spines behind it. That is a shelf,
   * not a hole; do not "fix" the emptiness.
   *
   * Match is on `book.id`, never on title: the library has two reads of
   * "7 Habits of Highly Effective People" and only the 2023 one is ticked.
   */
  const featured = useMemo(
    () =>
      data.featuredBooks
        .filter((book) => book.coverUrl)
        .map((book) => {
          const sampled = data.featuredBookColors[book.id] ?? {
            edge: fallbackCoverEdgeColor(book.id),
            source: "fallback" as const,
          };
          return {
            url: book.coverUrl!,
            key: book.id,
            label: book.title,
            color: readingBookMaterialColors(sampled.edge, palette.pages, dark)
              .cover,
            thickness: featuredBookThickness(
              book.pageCount,
              book.audioLengthMin,
            ),
          };
        }),
    [dark, data.featuredBookColors, data.featuredBooks, palette.pages],
  );

  /**
   * HOW A FEATURED BOOK IS HIGHLIGHTED, and why it is not a graphic.
   *
   * The brief is "highlight those on the bookshelf", and the house rules rule
   * out the obvious answers — no pills, no badges, no glow, nothing that reads
   * as UI pasted onto a 3D object. A bookshelf already has a vocabulary for
   * "this one matters" and it is physical: you turn the book cover-out and you
   * stand it in front of the row instead of in it.
   *
   * So the packed rows behind are now spines ONLY (packRow is given no covers),
   * and the featured books stand as their own short row 0.12 forward of them,
   * face to the viewer. Three things fall out of that and all three are what
   * makes it read at a 2.24° grazing camera:
   *   - a cover is 0.36 × 0.52 against a spine's 0.055…0.130 wide, so the
   *     featured books are the only wide masses on the shelf;
   *   - standing 0.12 proud puts them clear of the stepped spine fronts (which
   *     sit at about z 0.02) and under the top plank's own light fixture, so
   *     they are the lit objects and the row behind them is the dark one;
   *   - they are the only books on the unit that open a NOTE rather than the
   *     library, which the hover lift already advertises.
   *
   * WHAT IT MUST NOT BE is the thing it was: four covers per shelf at one
   * pitch, one size, one angle, one depth, both rows starting at the same x.
   * "Featured" has to come from being cover-out and standing proud of the row
   * — not from being regimented — so the variation all lives INSIDE that.
   * `layoutFeatured` above owns it; the only thing decided here is how many
   * books each shelf gets.
   *
   * Each row is capped at its measured four-cover capacity. Odd counts still
   * split 4/3 rather than leaving a visual hole; an empty list renders no front
   * rank at all.
   */
  const [topFeatured, lowerFeatured] = useMemo(() => {
    const rows = splitShelfRows(featured, SHELF_CAP);
    return [
      layoutFeatured(rows.top, 16, EDGE_L_TOP),
      layoutFeatured(rows.lower, 41, EDGE_L_LOWER),
    ];
  }, [featured]);

  /** The rows BEHIND the featured books. No covers at all now — the packed
   * block is scenery, and giving it covers put a second, competing face-out
   * book in a row whose whole job is to be the quiet backdrop the featured
   * ones stand against. Passing `[]` also retires the old coupling where the
   * number of featured books was an OUTPUT of packRow's salt. */
  const topRow = useMemo(() => packRow(2.42, [], palette, 15), [palette]);
  const lowerRow = useMemo(() => packRow(2.28, [], palette, 40), [palette]);

  const interactionInput = useMemo(
    () =>
      ({
        unitIndex: index,
        expectedFeaturedIds: [...topFeatured, ...lowerFeatured].flatMap(
          (book) => (book.kind === "cover" ? [book.key] : []),
        ),
        rows: [
          {
            shelf: "top",
            salt: 16,
            role: "featured",
            items: topFeatured,
          },
          {
            shelf: "lower",
            salt: 41,
            role: "featured",
            items: lowerFeatured,
          },
          {
            shelf: "top",
            salt: 15,
            role: "packed",
            items: topRow,
          },
          {
            shelf: "lower",
            salt: 40,
            role: "packed",
            items: lowerRow,
          },
        ],
      }) satisfies BookInteractionInput,
    [index, topRow, lowerFeatured, lowerRow, topFeatured],
  );
  const interactionInventory = useMemo(
    () => buildBookInteractions(interactionInput),
    [interactionInput],
  );
  const bookcaseRoot = useRef<THREE.Group>(null);

  useEffect(() => {
    // Canvas markup cannot expose a semantic census. This dev hook mirrors the
    // exact arrays rendered below so QA can address every physical volume and
    // prove that one hover key moves one book only.
    setBookInteractionInventory(interactionInput);
    return () => setBookInteractionInventory(null);
  }, [interactionInput]);

  return (
    <group>
      {process.env.NODE_ENV !== "production" && (
        <BookInteractionProbe
          index={index}
          root={bookcaseRoot}
          inventory={interactionInventory}
        />
      )}
      <group ref={bookcaseRoot} name="stacks-books-bookcase">
        <group>
          <ShelfUnit
            palette={palette}
            toneSeed={index}
            lower={
              <group>
                <group position={[0, 0, 0]}>
                  <BookRowMesh
                    items={lowerRow}
                    palette={palette}
                    salt={40}
                    textured={textured}
                    coverWidth={coverWidth}
                    onCoverClick={onOpenBook}
                    linkUnit={index}
                    grabbableVolumes
                  />
                  {/* L-steel pair holds the short row's loose start. It is
                    authored 2.6° off plumb — a bookend takes the row's lean —
                    and the pointer eases it upright, as if you had just
                    straightened the shelf. Same rest+settle channel the
                    photographs use, so it settles on the house curve. */}
                  <HoverProp
                    unitIndex={index}
                    hoverKey="bookend:books:lower"
                    base={[-1.18, 0, 0]}
                    lift={[0, 0, 0.012]}
                    rest={[0, 0, -0.046]}
                    settle={0.046}
                  >
                    <Bookend palette={palette} />
                    <BookendTarget />
                  </HoverProp>
                </group>
                {/* The lower front rank needs another 3 cm over the top row:
                  its deterministic leftmost cover otherwise begins 18 mm
                  inside the deepest packed spine at the same x. */}
                {lowerFeatured.length > 0 && (
                  <group position={[0, 0, LOWER_FEATURED_ROW_Z]}>
                    <BookRowMesh
                      items={lowerFeatured}
                      palette={palette}
                      salt={41}
                      textured={textured}
                      coverWidth={coverWidth}
                      onCoverClick={onOpenBook}
                      linkUnit={index}
                      grabbableCovers
                      grabbableVolumes
                    />
                  </group>
                )}
              </group>
            }
          >
            {/* The featured half of the shelf, standing 0.12 forward of the
              packed spines. It is a sibling of the packed row rather than a
              child of it, because the row's own group carries an x offset for
              the placard and the featured layout is solved in unit space. */}
            {topFeatured.length > 0 && (
              <group position={[0, 0, 0.12]}>
                <BookRowMesh
                  items={topFeatured}
                  palette={palette}
                  salt={16}
                  textured={textured}
                  coverWidth={coverWidth}
                  onCoverClick={onOpenBook}
                  linkUnit={index}
                  grabbableCovers
                  grabbableVolumes
                  firstCoverArrivalProgress={() =>
                    arrivalBeatRef.booksCoverProgress
                  }
                />
              </group>
            )}
            <group position={[-0.05, 0, 0]}>
              <BookRowMesh
                items={topRow}
                palette={palette}
                salt={15}
                textured={textured}
                coverWidth={coverWidth}
                onCoverClick={onOpenBook}
                linkUnit={index}
                grabbableVolumes
              />
              {/* Its twin on the top row, leaning the other way against the
                packed spines. */}
              <BooksArrivalBeat enabled={topFeatured.length === 0}>
                <HoverProp
                  unitIndex={index}
                  hoverKey="bookend:books:top"
                  base={[-1.22, 0, 0]}
                  lift={[0, 0, 0.012]}
                  rest={[0, 0, 0.042]}
                  settle={0.042}
                >
                  <Bookend palette={palette} />
                  <BookendTarget />
                </HoverProp>
              </BooksArrivalBeat>
            </group>
          </ShelfUnit>
        </group>
      </group>
    </group>
  );
}
