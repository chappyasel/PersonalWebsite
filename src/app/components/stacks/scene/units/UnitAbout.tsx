"use client";

// About — framed portrait, calling cards, mug, and a globe (he has the
// travel to claim it); desk lamp + book pile below.
import React from "react";

import { proxied } from "../../theme";
import { ContactShade, FootPool } from "../GroundPool";
import ModelProp from "../ModelProp";
import { CardStack, Polaroid, PortraitFrame, PostcardPrint } from "../objects";
import { BookPile, LampGlow, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

export const PORTRAIT_SRC = "/images/about/profile.jpg";

export default function UnitAbout({
  palette,
  dark,
  index,
  coverWidth,
}: UnitProps) {
  const textured = useUnitLod(index);
  return (
    <group>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
        <group>
          <group position={[-0.65, 0, 0]}>
            <React.Suspense fallback={null}>
              <ModelProp url="/models/desk-lamp.glb" dark={dark} rotation={[0, 0.55, 0]} />
            </React.Suspense>
            <LampGlow palette={palette} yaw={0.55} />
          </group>
          <BookPile palette={palette} x={0.55} salt={9} />
          {/* Mug lives lower-right so the globe gets the visible top-shelf
              slot (x > ~1.1 hides behind the desktop placard). */}
          <React.Suspense fallback={null}>
            <ModelProp url="/models/mug.glb" dark={dark} position={[1.0, 0, 0.05]} rotation={[0, -0.4, 0]} />
          </React.Suspense>
        </group>
      }
    >
      <group position={[-0.55, 0, 0]}>
        <PortraitFrame
          src={proxied(PORTRAIT_SRC, coverWidth)}
          palette={palette}
          textured={textured}
        />
      </group>
      <group position={[0.45, 0, 0.05]}>
        <CardStack palette={palette} />
        <ContactShade
          color={palette.shadow}
          width={0.42}
          position={[0, 0.02, 0.02]}
        />
      </group>
      {/* Polaroid pair leaning by the cards — the beach at sunset and the
          four brothers (audit §5 ★ picks). Contact = (h/2)·cos(lean). */}
      <group position={[0.6, 0.1425, 0.1]} rotation={[-0.17, 0.1, -0.04]}>
        <Polaroid
          src="/images/stacks/beach-sunset.jpg"
          palette={palette}
          textured={textured}
        />
      </group>
      <group position={[0.79, 0.1425, 0.17]} rotation={[-0.15, 0.16, 0.06]}>
        <Polaroid
          src="/images/stacks/bros.jpg"
          palette={palette}
          textured={textured}
        />
      </group>
      <React.Suspense fallback={null}>
        <ModelProp url="/models/globe.glb" dark={dark} position={[0.95, 0, -0.1]} rotation={[0, -0.7, 0]} scale={1.5} />
      </React.Suspense>
      {/* Budapest postcard leaning on the globe stand. */}
      <group position={[0.8, 0.0735, 0.04]} rotation={[-0.2, 0.05, 0.05]}>
        <PostcardPrint
          src="/images/stacks/postcard-budapest.jpg"
          palette={palette}
          textured={textured}
        />
      </group>
      </ShelfUnit>
      {/* Reading armchair on the ground at the LEFT flank, angled toward
          the unit — the room reads inhabited before a single word is read.
          x −2.08 keeps its armrest CLEAR of the full-width lower plank
          (ends at −1.6; the v4.0 spot ran the arm through it). */}
      <group position={[-2.08, -1.115, 0.12]} rotation={[0, 0.55, 0]}>
        <React.Suspense fallback={null}>
          <ModelProp url="/models/armchair.glb" dark={dark} scale={1.1} />
        </React.Suspense>
      </group>
      <FootPool
        color={palette.shadow}
        size={[0.62, 0.48]}
        position={[-2.08, -1.115, 0.12]}
      />
    </group>
  );
}
