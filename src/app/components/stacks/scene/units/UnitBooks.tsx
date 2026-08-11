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

import { HoverProp } from "../links";
import { Polaroid, polaroidSeat } from "../objects";
import { DeskFrame, deskFrameHeight, PhotoMount } from "../photos";
import {
  Bookend,
  BookRowMesh,
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

/** The featured row's geometry. Left-aligned from x −1.30 at a 0.44 pitch —
 * a cover is 0.36 wide, so that leaves 0.08 of air between them — collapsing
 * toward FEATURED_SPAN once there are more of them than that fits. See the
 * layout note in the component. */
const FEATURED_X0 = -1.3;
const FEATURED_SPAN = 1.65;
const FEATURED_PITCH = 0.44;

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
   * Layout is by count. The list splits across the two shelves — ceil on top —
   * and each row is laid left-aligned from x −1.30 at a pitch that shrinks to
   * fit the readable width. Readable is −1.55…+0.35 here: the plank runs to
   * ±1.60 but the desktop placard covers everything past +0.467 on a 1280 × 900
   * window (its left edge is (viewportWidth/2 − 528) over the 239.6 px per unit
   * this camera holds on an odd unit). At the eight he has ticked that is four
   * per shelf at the full 0.44 pitch, which leaves 0.08 of air between covers.
   */
  const [topFeatured, lowerFeatured] = useMemo(() => {
    const half = Math.ceil(featured.length / 2);
    const row = (slice: typeof featured): RowItem[] => {
      if (slice.length === 0) return [];
      const pitch =
        slice.length === 1
          ? 0
          : Math.min(FEATURED_PITCH, FEATURED_SPAN / (slice.length - 1));
      return slice.map((cover, i) => ({
        kind: "cover" as const,
        x: FEATURED_X0 + i * pitch,
        url: cover.url,
        key: cover.key,
      }));
    };
    return [row(featured.slice(0, half)), row(featured.slice(half))];
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
