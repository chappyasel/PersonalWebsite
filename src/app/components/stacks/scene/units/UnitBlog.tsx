"use client";

// Musings is a working shelf rather than a second photo wall: books, paper,
// an open book, headphones and tea, with plants softening both ends. The
// lower shelf is his writing and a corner of Martha's Vineyard: the 2021
// GPT-3 paper as loose pages, the 2025 Trust essay as a sewn booklet on a
// stand, the town-mileage signpost, a wooden cutout of the island, Gay Head
// Light standing in a tray of sand with its lamp turning, and the Vineyard
// Vines sticker flat in front of them.
import Grabbable from "../Grabbable";
import { ContactShade } from "../GroundPool";
import HeldFacing from "../HeldFacing";
import ModelProp from "../ModelProp";
import { EggLamp, SteamCup } from "../eggs";
import {
  MUSINGS_LIGHTHOUSE_PRINT,
  MUSINGS_LOWER_LAYOUT,
  MUSINGS_PAPER_STACK,
  MUSINGS_TOP_PLANT,
} from "../musingsShelfGeometry";
import { PaperStack } from "../objects";
import { deskFrameHeight } from "../photoGeometry";
import { DeskFrame } from "../photos";
import { BookRowMesh, ShelfUnit, packRow } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { useTexture } from "@react-three/drei";
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";

import { LighthouseBeacon } from "./LighthouseBeacon";
import { MUSINGS_SAND_TRAY_TOP, SandTray } from "./SandTray";
import { ShelfSucculent } from "./ShelfSucculent";
import { TrustEssay } from "./TrustEssay";
import { VineyardCutout } from "./VineyardCutout";
import { VineyardSign } from "./VineyardSign";
import {
  MUSINGS_BOOK_ROW_BASE,
  MUSINGS_BOOK_ROW_SALT,
  MUSINGS_BOOK_ROW_WIDTH,
  MUSINGS_HEADPHONES_BASE,
  MUSINGS_KETTLE_POSE,
  MUSINGS_LAMP_HEAD_QUATERNION,
  MUSINGS_LAMP_ROOT_BASE,
  MUSINGS_LAMP_ROOT_SCALE,
  MUSINGS_LAMP_ROOT_YAW,
  MUSINGS_OPEN_BOOK_POSE,
  MUSINGS_TEA_POSE,
} from "./musingsShelfLighting";
import { type UnitProps } from "./types";

const VINEYARD_VINES_STICKER_URL =
  "/images/stacks/vineyard-vines-sticker.svg?v=4";
const VINEYARD_VINES_STICKER_HOVER_KEY = "grab:sticker:vineyard-vines";

/** Shared with the real-geometry landing regression for the dome Perch.
 * The built GLB is 397 units to the spire tip (357 to the ball) after the
 * pipeline's reproportioning; 0.0016 makes it 0.63 units to the spire, a
 * 32 cm souvenir at the shelf's 2 u/m, under the lower bay's 0.81 of
 * headroom. The tower is round; the yaw only turns the railing seams. */
export const MUSINGS_LIGHTHOUSE_POSE = {
  /** Standing on the crown of the sand in its tray, not on the plank. */
  base: [MUSINGS_LOWER_LAYOUT.lighthouseX, MUSINGS_SAND_TRAY_TOP, -0.08],
  rotation: [0, 0.4, 0],
  scale: 0.0016,
} as const;
export const MUSINGS_LIGHTHOUSE_CARRIER_BASE = [
  MUSINGS_LIGHTHOUSE_POSE.base[0],
  0,
  MUSINGS_LIGHTHOUSE_POSE.base[2],
] as const;
/** The lantern room in the built GLB: glass from 258.6 to 321.0 source
 * units, radius 34.1, at 0.0016 — so the beacon turns at 0.464 above the
 * foot inside a 0.054 glass. Re-measure with `stacks-render` if the model
 * is rebuilt. */
const LIGHTHOUSE_LANTERN = { height: 0.464, radius: 0.054 } as const;

/** Gay Head Light (Aquinnah): weathered red brick gone salmon in the sun,
 * a greyed brownstone corbel band under the gallery, black iron everywhere
 * above it, a lit lantern. Dark keeps the brick and stone a step deeper and
 * turns the lantern up; light keeps the glass pale like the photo and only
 * warms it. The first pass was too deep and saturated for a 170-year-old
 * tower ("more faded/weathered", 2026-08-22). Material roles come from the
 * pipeline's `rematerial` (scripts/stacks-models.mjs). */
const LIGHTHOUSE_TINTS = {
  light: {
    Brick: "#b27b6a",
    Stone: "#a08b74",
    Iron: "#34312c",
    Glass: "#dfe9ee",
  },
  dark: {
    Brick: "#8a5c4e",
    Stone: "#7a6551",
    Iron: "#1f1d1a",
    Glass: "#718087",
  },
} as const;
const LIGHTHOUSE_MATERIALS = {
  light: {
    Brick: { roughness: 0.95 },
    Stone: { roughness: 0.9 },
    Iron: { roughness: 0.55 },
    Glass: { roughness: 0.15 },
  },
  dark: {
    Brick: { roughness: 0.95 },
    Stone: { roughness: 0.9 },
    Iron: { roughness: 0.55 },
    Glass: { roughness: 0.15 },
  },
} as const;

/** J-Toastie's source separates the shell, adjustment rails and ear pads.
 * Keep the shell at Beats red, with neutral rails and near-black cushions. */
const HEADPHONE_TINTS = {
  light: {
    GrayTone1: "#aa1630",
    GrayTone3: "#9a9da2",
    GrayTone2: "#211316",
  },
  dark: {
    GrayTone1: "#aa1630",
    GrayTone3: "#777b82",
    GrayTone2: "#140b0d",
  },
} as const;
const HEADPHONE_MATERIALS = {
  GrayTone1: { roughness: 0.72 },
  GrayTone3: { metalness: 0.55, roughness: 0.3 },
  GrayTone2: { roughness: 0.86 },
} as const;

/** The lighthouse print: a desk frame on a movable carrier, turned to the
 * camera while held, the same carriage the Systems prints ride. */
function MusingsPhoto({
  unitIndex,
  palette,
  textured,
}: {
  unitIndex: number;
  palette: UnitProps["palette"];
  textured: boolean;
}) {
  const print = MUSINGS_LIGHTHOUSE_PRINT;
  const height = print.width / print.aspect;
  const hoverKey = `grab:photo:${print.id}`;
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      base={[...print.base]}
      shadeColor={palette.shadow}
      shadeWidth={Math.max(0.3, print.width * 1.15)}
      shape="box"
      massKg={0.45}
      artifact={print.id}
    >
      <HeldFacing
        hoverKey={hoverKey}
        position={[0, deskFrameHeight(height) / 2, 0]}
        rest={[0, print.yaw, 0]}
      >
        <DeskFrame
          src={print.src}
          palette={palette}
          textured={textured}
          width={print.width}
          height={height}
        />
      </HeldFacing>
    </Grabbable>
  );
}

/** A thin, die-cut decal left flat on the wood in front of the lighthouse. */
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
  const textured = useUnitLod(index);
  const uprightBooks = useMemo(
    () => packRow(MUSINGS_BOOK_ROW_WIDTH, [], palette, MUSINGS_BOOK_ROW_SALT),
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
              hoverKey="grab:mug"
              base={[MUSINGS_LOWER_LAYOUT.mugX, 0, 0.02]}
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

            <group position={[...MUSINGS_PAPER_STACK.base]}>
              <PaperStack palette={palette} linkUnit={index} />
            </group>

            <React.Suspense fallback={null}>
              <TrustEssay
                unitIndex={index}
                palette={palette}
                dark={dark}
                shadeColor={palette.shadow}
              />
            </React.Suspense>
            <React.Suspense fallback={null}>
              <VineyardSign
                unitIndex={index}
                dark={dark}
                shadeColor={palette.shadow}
              />
            </React.Suspense>
            <VineyardCutout
              unitIndex={index}
              dark={dark}
              shadeColor={palette.shadow}
            />
            {/* The Gay Head print, over from Systems, standing between the
                island it was taken on and the souvenir of the light it shows. */}
            <MusingsPhoto
              unitIndex={index}
              palette={palette}
              textured={textured}
            />
            <Grabbable
              unitIndex={index}
              hoverKey="grab:lighthouse:musings"
              base={[...MUSINGS_LIGHTHOUSE_CARRIER_BASE]}
              shadeColor={palette.shadow}
              shadeWidth={0.34}
              shape="box"
              // Resin tower, wood rim, and sand move as one souvenir.
              massKg={1.4}
              tiltOnHover={false}
              tiltWhileHeld={false}
            >
              <SandTray dark={dark} position={[0, 0, 0]} />
              <group position={[0, MUSINGS_LIGHTHOUSE_POSE.base[1], 0]}>
                <React.Suspense fallback={null}>
                  <ModelProp
                    url="/models/lighthouse.glb"
                    dark={dark}
                    variant="tinted"
                    tints={LIGHTHOUSE_TINTS[dark ? "dark" : "light"]}
                    materialProperties={
                      LIGHTHOUSE_MATERIALS[dark ? "dark" : "light"]
                    }
                    rotation={[...MUSINGS_LIGHTHOUSE_POSE.rotation]}
                    scale={MUSINGS_LIGHTHOUSE_POSE.scale}
                  />
                </React.Suspense>
                <LighthouseBeacon
                  dark={dark}
                  height={LIGHTHOUSE_LANTERN.height}
                  radius={LIGHTHOUSE_LANTERN.radius}
                />
              </group>
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
        {/* The succulent bowl, up from the lower plank on 2026-08-23 to make
            room for the lighthouse print. Front-left, in front of the lamp's
            foot, where its head does not reach. */}
        <Grabbable
          unitIndex={index}
          hoverKey="grab:plant:musings"
          base={[...MUSINGS_TOP_PLANT.base]}
          shadeColor={palette.shadow}
          shadeWidth={0.28}
          shape="box"
          colliderProfile="foliage-base"
          massKg={1.2}
        >
          <ShelfSucculent unitIndex={index} dark={dark} />
        </Grabbable>
        {/* The top lamp is the shared measured angle-poise rig: its shade glow,
          hot mouth, spot and local spill all switch together. */}
        <group position={[...MUSINGS_LAMP_ROOT_BASE]}>
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
          base={[...MUSINGS_HEADPHONES_BASE]}
          shadeColor={palette.shadow}
          shadeWidth={0.46}
          href="https://soundcloud.com/chappyasel"
          portalLabel="Listen to Chappy on SoundCloud"
          external
        >
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/headphones.glb"
              dark={dark}
              variant="tinted"
              tints={HEADPHONE_TINTS[dark ? "dark" : "light"]}
              materialProperties={HEADPHONE_MATERIALS}
              rotation={[0, -1.07, 0]}
              scale={0.36}
            />
          </React.Suspense>
        </Grabbable>

        <Grabbable
          unitIndex={index}
          hoverKey="grab:kettle"
          base={[...MUSINGS_KETTLE_POSE.base]}
          shadeColor={palette.shadow}
          shadeWidth={0.31}
          shape="box"
          massKg={0.7}
        >
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/kettle.glb"
              dark={dark}
              variant="tinted"
              rotation={[...MUSINGS_KETTLE_POSE.rotation]}
              scale={MUSINGS_KETTLE_POSE.scale}
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

        <group position={[...MUSINGS_BOOK_ROW_BASE]}>
          <BookRowMesh
            items={uprightBooks}
            palette={palette}
            salt={MUSINGS_BOOK_ROW_SALT}
            linkUnit={index}
            grabbableVolumes
          />
        </group>
      </ShelfUnit>
    </>
  );
}

useTexture.preload(VINEYARD_VINES_STICKER_URL);
