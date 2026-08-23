"use client";

// Chappy's essay "Trust in the Age of Acceleration" (The AI Collective,
// 2025-04-03), printed, thread-sewn and standing on a small wooden reading
// stand where three anonymous flat books used to lie. The essay's own spine
// is "trust is the invisible thread that holds the world together", so the
// binding thread is the one detail here that is not plain stationery: a
// stab-sewn booklet in a warm cord, the thread made visible. The cover is
// page one of the real PDF (the beam artwork and the title block), rasterised
// at 2x Letter resolution so its type survives a close carry. The booklet is
// the same full Letter size as those loose pages. No redraw, no invented mark.
// The booklet is a Door to the essay.
import { type Palette } from "../../theme";
import Grabbable from "../Grabbable";
import HeldFacing from "../HeldFacing";
import { MUSINGS_TRUST_ESSAY } from "../musingsShelfGeometry";
import { WoodMaterial } from "../primitives";
import { RoundedBox, useTexture } from "@react-three/drei";
import { useEffect } from "react";
import * as THREE from "three";

import { MUSINGS_OAK } from "./VineyardCutout";

const TRUST_COVER_URL = "/images/stacks/musings/trust-2025-cover.webp?v=2";
const TRUST_ESSAY_HOVER_KEY = "grab:trust-essay:musings";
export const TRUST_ESSAY_HREF = "https://www.aicollective.com/trust";

/** Stitch positions as fractions of page height. Five holes, evenly spaced
 * up the margin, like a four-hole stab binding with one to spare. */
const STITCH_HEIGHT_RATIOS = [0.155, 0.335, 0.515, 0.696, 0.876] as const;
/** Thread radius. Real waxed linen is a millimetre; this is three, because
 * the booklet is ~100 px wide on a desktop and a 0.5 px thread is no thread
 * at all — the same legibility trade the 2.2 mm paper sheets make. */
const THREAD_RADIUS = 0.0028;
const THREAD_HEX = { light: "#c9562c", dark: "#b8522c" } as const;
const STITCH_INSET = 0.018;

export function TrustEssay({
  unitIndex,
  palette,
  dark,
  shadeColor,
}: {
  unitIndex: number;
  palette: Palette;
  dark: boolean;
  shadeColor: string;
}) {
  const { width, height, thickness, lean, stand, footZ } = MUSINGS_TRUST_ESSAY;
  const stitches = STITCH_HEIGHT_RATIOS.map((ratio) => ratio * height);
  const cover = useTexture(TRUST_COVER_URL);
  useEffect(() => {
    cover.colorSpace = THREE.SRGBColorSpace;
    cover.anisotropy = 8;
    cover.needsUpdate = true;
  }, [cover]);
  const theme = dark ? "dark" : "light";
  const thread = (
    <meshStandardMaterial color={THREAD_HEX[theme]} roughness={0.72} />
  );
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={TRUST_ESSAY_HOVER_KEY}
      base={[...MUSINGS_TRUST_ESSAY.base]}
      shadeColor={shadeColor}
      shadeWidth={0.48}
      shape="box"
      massKg={0.2}
      href={TRUST_ESSAY_HREF}
      doorLabel="Read Trust in the Age of Acceleration"
      external
    >
      {/* Carried, the cover turns square to the camera like the sticker and
          the island cutout: a page seen edge-on is a line. */}
      <HeldFacing hoverKey={TRUST_ESSAY_HOVER_KEY}>
        {/* Reading stand: a base plate, a front lip the booklet's foot sits
            behind, and two slats leaning with the booklet at its back. */}
        <RoundedBox
          args={[stand.width, stand.height, stand.depth]}
          radius={0.003}
          smoothness={3}
          position={[0, stand.height / 2, 0]}
        >
          <WoodMaterial hex={MUSINGS_OAK[theme].foot} repeat={[1.1, 0.6]} />
        </RoundedBox>
        <RoundedBox
          args={[stand.width, stand.lipHeight, stand.lipDepth]}
          radius={0.002}
          smoothness={2}
          position={[
            0,
            stand.height + stand.lipHeight / 2,
            footZ + stand.lipDepth / 2 + 0.001,
          ]}
        >
          <WoodMaterial hex={MUSINGS_OAK[theme].foot} repeat={[1.1, 0.3]} />
        </RoundedBox>
        <group position={[0, stand.height, footZ]} rotation={[-lean, 0, 0]}>
          {[-1, 1].map((side) => (
            <RoundedBox
              key={side}
              args={[0.014, height * 0.9, 0.008]}
              radius={0.002}
              smoothness={2}
              position={[
                side * stand.width * 0.35,
                height * 0.45,
                -thickness - 0.005,
              ]}
            >
              <WoodMaterial
                hex={MUSINGS_OAK[theme].foot}
                vertical
                repeat={[0.3, 1.2]}
              />
            </RoundedBox>
          ))}
          {/* The booklet: a block of pages, its front face at local z = 0. */}
          <RoundedBox
            args={[width, height, thickness]}
            radius={0.0015}
            smoothness={2}
            position={[0, height / 2, -thickness / 2]}
          >
            <meshStandardMaterial color={palette.paper} roughness={0.95} />
          </RoundedBox>
          <mesh position={[0, height / 2, 0.0006]} renderOrder={2}>
            <planeGeometry args={[width - 0.004, height - 0.004]} />
            <meshStandardMaterial
              map={cover}
              roughness={0.9}
              polygonOffset
              polygonOffsetFactor={-4}
              polygonOffsetUnits={-4}
            />
          </mesh>
          {/* Stab binding down the left margin: five stitches through the
              block, the runs between them on the cover, and the wrap over
              the spine edge. */}
          <group position={[-width / 2 + STITCH_INSET, 0, 0]}>
            {stitches.map((h) => (
              <mesh
                key={h}
                position={[0, h, -thickness / 2]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry
                  args={[THREAD_RADIUS, THREAD_RADIUS, thickness + 0.005, 8]}
                />
                {thread}
              </mesh>
            ))}
            {stitches.slice(1).map((h, i) => (
              <mesh
                key={h}
                position={[0, (h + stitches[i]!) / 2, THREAD_RADIUS * 0.6]}
              >
                <cylinderGeometry
                  args={[
                    THREAD_RADIUS * 0.85,
                    THREAD_RADIUS * 0.85,
                    h - stitches[i]!,
                    6,
                  ]}
                />
                {thread}
              </mesh>
            ))}
            <mesh
              position={[
                -STITCH_INSET - THREAD_RADIUS * 0.5,
                (stitches[0]! + stitches[stitches.length - 1]!) / 2,
                -thickness / 2,
              ]}
            >
              <cylinderGeometry
                args={[
                  THREAD_RADIUS * 0.85,
                  THREAD_RADIUS * 0.85,
                  stitches[stitches.length - 1]! - stitches[0]!,
                  6,
                ]}
              />
              {thread}
            </mesh>
          </group>
        </group>
      </HeldFacing>
    </Grabbable>
  );
}

useTexture.preload(TRUST_COVER_URL);
