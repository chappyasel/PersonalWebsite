"use client";

// Musings is a working shelf rather than a second photo wall: books, paper,
// an open book, headphones and tea, with plants softening both ends.
import Grabbable from "../Grabbable";
import { ContactShade } from "../GroundPool";
import HeldFacing from "../HeldFacing";
import ModelProp from "../ModelProp";
import { EggLamp, SteamCup } from "../eggs";
import { MUSINGS_LOWER_BOOK } from "../musingsShelfGeometry";
import { PaperStack } from "../objects";
import { BookRowMesh, type RowItem, ShelfUnit, packRow } from "../primitives";
import { useTexture } from "@react-three/drei";
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";

import { ShelfSucculent } from "./ShelfSucculent";
import {
  MUSINGS_LAMP_HEAD_QUATERNION,
  MUSINGS_LAMP_ROOT_SCALE,
  MUSINGS_LAMP_ROOT_YAW,
  MUSINGS_OPEN_BOOK_POSE,
  MUSINGS_TEA_POSE,
} from "./musingsShelfLighting";
import { type UnitProps } from "./types";

const VINEYARD_VINES_STICKER_URL =
  "/images/stacks/vineyard-vines-sticker.svg?v=4";
const VINEYARD_VINES_STICKER_HOVER_KEY = "grab:sticker:vineyard-vines";

/** Shared with the real-geometry landing regression for the masthead Perch. */
export const MUSINGS_SAILBOAT_POSE = {
  base: [1.04, 0, -0.06],
  rotation: [0, Math.PI / 2, 0],
  scale: 0.55,
} as const;

/** A thin, die-cut decal left flat on the wood in front of the sailboat. */
function VineyardVinesSticker({
  unitIndex,
  shadeColor,
}: {
  unitIndex: number;
  shadeColor: string;
}) {
  const texture = useTexture(VINEYARD_VINES_STICKER_URL);
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);

  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={VINEYARD_VINES_STICKER_HOVER_KEY}
      base={[0.9, 0.005, 0.16]}
      shadeColor={shadeColor}
      shadeWidth={0.22}
      shape="box"
      massKg={0.006}
    >
      <HeldFacing
        hoverKey={VINEYARD_VINES_STICKER_HOVER_KEY}
        rest={[-Math.PI / 2, 0, 0]}
      >
        {/* A paper-thin backing gives the physics solver a real hull while
            the textured face stays exactly on its upper surface. */}
        <mesh>
          <boxGeometry args={[0.26, 0.113, 0.01]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            colorWrite={false}
          />
        </mesh>
        <mesh position={[0, 0, 0.0051]}>
          <planeGeometry args={[0.26, 0.113]} />
          <meshStandardMaterial
            map={texture}
            alphaTest={0.02}
            roughness={0.94}
            polygonOffset
            polygonOffsetFactor={-2}
            side={THREE.DoubleSide}
          />
        </mesh>
      </HeldFacing>
    </Grabbable>
  );
}

export default function UnitBlog({ palette, dark, index }: UnitProps) {
  const uprightBooks = useMemo(() => packRow(0.96, [], palette, 75), [palette]);
  const stackedBooks = useMemo<RowItem[]>(
    () => [
      {
        kind: "flat",
        x: MUSINGS_LOWER_BOOK.x,
        n: MUSINGS_LOWER_BOOK.count,
        colors: [palette.spines[6], palette.spines[3], palette.spines[1]],
        width: MUSINGS_LOWER_BOOK.width,
        height: MUSINGS_LOWER_BOOK.height,
        depth: MUSINGS_LOWER_BOOK.depth,
        staggerX: MUSINGS_LOWER_BOOK.staggerX,
      },
    ],
    [palette],
  );

  return (
    <>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
          <group>
            <Grabbable
              unitIndex={index}
              hoverKey="grab:plant:musings"
              base={[-1.12, 0, -0.06]}
              shadeColor={palette.shadow}
              shadeWidth={0.28}
              shape="box"
              colliderProfile="foliage-base"
              massKg={1.2}
            >
              <ShelfSucculent unitIndex={index} dark={dark} />
            </Grabbable>

            <Grabbable
              unitIndex={index}
              hoverKey="grab:mug"
              base={[-0.82, 0, 0.02]}
              shadeColor={palette.shadow}
              shadeWidth={0.32}
            >
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/mug.glb"
                  dark={dark}
                  rotation={[0, 0.9, 0]}
                  scale={2.1}
                />
              </React.Suspense>
            </Grabbable>

            <group position={[-0.3, 0, 0]}>
              <PaperStack palette={palette} linkUnit={index} />
            </group>

            <BookRowMesh
              items={stackedBooks}
              palette={palette}
              salt={47}
              linkUnit={index}
              grabbableVolumes
            />
            <Grabbable
              unitIndex={index}
              hoverKey="grab:sailboat:musings"
              base={[...MUSINGS_SAILBOAT_POSE.base]}
              shadeColor={palette.shadow}
              shadeWidth={0.52}
              shape="box"
              massKg={0.9}
            >
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/sailboat.glb"
                  dark={dark}
                  variant="tinted"
                  tints={{
                    Sail: dark ? "#deddd4" : "#f0eee5",
                    LightWood: dark ? "#805033" : "#985f38",
                    DarkWood: dark ? "#3f261b" : "#57301f",
                    Steel: dark ? "#20374d" : "#1e3a56",
                  }}
                  roughness={0.7}
                  rotation={[...MUSINGS_SAILBOAT_POSE.rotation]}
                  scale={MUSINGS_SAILBOAT_POSE.scale}
                />
              </React.Suspense>
            </Grabbable>
            <React.Suspense fallback={null}>
              <VineyardVinesSticker
                unitIndex={index}
                shadeColor={palette.shadow}
              />
            </React.Suspense>
          </group>
        }
      >
        {/* The top lamp is the shared measured angle-poise rig: its shade glow,
          hot mouth, spot and local spill all switch together. */}
        <group position={[-1.06, 0, -0.07]}>
          <EggLamp
            unitIndex={index}
            palette={palette}
            dark={dark}
            yaw={MUSINGS_LAMP_ROOT_YAW}
            scale={MUSINGS_LAMP_ROOT_SCALE}
            headQuaternion={MUSINGS_LAMP_HEAD_QUATERNION}
          />
          {/* Three measured feet from desk-lamp.glb, transformed by the same
            1.74 scale and body yaw as EggLamp. Separate contact pools keep
            every leg visibly attached to the plank; the former single oval
            sat between them and made the rear foot read as airborne. */}
          <ContactShade
            color={palette.shadow}
            width={0.11}
            height={0.06}
            position={[-0.0832, 0.012, -0.0253]}
          />
          <ContactShade
            color={palette.shadow}
            width={0.11}
            height={0.06}
            position={[0.0082, 0.012, 0.0937]}
          />
          <ContactShade
            color={palette.shadow}
            width={0.11}
            height={0.06}
            position={[0.0669, 0.012, -0.0711]}
          />
        </group>

        <Grabbable
          unitIndex={index}
          hoverKey="grab:headphones"
          base={[0.04, 0, 0.14]}
          shadeColor={palette.shadow}
          shadeWidth={0.46}
        >
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/headphones.glb"
              dark={dark}
              rotation={[0, 0.5, 0]}
              scale={2.9}
            />
          </React.Suspense>
        </Grabbable>

        <Grabbable
          unitIndex={index}
          hoverKey="egg:tea"
          base={[...MUSINGS_TEA_POSE.base]}
          shadeColor={palette.shadow}
          shadeWidth={0.28}
          shape="box"
          massKg={0.3}
          // A SURFACE signature: the cup keeps its nod. The steam already
          // runs `always`, so a hover that only thickens it is a delta on
          // something already moving — "I can't tell the tea cup is doing
          // anything", 2026-08-20 — and the nod is what says WHICH prop.
          signature="steam"
        >
          <SteamCup
            unitIndex={index}
            hoverKey="egg:tea"
            steamAt={[0, 0.122, 0]}
            dark={dark}
            always
          >
            <React.Suspense fallback={null}>
              <ModelProp
                url="/models/cup-tea.glb"
                dark={dark}
                rotation={[...MUSINGS_TEA_POSE.rotation]}
                scale={MUSINGS_TEA_POSE.scale}
              />
            </React.Suspense>
          </SteamCup>
        </Grabbable>

        <Grabbable
          unitIndex={index}
          to="books"
          hoverKey="grab:openbook"
          base={[...MUSINGS_OPEN_BOOK_POSE.base]}
          shadeColor={palette.shadow}
          shadeWidth={0.62}
          shape="box"
          massKg={0.72}
        >
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/open-book.glb"
              dark={dark}
              variant="tinted"
              tints={{ Beige: palette.pages, DarkRed: palette.spines[3] }}
              rotation={[...MUSINGS_OPEN_BOOK_POSE.rotation]}
              scale={MUSINGS_OPEN_BOOK_POSE.scale}
            />
          </React.Suspense>
        </Grabbable>

        <group position={[0.78, 0, 0.02]}>
          <BookRowMesh
            items={uprightBooks}
            palette={palette}
            salt={75}
            linkUnit={index}
            grabbableVolumes
          />
        </group>
      </ShelfUnit>
    </>
  );
}

useTexture.preload(VINEYARD_VINES_STICKER_URL);
