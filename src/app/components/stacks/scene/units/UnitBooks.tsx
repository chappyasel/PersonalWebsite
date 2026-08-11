"use client";

// The library — packed spine rows on both shelves with the owner's FEATURED
// books standing cover-out in front of them, bookends holding the loose row
// ends, and a floor pile. The featured covers open their own notes; every
// other book on the unit — spine, flat stack, leaner, pile — opens the
// library itself (`linkUnit`).
//
// The unit's left flank is deliberately EMPTY FLOOR. It held a step ladder,
// which the owner has now killed outright ("let's just get rid of the
// ladder"), and the composition is solved without one rather than around a
// hole: the shelves carry the weight, and the run of bare floor under the
// case's left end is the only place in the room where you can see the whole
// of a bookcase's silhouette. If a replacement lands later it goes at
// x ≈ −2.2 on the ground, which is the slot the ladder vacated.
import React, { useMemo } from "react";

import { rand } from "../../theme";
import { HoverProp } from "../links";
import { Polaroid, polaroidSeat } from "../objects";
import { DeskFrame, deskFrameHeight, PhotoMount } from "../photos";
import {
  Bookend,
  BookRowMesh,
  coverExtent,
  packRow,
  type RowItem,
  ShelfUnit,
} from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

/** Rest tilts for this unit's two leaning prints. Named because each is used
 * twice — to pose the print, and to derive the height at which that pose lands
 * on the plank. They were mounted at a bare 0.1425, which was `oldHeight/2 ·
 * cos(lean)` for a Polaroid that has not been 0.24 wide since it was pinned to
 * the house scale, leaving both prints 1.5 cm off the wood. */
const TILT_QUIET: [number, number, number] = [-0.14, -0.1, 0.03];
const TILT_GOLDENHOUR: [number, number, number] = [-0.16, 0.24, -0.05];

/**
 * THE FRONT RANK'S GEOMETRY. Everything here is an EDGE, never a centre.
 *
 * A featured book no longer has one width: it carries its own scale, and a
 * leaning one is wider than an upright one. So the packer below works from
 * real half-extents (`coverExtent`) and only the two outer edges of a row are
 * pinned to these.
 *
 * RIGHT is +0.35. The plank runs to ±1.60, but the desktop placard covers
 * everything past +0.467 on a 1280 × 900 window — its left edge is
 * (viewportWidth/2 − 528) over the 239.6 px per unit this camera holds on an
 * odd unit — and +0.35 keeps a centimetre of margin on the narrowest window
 * that still gets a placard. Anything right of that is invisible on a laptop.
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
const EDGE_R = 0.35;
const EDGE_L_TOP = -1.46;
const EDGE_L_LOWER = -1.4;

/** How many covers a shelf will take before the packer has to start
 * compressing. Five 0.36-wide books touching span 1.72 of the 1.90 available,
 * which leaves just enough for one real gap; a sixth can only be fitted by
 * overlapping them, so the split below sends it to the other shelf instead. */
const SHELF_CAP = 5;
/** Share of the ticked books the TOP shelf takes. Deliberately NOT a half.
 * An even split is the one arrangement that guarantees a reader can pair each
 * book on one shelf with the book above it, which is what makes a shelf read
 * as a grid however prettily each row is spaced. At the eight currently
 * ticked this is 5 and 3. */
const TOP_SHARE = 0.6;

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
type Joint = "front" | "lean" | "tight" | "gap";

function layoutFeatured(
  slice: { url: string; key: string }[],
  salt: number,
  edgeL: number,
): RowItem[] {
  const n = slice.length;
  if (n === 0) return [];

  // Pass 1 — the per-book pose that owes nothing to its neighbours. The scale
  // band bottoms out at 0.80 — a 0.29 × 0.42 book — which is still better than
  // twice the width of the fattest spine behind it, and that ratio is what
  // makes a featured book legible as the wide mass on the shelf.
  //
  // `dz` never goes negative and that is a measurement, not a taste call: a
  // packed spine is 0.26…0.34 deep with its BACK squared to the shelf, so the
  // deepest fronts in the row behind reach z 0.19, against a cover's own front
  // at 0.177 + dz. A cover set even slightly back from its neighbours ends up
  // BEHIND a fat spine, and a featured book with a paperback standing in front
  // of its corner is worse than no depth variation at all.
  const pose: Pose[] = slice.map((_, i) => ({
    s: 0.8 + rand(i, salt) * 0.2,
    yaw: (rand(i, salt + 1) - 0.5) * 0.22,
    lean: 0,
    riser: 0,
    dz: 0.03 + rand(i, salt + 4) * 0.05,
    ext: 0,
  }));

  // Pass 2 — the joints, and the pose changes that only make sense as a pair.
  const nj = n - 1;
  const fronts = n >= 4 ? 1 + (n >= 7 ? 1 : 0) : 0;
  const leans = n >= 2 ? 1 + (n >= 6 ? 1 : 0) : 0;
  const gaps = n >= 3 ? Math.max(1, Math.round((nj - fronts - leans) * 0.55)) : 0;
  const bag: Joint[] = [
    ...(Array(fronts).fill("front") as Joint[]),
    ...(Array(leans).fill("lean") as Joint[]),
    ...(Array(gaps).fill("gap") as Joint[]),
    ...(Array(Math.max(0, nj - fronts - leans - gaps)).fill("tight") as Joint[]),
  ];
  const joint: Joint[] = [];
  Array.from({ length: nj }, (_, k) => k + 1)
    .sort((a, b) => rand(a, salt + 2) - rand(b, salt + 2))
    .forEach((i, k) => {
      joint[i] = bag[k]!;
    });

  for (let i = 1; i < n; i++) {
    if (joint[i] === "front") {
      pose[i]!.dz += 0.085;
    } else if (joint[i] === "lean") {
      const theta = 0.11 + rand(i, salt + 6) * 0.07;
      // A book only leans where there is something to lean ON, so which of the
      // pair tips is decided here, with the joint, and never by the book on its
      // own. Either the right one tips left onto its neighbour or the left one
      // tips right onto its — both are the same tangency, so both cost the same
      // pitch. A book already leaning, or one that has stepped forward out of
      // reach, keeps what it has: a double lean is a domino, not a shelf.
      if (rand(i, salt + 5) > 0.5 || pose[i - 1]!.lean !== 0) {
        pose[i]!.lean = theta;
      } else if (joint[i - 1] !== "front") {
        pose[i - 1]!.lean = -theta;
      } else {
        pose[i]!.lean = theta;
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

  // Pass 4 — pitches, then fit. `snug` is the pitch at which the pair touches;
  // every joint is quoted as a departure from it so the arithmetic is the same
  // whatever the two books happen to be.
  const snug = (i: number) => pose[i - 1]!.ext + pose[i]!.ext;
  const pitch: number[] = [];
  for (let i = 1; i < n; i++) {
    pitch[i] =
      joint[i] === "front"
        ? snug(i) - 0.02
        : joint[i] === "lean"
          ? snug(i) + 0.004
          : joint[i] === "tight"
            ? snug(i) + 0.02
            : snug(i) + 0.12 + rand(i, salt + 7) * 0.14;
  }

  const available = EDGE_R - edgeL;
  const total = () =>
    pose[0]!.ext +
    pose[n - 1]!.ext +
    pitch.reduce((a, b) => a + (b ?? 0), 0);

  // Overflow, in the order that costs the composition least: close the gaps
  // first, and only then squeeze everything. A ninth and tenth tick land in
  // the gaps; an eleventh starts pushing books together. Nothing here can drop
  // a book — the list is the owner's checkbox and every tick has to appear.
  let span = total();
  if (span > available) {
    const slack = pitch.reduce(
      (a, p, i) => a + (joint[i] === "gap" ? p - snug(i) - 0.02 : 0),
      0,
    );
    const k = slack > 0 ? Math.max(0, 1 - (span - available) / slack) : 0;
    for (let i = 1; i < n; i++) {
      if (joint[i] === "gap") {
        pitch[i] = snug(i) + 0.02 + (pitch[i]! - snug(i) - 0.02) * k;
      }
    }
    span = total();
  }
  if (span > available) {
    const room = available - pose[0]!.ext - pose[n - 1]!.ext;
    const sum = pitch.reduce((a, b) => a + (b ?? 0), 0);
    const k = sum > 0 ? Math.max(0.45, room / sum) : 1;
    for (let i = 1; i < n; i++) pitch[i] = pitch[i]! * k;
    span = total();
  }

  // Left-aligned, but not glued to the plank end: a little of the leftover
  // width goes to the row's start so the two shelves do not begin on the same
  // vertical. `rand` on the salt alone gives each shelf its own offset. Capped
  // at 0.22 so that a row with a lot of spare — one or two ticks — still reads
  // as books on the left of a shelf rather than as a display in the middle of
  // one.
  const spare = Math.max(0, available - span);
  let x =
    edgeL +
    pose[0]!.ext +
    Math.min(0.22, spare * (0.14 + rand(0, salt + 8) * 0.3));
  return slice.map((cover, i) => {
    if (i > 0) x += pitch[i]!;
    const p = pose[i]!;
    return {
      kind: "cover" as const,
      x,
      url: cover.url,
      key: cover.key,
      s: p.s,
      yaw: p.yaw,
      lean: p.lean,
      dz: p.dz,
      riser: p.riser,
    };
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
   * NOTHING here hard-codes eight. It is a checkbox list: a ninth tick has to
   * appear on the shelf and an untick has to close the gap, so the layout reads
   * `featured.length` and sizes itself. An EMPTY list — which is what runtime
   * gives until the pending Postgres migration lands — renders no front row at
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
        .map((book) => ({ url: book.coverUrl!, key: book.id })),
    [data.featuredBooks],
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
   * The split is 60/40 rather than half and half, capped at what a shelf can
   * hold. An even split is the arrangement that lets a reader pair every book
   * with the one above it, which is most of what "grid" means; 5 and 3 has no
   * such pairing. Both rows still size themselves off `featured.length`, so a
   * ninth tick lands on the lower shelf, an untick closes the gap, and an
   * empty list renders no front rank at all.
   */
  const [topFeatured, lowerFeatured] = useMemo(() => {
    const top = Math.min(
      SHELF_CAP,
      Math.max(1, Math.ceil(featured.length * TOP_SHARE)),
    );
    return [
      layoutFeatured(featured.slice(0, top), 16, EDGE_L_TOP),
      layoutFeatured(featured.slice(top), 41, EDGE_L_LOWER),
    ];
  }, [featured]);

  /** The rows BEHIND the featured books. No covers at all now — the packed
   * block is scenery, and giving it covers put a second, competing face-out
   * book in a row whose whole job is to be the quiet backdrop the featured
   * ones stand against. Passing `[]` also retires the old coupling where the
   * number of featured books was an OUTPUT of packRow's salt. */
  const topRow = useMemo(() => packRow(2.9, [], palette, 15), [palette]);
    /** 1.9 → 2.6 and the group from x +0.35 to 0.0. With the floor pile gone
   * the lower shelf had 1.05 of bare plank from the plank end to the row's
   * left edge — the largest hole left anywhere in the room. The wider row
   * spans −1.20…+1.19 and closes it; its right end goes behind the desktop
   * placard, which is what a packed block of spines is for. */
  const lowerRow = useMemo(() => packRow(2.6, [], palette, 40), [palette]);

  return (
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
              />
              {/* L-steel pair holds the short row's loose start. It is
                  authored 2.6° off plumb — a bookend takes the row's lean —
                  and the pointer eases it upright, as if you had just
                  straightened the shelf. Same rest+settle channel the
                  photographs use, so it settles on the house curve. */}
              <HoverProp
                unitIndex={index}
                hoverKey="bookend:books:lower"
                base={[-1.28, 0, 0]}
                lift={[0, 0, 0.012]}
                rest={[0, 0, -0.046]}
                settle={0.046}
              >
                <Bookend palette={palette} />
                <BookendTarget />
              </HoverProp>
            </group>
            {/* The featured half of the shelf, standing 0.12 forward of the
                packed spines — see the note on the layout above. */}
            {lowerFeatured.length > 0 && (
              <group position={[0, 0, 0.12]}>
                <BookRowMesh
                  items={lowerFeatured}
                  palette={palette}
                  salt={41}
                  textured={textured}
                  coverWidth={coverWidth}
                  onCoverClick={onOpenBook}
                  linkUnit={index}
                />
              </group>
            )}
            {/* The floor pile is GONE from this unit, and that is a
                consequence of the featured row rather than a taste call: the
                covers now own the front of both shelves from −1.48 to +0.20,
                and a 0.46 × 0.32 pile is the one object left that cannot fit
                behind them (its books reach z 0.16 against the covers' 0.096)
                or beside them without hanging off the plank end — at x −1.42
                it overhung −1.60 by 0.07 and scripts/stacks-floaters.mjs
                caught it immediately, resolving its support against the wrong
                plank. What it was for — a horizontal mass among vertical ones,
                and another door into the library — the packed row's own flat
                stack already provides. */}
            {/* The three loose prints move OUT of the front lip, because the
                featured books now own it: they would have stood in front of
                the one thing on this unit the owner has explicitly curated.
                Two go right of the featured row (they lose their outer edge to
                the placard on a laptop, which a photograph can afford and a
                featured cover cannot) and the golden-hour print takes the
                plank end the packed row never reaches.
                NOISE in his own hand in front of his own shelf is the anchor;
                it earns the frame — and it links, since the tweet id survived
                verbatim in the archived filename. */}
            <PhotoMount
              unitIndex={index}
              id="books-noise"
              position={[0.52, deskFrameHeight(0.21) / 2, 0.24]}
              rotation={[-0.05, 0.14, 0]}
              href="https://x.com/i/status/1835742939928240302"
            >
              <DeskFrame
                src="/images/stacks/books-noise.jpg"
                palette={palette}
                textured={textured}
                width={0.28}
                height={0.21}
              />
            </PhotoMount>
            <PhotoMount
              unitIndex={index}
              id="books-quiet"
              position={[0.9, polaroidSeat(TILT_QUIET), 0.2]}
              rotation={TILT_QUIET}
            >
              <Polaroid
                src="/images/stacks/books-quiet.jpg"
                palette={palette}
                textured={textured}
                anchor="contact"
              />
            </PhotoMount>
            {/* Hard against the plank's left end, in front of the packed row
                and left of the first featured cover at −1.30. */}
            <PhotoMount
              unitIndex={index}
              id="books-goldenhour"
              position={[-1.5, polaroidSeat(TILT_GOLDENHOUR), 0.24]}
              rotation={TILT_GOLDENHOUR}
            >
              <Polaroid
                src="/images/stacks/books-goldenhour.jpg"
                palette={palette}
                textured={textured}
                anchor="contact"
              />
            </PhotoMount>
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
            />
          </group>
        )}
        {/* x −0.1 keeps the packed block's right end off the placard. */}
        <group position={[-0.1, 0, 0]}>
          <BookRowMesh
            items={topRow}
            palette={palette}
            salt={15}
            textured={textured}
            coverWidth={coverWidth}
            onCoverClick={onOpenBook}
            linkUnit={index}
          />
          {/* Its twin on the top row, leaning the other way against the
              packed spines. */}
          <HoverProp
            unitIndex={index}
            hoverKey="bookend:books:top"
            base={[-1.48, 0, 0]}
            lift={[0, 0, 0.012]}
            rest={[0, 0, 0.042]}
            settle={0.042}
          >
            <Bookend palette={palette} />
            <BookendTarget />
          </HoverProp>
        </group>
      </ShelfUnit>
    </group>
  );
}
