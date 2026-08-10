"use client";

// Projects — framed app screenshots; reference books + the trophy below
// (the homework-app acquisition earns it).
import React, { useMemo } from "react";

import { proxied } from "../../theme";
import { ContactShade } from "../GroundPool";
import ModelProp from "../ModelProp";
import { Polaroid } from "../objects";
import PropLink from "../links";
import { DeskFrame, deskFrameHeight, FlatPrint, PhotoMount } from "../photos";
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
          {/* Pothos out at the plank end, where its vines can hang past the
              edge instead of lying on the wood — that overhang is the whole
              reason to own one. Everything else on this shelf is flat and
              rectangular, so the trailing silhouette does real work.
              The pot used to hover with daylight under it. Cause: the model
              pipeline normalises every prop to bottom-at-origin, and this
              prop's lowest vertex is a trailing VINE TIP, not the pot. Split
              into connected islands the GLB reads pot = y 0.2182..0.6182 and
              vine = y 0.0000..0.6874, so y=0 seated the vine on the wood and
              carried the pot 0.2182 (×0.5 = 0.109) into the air. The scale
              was never wrong — the contact plane was.
              So: offset the MODEL down by that measured 0.109 to stand the
              pot on the wood, and pose the plant so every vertex that now
              falls below the shelf line does so in free air rather than
              through the plank. yaw 0.279 with the pot axis at (−1.459,
              0.079) is a solved placement, not a guess — it puts all 116
              sub-surface vertices past the plank's end and front lip while
              keeping the pot's whole footprint on the wood. The offset lives
              on the ModelProp, not the group, so the contact shade stays
              planted at the wood (the BookPile rule). */}
          <group position={[-1.5, 0, 0.14]}>
            <React.Suspense fallback={null}>
              <ModelProp
                url="/models/pothos.glb"
                dark={dark}
                variant="recolor"
                position={[0, -0.1091, 0]}
                rotation={[0, 0.279, 0]}
                scale={0.5}
              />
            </React.Suspense>
            <ContactShade
              color={palette.shadow}
              width={0.3}
              position={[0.041, 0.02, -0.061]}
            />
          </group>
          <React.Suspense fallback={null}>
            {/* Metal exception: the shared atlas material is metalness 0, so
                the trophy read as terracotta (audit §3-Projects). */}
            {/* 1.55 → 0.227 m tall. At 1.2 it stood 0.175 m, which is a
                desk ornament rather than the cup an acquisition earns. */}
            <ModelProp
              url="/models/trophy.glb"
              dark={dark}
              atlasOverride={{ metalness: 0.35, roughness: 0.35 }}
              position={[-0.6, 0, 0]}
              rotation={[0, 0.3, 0]}
              scale={1.55}
            />
          </React.Suspense>
          {/* Projects had no photograph of a person anywhere — only app
              screenshots, which made the unit read as a portfolio grid
              rather than as work he did with people. The builder cabin
              anchors it; the whiteboard and couch frames sit either side of
              the trophy, and one lies flat so the row isn't a picket fence. */}
          <PhotoMount
            unitIndex={index}
            id="projects-cabin"
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
          </PhotoMount>
          {/* Links out: the whiteboard shot came off a tweet, and the id
              survived verbatim in the archived filename. */}
          <PhotoMount
            unitIndex={index}
            id="projects-whiteboard"
            position={[-0.2, 0.1425, 0.12]}
            rotation={[-0.15, -0.12, 0.04]}
            href="https://x.com/i/status/1778892048747417620"
          >
            <Polaroid
              src="/images/stacks/projects-whiteboard.jpg"
              palette={palette}
              textured={textured}
            />
          </PhotoMount>
          {/* The Mac, and the door to his GitHub.
              It is a compact Macintosh rather than a modern laptop, and that
              is the whole reason it works: at the ~25px this subtends on
              screen a MacBook is a grey wedge, while the beige box with the
              recessed screen, the floppy slot and the chin is unmistakable
              from across the room. The Happy Mac face reads as switched on.
              Two things it needs. The face must point at the camera, and the
              screen materials must stay OUT of the tint or it goes dark.
              On the yaw: the model audit reported "front faces −Z, needs
              rotation-y = π", which shipped an anonymous beige box. The
              audit's rasterizer keeps the SMALLER depth (`d < zbuf[i]`) with
              d = z at yaw 0, so its camera sits at −Z looking toward +Z —
              the opposite side from this scene's camera. Every yaw it
              reports is therefore π out. The front already faces the viewer
              at 0; the 0.34 only turns it off-square. */}
          <PropLink
            unitIndex={index}
            hoverKey="link:projects:mac"
            base={[0.58, 0, -0.06]}
            href="https://github.com/chappyasel"
          >
            <React.Suspense fallback={null}>
              <ModelProp
                url="/models/mac.glb"
                dark={dark}
                variant="tinted"
                tints={{
                  M_plastic_bone: palette.paper,
                  M_plastic_bone_shad: palette.metal,
                }}
                rotation={[0, -0.34, 0]}
                scale={5.0}
              />
            </React.Suspense>
          </PropLink>
          <ContactShade
            color={palette.shadow}
            width={0.3}
            position={[0.58, 0.02, -0.03]}
          />
          {/* Lying flat, so it rises off the wood rather than toward the
              viewer — the standing lift would slide it across the shelf. */}
          <PhotoMount
            unitIndex={index}
            id="projects-couch"
            position={[0.6, 0.003, 0.2]}
            rotation={[0, -0.42, 0]}
            lift={[0, 0.014, 0]}
          >
            <FlatPrint
              src="/images/stacks/projects-couch.jpg"
              palette={palette}
              textured={textured}
            />
          </PhotoMount>
        </group>
      }
    >
      {/* Same hidden-third-frame bug Talks had: a 2.6-wide row centred at
          local x 0 puts frame 3 at 0.49…1.25, and the desktop placard starts
          somewhere between +0.28 and +1.51 depending on the window, moving
          ±0.49 more as the camera pans with the pointer. UnitBooks fixed this
          by hand in v4; Projects and Talks never got the same treatment. */}
      <group position={[-0.25, 0, 0]}>
        <FrameRow
          frames={frames}
          width={2.6}
          palette={palette}
          textured={textured}
          onFrameClick={onOpenUrl}
        />
      </group>
    </ShelfUnit>
  );
}
