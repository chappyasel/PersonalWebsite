"use client";

// Musings — leaning notebook spines (front three are the latest posts) and an
// open notebook; paper stack + pen below.
import { useMemo } from "react";

import { ContactPool } from "../GroundPool";
import { NotebookLean, OpenNotebook, PaperStack } from "../objects";
import { ShelfUnit } from "../primitives";
import { type UnitProps } from "./types";

export default function UnitBlog({ data, palette, onOpenUrl }: UnitProps) {
  const clickKeys = useMemo(
    () => data.blogPosts.map((post) => post.link),
    [data.blogPosts],
  );
  return (
    <ShelfUnit
      palette={palette}
      lower={
        <group>
          <group position={[0.25, 0, 0]}>
            <PaperStack palette={palette} />
          </group>
          <ContactPool color={palette.shadow} size={[0.7, 0.48]} position={[0.27, 0, 0.02]} />
        </group>
      }
    >
      <group position={[-0.7, 0, 0]}>
        <NotebookLean
          palette={palette}
          clickKeys={clickKeys}
          onNotebookClick={onOpenUrl}
        />
      </group>
      <group position={[0.85, 0, 0.08]}>
        <OpenNotebook palette={palette} />
      </group>
      <ContactPool color={palette.shadow} size={[0.95, 0.44]} position={[-0.7, 0, 0]} />
      <ContactPool color={palette.shadow} size={[0.8, 0.55]} position={[0.85, 0, 0.08]} />
    </ShelfUnit>
  );
}
