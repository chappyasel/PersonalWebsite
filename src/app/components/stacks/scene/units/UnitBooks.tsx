"use client";

// The library — packed cover/spine rows on both shelves plus a floor pile.
import { useMemo } from "react";

import { BookPile, BookRowMesh, packRow, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

export default function UnitBooks({
  data,
  palette,
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
      </group>
    </ShelfUnit>
  );
}
