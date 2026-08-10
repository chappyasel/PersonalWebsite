"use client";

// The library — packed cover/spine rows on both shelves plus a floor pile,
// bookends holding the loose row ends, and a library ladder leaning on the
// unit's left flank.
import React, { useMemo } from "react";

import { FootPool } from "../GroundPool";
import ModelProp from "../ModelProp";
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
              />
              {/* L-steel pair holds the short row's loose start. */}
              <group position={[-1.0, 0, 0]}>
                <Bookend palette={palette} />
              </group>
            </group>
            <BookPile palette={palette} x={-0.85} salt={23} />
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
