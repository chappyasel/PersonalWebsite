"use client";

// Projects — framed app screenshots; reference books + the trophy below
// (the homework-app acquisition earns it).
import React, { useMemo } from "react";

import { proxied } from "../../theme";
import ModelProp from "../ModelProp";
import { Polaroid } from "../objects";
import { DeskFrame, deskFrameHeight, FlatPrint } from "../photos";
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
          <BookPile palette={palette} x={0.3} salt={47} linkUnit={index} />
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
          {/* Projects had no photograph of a person anywhere — only app
              screenshots, which made the unit read as a portfolio grid
              rather than as work he did with people. The builder cabin
              anchors it; the whiteboard and couch frames sit either side of
              the trophy, and one lies flat so the row isn't a picket fence. */}
          <group
            position={[-1.0, deskFrameHeight(0.22) / 2, 0.06]}
            rotation={[-0.1, 0.24, 0.02]}
          >
            <DeskFrame
              src="/images/stacks/projects-cabin.jpg"
              palette={palette}
              textured={textured}
              width={0.31}
              height={0.22}
            />
          </group>
          <group position={[-0.2, 0.1425, 0.12]} rotation={[-0.15, -0.12, 0.04]}>
            <Polaroid
              src="/images/stacks/projects-whiteboard.jpg"
              palette={palette}
              textured={textured}
            />
          </group>
          <group position={[0.6, 0.003, 0.2]} rotation={[0, -0.42, 0]}>
            <FlatPrint
              src="/images/stacks/projects-couch.jpg"
              palette={palette}
              textured={textured}
            />
          </group>
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
