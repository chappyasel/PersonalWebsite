"use client";

// Projects — framed app screenshots; reference books + the trophy below
// (the homework-app acquisition earns it).
import React, { useMemo } from "react";

import { proxied } from "../../theme";
import { ContactPool } from "../GroundPool";
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
      lower={
        <group>
          <BookPile palette={palette} x={0.3} />
          <React.Suspense fallback={null}>
            <ModelProp url="/models/trophy.glb" dark={dark} position={[-0.6, 0, 0]} rotation={[0, 0.3, 0]} scale={1.2} />
          </React.Suspense>
          <ContactPool color={palette.shadow} size={[0.78, 0.52]} position={[0.32, 0, 0.01]} />
          <ContactPool color={palette.shadow} size={[0.34, 0.26]} position={[-0.6, 0, 0]} />
        </group>
      }
    >
      <FrameRow
        frames={frames}
        width={3.0}
        palette={palette}
        textured={textured}
        onFrameClick={onOpenUrl}
      />
      <ContactPool color={palette.shadow} size={[3.0, 0.5]} position={[0, 0, -0.05]} />
    </ShelfUnit>
  );
}
