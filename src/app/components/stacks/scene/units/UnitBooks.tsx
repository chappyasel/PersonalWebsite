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
import Grabbable from "../Grabbable";
import ModelProp from "../ModelProp";
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
  FEATURED_COVER_Z,
  type RowItem,
  ShelfUnit,
  coverExtent,
  coverSeat,
  flatVolumeHeights,
  packRow,
} from "../primitives";
import { SHELF_SURFACE } from "../shelfGeometry";
import { layoutShelfRow, splitShelfRows, widestRowGap } from "../shelfSpacing";
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
/** The top packed row is nudged left of unit origin to clear the placard. It
 * is a named constant rather than a number typed into the group below because
 * anything measured against the FEATURED rank has to be shifted by it to land
 * in this row's frame. */
export const TOP_PACKED_ROW_OFFSET_X = -0.05;
/** The lower plank is shallower, so its two ranks sit farther back as a pair.
 * Each rank keeps 0.19–0.20 units of separation while every complete book,
 * including a featured-book riser, remains over wood. */
export const TOP_PACKED_ROW_Z = -0.04;
export const LOWER_PACKED_ROW_Z = -0.22;
export const TOP_FEATURED_ROW_Z = 0.15;
export const LOWER_FEATURED_ROW_Z = -0.02;

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
    author?: string;
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
  // packed spine is 0.24…0.34 deep with its BACK squared to the shelf. After
  // PACKED_ROW_Z, the deepest front reaches z 0.15. A cover set even slightly
  // back from its neighbours can therefore end up behind a fat spine; keeping
  // dz positive preserves the visible gap across varying physical thicknesses.
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
      author: cover.author,
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

/**
 * WHAT IS LYING ON THE FLAT STACK.
 *
 * Every packed row puts down one horizontal stack of two or three books, and
 * the top of that stack is the one flat surface on this Unit that is not the
 * plank itself — which is exactly where these two things end up in real life.
 * They sit ON the books rather than beside them: a pair of headphones and a
 * face-down phone left on top of the pile is a person's shelf, and standing
 * either of them on bare wood in a gap is a display.
 *
 * Neither x is authored. The stack's position is `packRow`'s output and moves
 * whenever the shelf recomposes, so both props read it back out of the
 * rendered row and stand down if that row has no stack.
 *
 * They mount INSIDE the packed row's own group, so the row's x offset and its
 * z both come for free and cannot drift from the books they rest on.
 */
const BOOKS_HEADPHONES = {
  /** Front view — the band arcing over two cups. The GLB's narrow axis is X,
   * so the pair needs a quarter turn to face the room at all
   * (`stacks-render headphones --yaws 0,90` shows both views). Off 90° by a
   * few degrees so they were set down, not squared up. */
  yaw: 1.44,
  /** X 0.9046 × Z 0.5294 at unit scale → 0.262 × 0.153 here, which sits
   * inside the flat book's own 0.32 × 0.24 top face with a margin all round.
   * Anything bigger overhangs the pile it is supposed to be resting on. */
  scale: 0.29,
} as const;

/** The Beats red from Musings. Same pair, carried in here and dropped on the
 * books — the room already reuses the desk lamp and the mug across two Units
 * each, and a second colourway would read as a second pair of headphones. */
const BOOKS_HEADPHONE_TINTS = {
  light: {
    GrayTone1: "#aa1630",
    GrayTone3: "#9a9da2",
    GrayTone2: "#211316",
  },
  dark: {
    GrayTone1: "#aa1630",
    GrayTone3: "#777b82",
    GrayTone2: "#140b0d",
  },
} as const;
const BOOKS_HEADPHONE_MATERIALS = {
  GrayTone1: { roughness: 0.72 },
  GrayTone3: { metalness: 0.55, roughness: 0.3 },
  GrayTone2: { roughness: 0.86 },
} as const;

const BOOKS_PHONE = {
  /** Face DOWN, the way a phone gets put down on a book. `[−π/2, 0, θ]` is
   * the room's existing form for this (Projects uses the same): the Z term is
   * an in-plane spin applied before the phone is laid over, so it becomes the
   * flat yaw once it is down. Turned a few degrees off the book's own edge so
   * it was dropped there rather than aligned to it. */
  rotation: [-Math.PI / 2, 0, 1.42] as [number, number, number],
  /** X 0.7599 × Y 1.5042 × Z 0.1761 → 0.167 × 0.331 × 0.039 laid flat. The
   * long axis runs across the stack at 0.331 against the book's 0.32, so it
   * overhangs by a millimetre either end, which is what a phone on a book
   * does. */
  scale: 0.22,
  /** Half the flat thickness: 0.1761 × 0.22 / 2. */
  seat: 0.0194,
} as const;

/**
 * Where the laid-over phone has to be mounted for it to REST ON the stack
 * rather than hang off it.
 *
 * Every prop GLB in /models is normalized bottom-at-origin, so the phone's
 * length runs 0 → 1.5042 up from its origin instead of straddling it. Stood
 * up that is exactly what you want; laid over it means the body extends a
 * full length sideways FROM the mount point, and the phone ends up beside the
 * books with nothing underneath it. It is a real overhang, not a trick of the
 * camera — the first capture had two thirds of the phone off the pile.
 *
 * The correction is half a length back along wherever the length axis now
 * points. `THREE.Euler`'s default XYZ order applies the Z term FIRST, so the
 * model's +Y maps to (−sin θ, 0, −cos θ) after the lay-over, and the offset is
 * the negative half of that. Derived rather than typed in, so changing the
 * yaw or the scale cannot silently strand the phone again.
 */
const PHONE_FLAT_LENGTH = 1.5042 * BOOKS_PHONE.scale;
const BOOKS_PHONE_MOUNT: [number, number, number] = [
  (PHONE_FLAT_LENGTH / 2) * Math.sin(BOOKS_PHONE.rotation[2]),
  BOOKS_PHONE.seat,
  (PHONE_FLAT_LENGTH / 2) * Math.cos(BOOKS_PHONE.rotation[2]),
];

/**
 * The visible hole in a front rank, expressed in the PACKED row's frame.
 *
 * The two rows do not share an origin — the top packed row carries a −0.05
 * offset for the placard — so a gap measured against the covers has to be
 * shifted before the row behind can be told where it is. Getting this wrong
 * moves the stack by 5cm, which is most of a book.
 */
function featuredGapInRowFrame(featured: RowItem[], rowOffsetX: number) {
  const gap = widestRowGap(
    featured.flatMap((item) =>
      item.kind === "cover"
        ? [{ x: item.x, halfWidth: coverExtent(item.s ?? 1, item.lean ?? 0) }]
        : [],
    ),
  );
  return gap
    ? { left: gap.left - rowOffsetX, right: gap.right - rowOffsetX }
    : undefined;
}

/** The top face of a packed row's horizontal stack, in the ROW's own frame —
 * or null for a row that generated no stack. `packRow` steps each volume up
 * by its own height and staggers it, so the resting surface is the top of the
 * last volume, not of the item's origin.
 *
 * A wide row is allowed two stacks and only the one in `window` is the one
 * standing in the open, so the window picks which stack a prop rests on. */
function flatStackTop(
  row: RowItem[],
  window?: { left: number; right: number },
): { x: number; y: number } | null {
  const stacks = row.filter((item) => item.kind === "flat");
  const stack =
    (window &&
      stacks.find((item) => item.x >= window.left && item.x <= window.right)) ??
    stacks[0];
  if (stack?.kind !== "flat") return null;
  return {
    x: stack.x + (stack.n - 1) * (stack.staggerX ?? 0.012),
    // Volumes carry their own thickness now — a book lying down is as thick as
    // it is long — so the pile's height is a SUM. `n × height` was right only
    // while every book in it was the same size, and it would leave the props
    // floating above a thin stack or sunk into a fat one.
    y: flatVolumeHeights(stack).reduce((total, h) => total + h, 0),
  };
}

export type FeaturedBookPerchInput = Readonly<{
  id: string;
  title: string;
  /** Portal Label detail line; perch fixtures may omit it. */
  author?: string;
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
      author: book.author,
      color: "#000000",
      thickness: featuredBookThickness(book.pageCount, book.audioLengthMin),
    }));
  const rows = splitShelfRows(featured, SHELF_CAP);
  const placed = [
    ...layoutFeatured(rows.top, 16, EDGE_L_TOP).map((item) => ({
      item,
      shelfY: SHELF_SURFACE.top,
      rowZ: TOP_FEATURED_ROW_Z,
    })),
    ...layoutFeatured(rows.lower, 41, EDGE_L_LOWER).map((item) => ({
      item,
      shelfY: SHELF_SURFACE.lower,
      rowZ: LOWER_FEATURED_ROW_Z,
    })),
  ];
  return placed.flatMap(({ item, shelfY, rowZ }) => {
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
          rowZ + FEATURED_COVER_Z + (item.dz ?? 0),
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
  onOpenBookId,
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
            author: book.author,
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
   * and the featured books stand as their own short row in front of them,
   * face to the viewer. Three things fall out of that and all three are what
   * makes it read at a 2.24° grazing camera:
   *   - a cover is 0.36 × 0.52 against a spine's 0.055…0.130 wide, so the
   *     featured books are the only wide masses on the shelf;
   *   - each featured rank sits 0.19–0.20 ahead of its packed rank; the lower
   *     pair moves back together to fit the shallower lower plank;
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

  /**
   * The rows BEHIND the featured books — the rest of the library, and now
   * literally so.
   *
   * No covers at all: giving this block covers put a second, competing
   * face-out book in a row whose whole job is to be the quiet backdrop the
   * featured ones stand against. What it DOES carry is `data.spineBooks` —
   * real finished reads, newest first — so every width on the shelf is a real
   * page count and every volume opens its own notes rather than the index.
   *
   * The top row is dealt first and the lower row continues where it stopped,
   * so the shelf reads newest-at-top rather than restarting halfway down.
   * Both rows still generate scenery past the end of the list, which is what
   * keeps an empty or failed library query rendering a full bookcase.
   *
   * Each row is also told where the rank in FRONT of it has a hole, so its
   * horizontal stack lands somewhere you can see. Left to the roll both stacks
   * came out directly behind a featured cover, which hides the stack and
   * anything resting on it — measured, not guessed: the headphones were
   * invisible in the first capture.
   */
  const [topRow, lowerRow] = useMemo(() => {
    const top = packRow(
      2.42,
      [],
      palette,
      15,
      data.spineBooks,
      featuredGapInRowFrame(topFeatured, TOP_PACKED_ROW_OFFSET_X),
    );
    const placed = new Set(
      top.flatMap((item) =>
        item.kind === "flat"
          ? (item.books ?? []).flatMap((book) => (book ? [book.id] : []))
          : item.kind === "spine" || item.kind === "lean"
            ? item.book
              ? [item.book.id]
              : []
            : [],
      ),
    );
    return [
      top,
      packRow(
        2.28,
        [],
        palette,
        40,
        data.spineBooks.filter((book) => !placed.has(book.id)),
        featuredGapInRowFrame(lowerFeatured, 0),
      ),
    ];
  }, [palette, data.spineBooks, topFeatured, lowerFeatured]);

  // The two flat stacks these props rest on, read back out of the packed rows
  // so the props follow the books rather than a typed-in mark.
  const topStack = useMemo(
    () =>
      flatStackTop(
        topRow,
        featuredGapInRowFrame(topFeatured, TOP_PACKED_ROW_OFFSET_X),
      ),
    [topRow, topFeatured],
  );
  const lowerStack = useMemo(
    () => flatStackTop(lowerRow, featuredGapInRowFrame(lowerFeatured, 0)),
    [lowerRow, lowerFeatured],
  );

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
                <group position={[0, 0, LOWER_PACKED_ROW_Z]}>
                  <BookRowMesh
                    items={lowerRow}
                    palette={palette}
                    salt={40}
                    textured={textured}
                    coverWidth={coverWidth}
                    onCoverClick={onOpenBook}
                    onOpenBookId={onOpenBookId}
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
                  {/* Face down on top of the flat stack, the way a phone gets
                    put down mid-chapter. Portal-free on purpose: the headphones
                    carry the library, and a second portal onto the same place is
                    two names for one thing. It stays a real movable prop —
                    pick it up and throw it like any other. */}
                  {lowerStack && (
                    <Grabbable
                      unitIndex={index}
                      hoverKey="grab:phone:books"
                      base={[lowerStack.x, lowerStack.y, 0]}
                      shadeColor={palette.shadow}
                      // The stack under it already carries the row's contact
                      // shade; a second pool on top of a book is a shadow with
                      // nothing to fall on.
                      shadeWidth={0}
                      shape="box"
                      massKg={0.19}
                    >
                      <group
                        position={BOOKS_PHONE_MOUNT}
                        rotation={BOOKS_PHONE.rotation}
                      >
                        <React.Suspense fallback={null}>
                          <ModelProp
                            url="/models/phone.glb"
                            dark={dark}
                            variant="tinted"
                            scale={BOOKS_PHONE.scale}
                          />
                        </React.Suspense>
                      </group>
                    </Grabbable>
                  )}
                </group>
                {/* Kept on the supported part of the shallower lower plank;
                  clearance comes from moving the packed rank back. */}
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
            {/* The featured half of the shelf, standing clear of the
              packed spines. It is a sibling of the packed row rather than a
              child of it, because the row's own group carries an x offset for
              the placard and the featured layout is solved in unit space. */}
            {topFeatured.length > 0 && (
              <group position={[0, 0, TOP_FEATURED_ROW_Z]}>
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
            <group position={[TOP_PACKED_ROW_OFFSET_X, 0, TOP_PACKED_ROW_Z]}>
              <BookRowMesh
                items={topRow}
                palette={palette}
                salt={15}
                textured={textured}
                coverWidth={coverWidth}
                onCoverClick={onOpenBook}
                onOpenBookId={onOpenBookId}
                linkUnit={index}
                grabbableVolumes
              />
              {/* Left on top of the flat stack. Also THE WAY INTO THE LIBRARY,
                and now the only one on this Unit: every packed volume behind
                used to open the index because none of them was a particular
                book, and they are real reads now that open their own notes.
                Hence the plain `to="books"` copy from the destination table
                rather than a label of its own. */}
              {topStack && (
                <Grabbable
                  unitIndex={index}
                  hoverKey="grab:headphones:books"
                  base={[topStack.x, topStack.y, 0]}
                  shadeColor={palette.shadow}
                  // The books underneath carry the row's contact shade already.
                  shadeWidth={0}
                  to="books"
                >
                  <React.Suspense fallback={null}>
                    <ModelProp
                      url="/models/headphones.glb"
                      dark={dark}
                      variant="tinted"
                      tints={BOOKS_HEADPHONE_TINTS[dark ? "dark" : "light"]}
                      materialProperties={BOOKS_HEADPHONE_MATERIALS}
                      rotation={[0, BOOKS_HEADPHONES.yaw, 0]}
                      scale={BOOKS_HEADPHONES.scale}
                    />
                  </React.Suspense>
                </Grabbable>
              )}
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
