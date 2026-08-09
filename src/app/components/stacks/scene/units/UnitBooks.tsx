"use client";

// The library — packed cover/spine rows on both shelves plus a floor pile.
import { useMemo } from "react";

import { ContactPool } from "../GroundPool";
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
          <BookPile palette={palette} x={-0.85} />
          <ContactPool color={palette.shadow} size={[2.0, 0.46]} position={[0.35, 0, 0.03]} />
          <ContactPool color={palette.shadow} size={[0.78, 0.52]} position={[-0.83, 0, 0.01]} />
        </group>
      }
    >
      <BookRowMesh
        items={topRow}
        palette={palette}
        salt={3}
        textured={textured}
        coverWidth={coverWidth}
        onCoverClick={onOpenBook}
      />
      <ContactPool color={palette.shadow} size={[3.0, 0.5]} position={[0, 0, 0.03]} />
    </ShelfUnit>
  );
}
