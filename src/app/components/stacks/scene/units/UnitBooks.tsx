"use client";

// The library — packed cover/spine rows on both shelves plus a floor pile,
// bookends holding the loose row ends, and a library ladder leaning on the
// unit's left flank. The featured covers open their own notes; every other
// book on the unit — spine, flat stack, leaner, pile — opens the library
// itself (`linkUnit`).
import React, { useMemo } from "react";

import { FootPool } from "../GroundPool";
import ModelProp from "../ModelProp";
import { Polaroid } from "../objects";
import { DeskFrame, deskFrameHeight, PhotoMount } from "../photos";
import { Bookend, BookPile, BookRowMesh, packRow, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

export default function UnitBooks({
  data,
  palette,
  dark,
  index,
  coverWidth,
  onOpenBook,
}: UnitProps) {
  const textured = useUnitLod(index);
  const covers = useMemo(
    () =>
      data.shelfBooks
        .filter((book) => book.coverUrl)
        .map((book) => ({ url: book.coverUrl!, key: book.id })),
    [data.shelfBooks],
  );
  const topRow = useMemo(
    () => packRow(2.9, covers.slice(0, 8), palette, 3),
    [covers, palette],
  );
  const lowerRow = useMemo(
    () => packRow(1.9, covers.slice(8, 14), palette, 11),
    [covers, palette],
  );

  return (
    <group>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
          <group>
            <group position={[0.35, 0, 0]}>
              <BookRowMesh
                items={lowerRow}
                palette={palette}
                salt={11}
                textured={textured}
                coverWidth={coverWidth}
                onCoverClick={onOpenBook}
                linkUnit={index}
              />
              {/* L-steel pair holds the short row's loose start. */}
              <group position={[-1.0, 0, 0]}>
                <Bookend palette={palette} />
              </group>
            </group>
            <BookPile palette={palette} x={-0.85} salt={23} linkUnit={index} />
            {/* Both rows are packed edge to edge, so the photographs prop
                against the books at the shelf's front lip (z 0.22 clears the
                0.3-deep spines) — which is where you'd actually stand a
                picture on a full bookshelf. NOISE in his own hand in front
                of his own shelf is the anchor; it earns the frame — and it
                links, since the tweet id survived verbatim in the archived
                filename. */}
            <PhotoMount
              unitIndex={index}
              id="books-noise"
              position={[-0.22, deskFrameHeight(0.21) / 2, 0.22]}
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
              position={[0.2, 0.1425, 0.24]}
              rotation={[-0.14, -0.1, 0.03]}
            >
              <Polaroid
                src="/images/stacks/books-quiet.jpg"
                palette={palette}
                textured={textured}
              />
            </PhotoMount>
            {/* Left of the floor pile, clear of both packed rows — in front
                of the TOP row it covered a featured cover, which is the one
                thing the shelf can't afford. */}
            <PhotoMount
              unitIndex={index}
              id="books-goldenhour"
              position={[-1.16, 0.1425, 0.12]}
              rotation={[-0.16, 0.24, -0.05]}
            >
              <Polaroid
                src="/images/stacks/books-goldenhour.jpg"
                palette={palette}
                textured={textured}
              />
            </PhotoMount>
          </group>
        }
      >
        {/* x −0.1 un-hides the rightmost cover from the desktop placard. */}
        <group position={[-0.1, 0, 0]}>
          <BookRowMesh
            items={topRow}
            palette={palette}
            salt={3}
            textured={textured}
            coverWidth={coverWidth}
            onCoverClick={onOpenBook}
            linkUnit={index}
          />
          <group position={[-1.48, 0, 0]}>
            <Bookend palette={palette} />
          </group>
        </group>
      </ShelfUnit>
      {/* Library ladder leaning on the LEFT flank — top rail against the
          plank end (base −1.91 + 1.26·sin(0.25) lands the top at −1.60). */}
      <group position={[-1.91, -1.115, -0.12]} rotation={[0, 0, -0.25]}>
        <React.Suspense fallback={null}>
          <ModelProp url="/models/ladder.glb" dark={dark} rotation={[0, 0.1, 0]} scale={0.56} />
        </React.Suspense>
      </group>
      <FootPool
        color={palette.shadow}
        size={[0.5, 0.34]}
        position={[-1.88, -1.115, -0.08]}
      />
    </group>
  );
}
