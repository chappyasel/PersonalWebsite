"use client";

// Musings is a working shelf rather than a second photo wall: notebooks,
// paper, an open book, headphones and tea, with plants softening both ends.
import Grabbable from "../Grabbable";
import { ContactShade } from "../GroundPool";
import HeldFacing from "../HeldFacing";
import ModelProp from "../ModelProp";
import { EggLamp, SteamCup, Sway } from "../eggs";
import { NotebookLean, PaperStack } from "../objects";
import { BookPile, Bookend, ShelfUnit } from "../primitives";
import { useTexture } from "@react-three/drei";
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";

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
          <meshBasicMaterial
            map={texture}
            transparent
            alphaTest={0.02}
            polygonOffset
            polygonOffsetFactor={-2}
            side={THREE.DoubleSide}
          />
        </mesh>
      </HeldFacing>
    </Grabbable>
  );
}

export default function UnitBlog({
  data,
  palette,
  dark,
  index,
  onOpenUrl,
}: UnitProps) {
  const clickKeys = useMemo(
    () => data.blogPosts.map((post) => post.link),
    [data.blogPosts],
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
              base={[-1.24, 0, -0.02]}
              shadeColor={palette.shadow}
              shadeWidth={0.42}
              shape="box"
              colliderProfile="foliage-base"
              massKg={1.4}
            >
              <Sway unitIndex={index} amount={0.022} rate={0.34} phase={1.8}>
                <React.Suspense fallback={null}>
                  <ModelProp
                    url="/models/potted-plant.glb"
                    dark={dark}
                    rotation={[0, 0.45, 0]}
                    scale={0.78}
                  />
                </React.Suspense>
              </Sway>
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

            <BookPile
              palette={palette}
              x={0.38}
              salt={47}
              linkUnit={index}
              grabbable
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
            yaw={-0.34}
            scale={1.74}
            aimOffset={[0.22, 0.01, 0.24]}
          />
          {/* Three measured feet from desk-lamp.glb, transformed by the same
            1.74 scale and -0.34 yaw as EggLamp. Separate contact pools keep
            every leg visibly attached to the plank; the former single oval
            sat between them and made the rear foot read as airborne. */}
          <ContactShade
            color={palette.shadow}
            width={0.11}
            height={0.06}
            position={[0.029, 0.012, -0.082]}
          />
          <ContactShade
            color={palette.shadow}
            width={0.11}
            height={0.06}
            position={[-0.094, 0.012, 0.004]}
          />
          <ContactShade
            color={palette.shadow}
            width={0.11}
            height={0.06}
            position={[0.068, 0.012, 0.07]}
          />
        </group>

        <group position={[-0.55, 0, 0]}>
          <NotebookLean
            palette={palette}
            clickKeys={clickKeys}
            onNotebookClick={onOpenUrl}
            linkUnit={index}
          />
          <ContactShade
            color={palette.shadow}
            width={0.74}
            height={0.18}
            position={[0, 0.03, 0.1]}
          />
        </group>
        <Grabbable
          unitIndex={index}
          hoverKey="grab:bookend:blog"
          base={[-0.24, 0, 0.02]}
          shadeColor={palette.shadow}
          shadeWidth={0.24}
          shape="box"
          massKg={0.7}
        >
          <group rotation={[0, 0, -0.045]}>
            <Bookend palette={palette} flip />
          </group>
        </Grabbable>

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
          base={[0.39, 0, -0.08]}
          shadeColor={palette.shadow}
          shadeWidth={0.28}
          shape="box"
          massKg={0.3}
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
                rotation={[0, 0.6, 0]}
                scale={2.4}
              />
            </React.Suspense>
          </SteamCup>
        </Grabbable>

        <Grabbable
          unitIndex={index}
          to="books"
          hoverKey="grab:openbook"
          base={[0.8, 0, 0.08]}
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
              rotation={[0, -0.25, 0]}
              scale={0.7}
            />
          </React.Suspense>
        </Grabbable>
      </ShelfUnit>
    </>
  );
}

useTexture.preload(VINEYARD_VINES_STICKER_URL);
