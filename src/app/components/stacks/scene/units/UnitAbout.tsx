"use client";

// About — framed portrait, calling cards, mug, and a globe (he has the
// travel to claim it); desk lamp + book pile below.
import React from "react";

import { proxied } from "../../theme";
import { EggLamp, SpinProp } from "../eggs";
import { ContactShade, FootPool } from "../GroundPool";
import ModelProp from "../ModelProp";
import {
  CardStack,
  DeskApple,
  Polaroid,
  PortraitFrame,
  PostcardPrint,
} from "../objects";
import { DeskFrame, deskFrameHeight, PhotoMount } from "../photos";
import { BookPile, ShelfUnit } from "../primitives";
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
            {/* Egg: the lamp clicks off and back on. */}
            <EggLamp unitIndex={index} palette={palette} dark={dark} yaw={0.55} />
          </group>
          <BookPile palette={palette} x={0.5} salt={9} linkUnit={index} />
          {/* Apple desk object in the gap between the lamp and the family
              frame. It belongs on THIS unit and not on Projects: the bio in
              the placard beside it is the only text in the world that says
              Apple, Vision Pro, Apple Intelligence, so here the prop is a
              footnote to a sentence a reader can actually see, and on the
              Projects shelf (personal apps, none of them Apple's) it would
              be an unexplained logo. Square to the plank rather than to the
              camera (so no rotation of its own): the mark's face is the one
              near-mirror in the scene, and off-square it swings away from
              the environment probe's lit half and goes black. */}
          <group position={[-0.42, 0, 0.15]}>
            <DeskApple palette={palette} />
          </group>
          {/* Mug lives lower-right so the globe gets the visible top-shelf
              slot (x > ~1.1 hides behind the desktop placard). */}
          <React.Suspense fallback={null}>
            <ModelProp url="/models/mug.glb" dark={dark} position={[0.86, 0, 0.05]} rotation={[0, -0.4, 0]} />
          </React.Suspense>
          {/* The four brothers, and the whole family at Christmas — the left
              flank of this shelf was empty in every screenshot he sent. */}
          <PhotoMount
            unitIndex={index}
            id="about-brothers"
            position={[-1.06, 0.1425, 0.06]}
            rotation={[-0.16, 0.22, 0.03]}
          >
            <Polaroid
              src="/images/stacks/about-brothers.jpg"
              palette={palette}
              textured={textured}
            />
          </PhotoMount>
          <PhotoMount
            unitIndex={index}
            id="about-holidays"
            position={[-0.14, deskFrameHeight(0.2) / 2, 0.04]}
            rotation={[-0.12, -0.18, 0]}
          >
            <DeskFrame
              src="/images/stacks/about-holidays.jpg"
              palette={palette}
              textured={textured}
              width={0.27}
              height={0.2}
            />
          </PhotoMount>
        </group>
      }
    >
      {/* No rest tilt to hand over — the portrait carries its own lean
          inside the component, so it lifts and grows without straightening. */}
      <PhotoMount unitIndex={index} id="portrait" position={[-0.55, 0, 0]}>
        <PortraitFrame
          src={proxied(PORTRAIT_SRC, coverWidth)}
          palette={palette}
          textured={textured}
        />
      </PhotoMount>
      {/* The portrait frame is 1.02 wide, so it stops at −1.06 and the top
          shelf runs on bare to the plank end. A houseplant is what stands
          in that gap on a real shelf — and it is the only thing on this
          unit that is neither a picture nor a keepsake. */}
      <group position={[-1.33, 0, 0.02]}>
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/potted-plant.glb"
            dark={dark}
            rotation={[0, 0.5, 0]}
            scale={1.25}
          />
        </React.Suspense>
        <ContactShade
          color={palette.shadow}
          width={0.34}
          position={[0, 0.02, 0.02]}
        />
      </group>
      <group position={[0.30, 0, 0.05]}>
        <CardStack palette={palette} />
        <ContactShade
          color={palette.shadow}
          width={0.42}
          position={[0, 0.02, 0.02]}
        />
      </group>
      {/* Polaroid pair leaning by the cards — the beach at sunset and the
          four brothers (audit §5 ★ picks). Contact = (h/2)·cos(lean). */}
      <PhotoMount
        unitIndex={index}
        id="beach-sunset"
        position={[0.46, 0.1425, 0.1]}
        rotation={[-0.17, 0.1, -0.04]}
      >
        <Polaroid
          src="/images/stacks/beach-sunset.jpg"
          palette={palette}
          textured={textured}
        />
      </PhotoMount>
      <PhotoMount
        unitIndex={index}
        id="bros"
        position={[0.63, 0.1425, 0.17]}
        rotation={[-0.15, 0.16, 0.06]}
      >
        <Polaroid
          src="/images/stacks/bros.jpg"
          palette={palette}
          textured={textured}
        />
      </PhotoMount>
      {/* Egg: one slow damped revolution per click. The spin wrapper sits AT
          the globe's slot so the turn is about its own stand, not the unit. */}
      <group position={[0.82, 0, -0.1]}>
        <SpinProp unitIndex={index} hoverKey="egg:globe">
          <React.Suspense fallback={null}>
            <ModelProp url="/models/globe.glb" dark={dark} rotation={[0, -0.7, 0]} scale={1.5} />
          </React.Suspense>
        </SpinProp>
      </group>
      {/* Postcard pair leaning on the globe stand — Budapest Parliament +
          Delicate Arch (the Instagram curation round's top travel frame). */}
      <PhotoMount
        unitIndex={index}
        id="postcard-budapest"
        position={[0.67, 0.0735, 0.04]}
        rotation={[-0.2, 0.05, 0.05]}
      >
        <PostcardPrint
          src="/images/stacks/postcard-budapest.jpg"
          palette={palette}
          textured={textured}
        />
      </PhotoMount>
      <PhotoMount
        unitIndex={index}
        id="postcard-arches"
        position={[0.8, 0.0735, 0.13]}
        rotation={[-0.18, 0.3, -0.05]}
      >
        <PostcardPrint
          src="/images/stacks/postcard-arches.jpg"
          palette={palette}
          textured={textured}
        />
      </PhotoMount>
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
