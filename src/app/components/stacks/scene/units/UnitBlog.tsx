"use client";

// Musings — leaning notebook spines (front three are the latest posts), a
// real open book mid-thought, headphones; paper stack + pen cup below.
import React, { useMemo } from "react";

import { ContactPool } from "../GroundPool";
import ModelProp from "../ModelProp";
import { NotebookLean, PaperStack } from "../objects";
import { ShelfUnit } from "../primitives";
import { type UnitProps } from "./types";

export default function UnitBlog({ data, palette, dark, onOpenUrl }: UnitProps) {
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
          <React.Suspense fallback={null}>
            <ModelProp url="/models/mug.glb" dark={dark} position={[-0.55, 0, 0]} rotation={[0, 0.9, 0]} />
          </React.Suspense>
          <ContactPool color={palette.shadow} size={[0.7, 0.48]} position={[0.27, 0, 0.02]} />
          <ContactPool color={palette.shadow} size={[0.26, 0.26]} position={[-0.55, 0, 0]} />
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
      <React.Suspense fallback={null}>
        <ModelProp
          url="/models/open-book.glb"
          dark={dark}
          variant="tinted"
          tints={{ Beige: palette.pages, DarkRed: palette.spines[3] }}
          position={[0.85, 0, 0.08]}
          rotation={[0, -0.35, 0]}
          scale={0.7}
        />
      </React.Suspense>
      <React.Suspense fallback={null}>
        <ModelProp url="/models/headphones.glb" dark={dark} position={[0.12, 0, 0.14]} rotation={[0, 0.5, 0]} scale={2.0} />
      </React.Suspense>
      <ContactPool color={palette.shadow} size={[0.95, 0.44]} position={[-0.7, 0, 0]} />
      <ContactPool color={palette.shadow} size={[0.75, 0.62]} position={[0.85, 0, 0.08]} />
      <ContactPool color={palette.shadow} size={[0.42, 0.3]} position={[0.12, 0, 0.14]} />
    </ShelfUnit>
  );
}
