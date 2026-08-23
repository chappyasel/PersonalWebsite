"use client";

// The Martha's Vineyard town-mileage sign (Oak Bluffs 3, Edgartown 8 one
// way; West Tisbury 8, Chilmark 11, Aquinnah 18 the other, grapes medallion
// on top), as a souvenir signpost between the Trust booklet and the island
// cutout. The face is the owner-supplied print, die-cut off its mat by
// scripts/stacks-vineyard-sign.mjs and shipped with alpha; the post and its
// round foot are authored. Same die-cut technique as the Vineyard Vines
// sticker (alpha-tested plane over an invisible backing box the physics can
// hold), plus a second plane facing backwards with the image mirrored in UV,
// so the text reads the right way round from behind when it is carried.
import Grabbable from "../Grabbable";
import HeldFacing from "../HeldFacing";
import { MUSINGS_LOWER_LAYOUT } from "../musingsShelfGeometry";
import { WoodMaterial } from "../primitives";
import { useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { MUSINGS_OAK } from "./VineyardCutout";

const SIGN_URL = "/images/stacks/musings/vineyard-sign.webp";
const SIGN_HOVER_KEY = "grab:vineyard-sign";
/** Height over width of the die-cut image (the extractor prints it). */
const SIGN_ASPECT = 0.8785;

/** Shared with the Musings layout. */
export const MUSINGS_VINEYARD_SIGN_POSE = {
  base: [MUSINGS_LOWER_LAYOUT.signX, 0, 0.0],
  /** Sign face width. A desk-size souvenir: 11 cm at 2 u/m. */
  width: 0.22,
  /** Top of the post above the shelf; the sign's lower edge overlaps it. */
  postHeight: 0.12,
  yaw: -0.06,
} as const;

const POST = {
  side: 0.014,
  hex: { light: "#e9e4d8", dark: "#a9a293" },
} as const;
const FOOT = { radius: 0.036, height: 0.01 } as const;
const BOARD_THICKNESS = 0.006;

export function VineyardSign({
  unitIndex,
  dark,
  shadeColor,
}: {
  unitIndex: number;
  dark: boolean;
  shadeColor: string;
}) {
  const { width, postHeight, yaw } = MUSINGS_VINEYARD_SIGN_POSE;
  const height = width * SIGN_ASPECT;
  const face = useTexture(SIGN_URL);
  useEffect(() => {
    face.colorSpace = THREE.SRGBColorSpace;
    face.anisotropy = 8;
    face.needsUpdate = true;
  }, [face]);
  // The back reads the same print mirrored in UV, not as a mirror image.
  const back = useMemo(() => {
    const texture = face.clone();
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.x = -1;
    texture.needsUpdate = true;
    return texture;
  }, [face]);
  useEffect(() => () => back.dispose(), [back]);
  const theme = dark ? "dark" : "light";
  const signCenterY = postHeight - 0.012 + height / 2;
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={SIGN_HOVER_KEY}
      base={[...MUSINGS_VINEYARD_SIGN_POSE.base]}
      shadeColor={shadeColor}
      shadeWidth={0.26}
      shape="box"
      massKg={0.12}
    >
      <HeldFacing hoverKey={SIGN_HOVER_KEY}>
        <group rotation={[0, yaw, 0]}>
          <mesh position={[0, FOOT.height / 2, 0]}>
            <cylinderGeometry
              args={[FOOT.radius, FOOT.radius * 1.06, FOOT.height, 24]}
            />
            <WoodMaterial hex={MUSINGS_OAK[theme].foot} repeat={[1, 1]} />
          </mesh>
          <mesh position={[0, FOOT.height + postHeight / 2 - 0.002, 0]}>
            <boxGeometry args={[POST.side, postHeight, POST.side]} />
            <meshStandardMaterial color={POST.hex[theme]} roughness={0.82} />
          </mesh>
          <group
            position={[0, signCenterY, POST.side / 2 + BOARD_THICKNESS / 2]}
          >
            {/* Invisible backing: a real hull for the solver and the hover
                raycast, exactly the die-cut's box. */}
            <mesh>
              <boxGeometry args={[width, height, BOARD_THICKNESS]} />
              <meshBasicMaterial
                transparent
                opacity={0}
                depthWrite={false}
                colorWrite={false}
              />
            </mesh>
            <mesh position={[0, 0, BOARD_THICKNESS / 2 + 0.0004]}>
              <planeGeometry args={[width, height]} />
              <meshStandardMaterial
                map={face}
                alphaTest={0.4}
                roughness={0.86}
                polygonOffset
                polygonOffsetFactor={-2}
              />
            </mesh>
            <mesh
              position={[0, 0, -BOARD_THICKNESS / 2 - 0.0004]}
              rotation={[0, Math.PI, 0]}
            >
              <planeGeometry args={[width, height]} />
              <meshStandardMaterial
                map={back}
                alphaTest={0.4}
                roughness={0.86}
                polygonOffset
                polygonOffsetFactor={-2}
              />
            </mesh>
          </group>
        </group>
      </HeldFacing>
    </Grabbable>
  );
}

useTexture.preload(SIGN_URL);
