"use client";

// Projects — framed app screenshots; reference books + the trophy below
// (the homework-app acquisition earns it).
import React, { useMemo } from "react";

import { proxied } from "../../theme";
import ModelProp from "../ModelProp";
import { BookPile, FrameRow, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

export default function UnitProjects({
  data,
  palette,
  dark,
  index,
  coverWidth,
  onOpenUrl,
}: UnitProps) {
  const textured = useUnitLod(index);
  const frames = useMemo(
    () =>
      data.projects.map((project) => ({
        src: proxied(project.image, coverWidth),
        key: project.link,
      })),
    [data.projects, coverWidth],
  );
  return (
    <ShelfUnit
      palette={palette}
      toneSeed={index}
      lower={
        <group>
          <BookPile palette={palette} x={0.3} salt={47} />
          <React.Suspense fallback={null}>
            {/* Metal exception: the shared atlas material is metalness 0, so
                the trophy read as terracotta (audit §3-Projects). */}
            <ModelProp
              url="/models/trophy.glb"
              dark={dark}
              atlasOverride={{ metalness: 0.35, roughness: 0.35 }}
              position={[-0.6, 0, 0]}
              rotation={[0, 0.3, 0]}
              scale={1.2}
            />
          </React.Suspense>
        </group>
      }
    >
      <FrameRow
        frames={frames}
        width={2.6}
        palette={palette}
        textured={textured}
        onFrameClick={onOpenUrl}
      />
    </ShelfUnit>
  );
}
