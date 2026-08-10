"use client";

// Musings — leaning notebook spines (front three are the latest posts), a
// real open book mid-thought, headphones; paper stack + pen cup below.
import React, { useMemo } from "react";

import { ContactShade } from "../GroundPool";
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
            <ContactShade
              color={palette.shadow}
              width={0.55}
              position={[0, 0.02, 0.02]}
            />
          </group>
          <React.Suspense fallback={null}>
            <ModelProp url="/models/mug.glb" dark={dark} position={[-0.55, 0, 0]} rotation={[0, 0.9, 0]} />
          </React.Suspense>
        </group>
      }
    >
      <group position={[-0.7, 0, 0]}>
        <NotebookLean
          palette={palette}
          clickKeys={clickKeys}
          onNotebookClick={onOpenUrl}
        />
        <ContactShade
          color={palette.shadow}
          width={0.8}
          height={0.18}
          position={[0, 0.03, 0.1]}
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
    </ShelfUnit>
  );
}
