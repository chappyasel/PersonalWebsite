"use client";

// Featured talks — framed stills warmed by the reading lamp.
//
// v5 rebuild. This was the emptiest unit in the world and it was not close:
// five placements against About's fifteen, four of them photographs, and one
// GLB in the whole unit. A gallery wall with a lamp on it. Worse, the frame
// row restates the placard's three cards one-for-one directly beside them, so
// half the unit's visual weight was a duplicate of the panel next to it.
//
// Three structural problems, fixed here:
//
// 1. Frame 3 was half behind the desktop placard. FrameRow sat at local x 0
//    with width 2.6, so the frames landed at −0.87 / 0 / +0.87 and the third
//    spanned 0.49…1.25. The panel is 464px wide below the xl breakpoint and
//    528px above it, and the camera pans ±0.49 world units with the pointer:
//    x ≤ +0.85 is safe on desktop, x ≥ +1.3 is invisible. UnitBooks already
//    hit this and fixed it by hand; Talks never got the same treatment. The
//    row now sits at −0.25.
// 2. The entire front ledge of the upper shelf — z 0…+0.42 across 3.2 of
//    plank — was empty. It is the largest unused surface in the world. The
//    tent card and the fireside frame stand on it, in front of the row,
//    which is also what stops the row reading as thumbnails pasted on wood.
// 3. Nothing on the ground. Every unit that reads as furnished has a floor
//    prop and every unit that reads thin does not. The floor lamp is the
//    change that most moves this unit from "wall" to "room", and it earns
//    its place twice over: a second lamp silhouette was wanted anyway.
import { RoundedBox } from "@react-three/drei";
import React, { useMemo } from "react";
import * as THREE from "three";

import { proxied } from "../../theme";
import { EggLamp } from "../eggs";
import { FootPool } from "../GroundPool";
import LitImage from "../LitImage";
import ModelProp from "../ModelProp";
import { Polaroid } from "../objects";
import { DeskFrame, deskFrameHeight, PhotoMount } from "../photos";
import { FrameRow, GlowSprite, ShelfUnit } from "../primitives";
import { ConferenceBadge, TentCard } from "../speaking";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

/** Floor lamp, measured from lamp-floor.glb by material island rather than
 * eyeballed: the `lamp` shade runs y 0.6815…0.8600 with a 0.0878 mouth at the
 * bottom and a 0.0623 opening at the top; `metal` is the pole and base, y
 * 0…0.7607. Everything the light rig needs is those numbers times the scale,
 * so resizing the lamp cannot tear the rig off the shade — which is exactly
 * the trap the desk lamp is still sitting in, its MOUTH constants being
 * unscaled model space in a sibling of the ModelProp.
 *
 * 1.95 rather than the 1.44 that made it metrically right against the floor
 * conversion: the owner's read was "too small", and he is right, because the
 * bookcase it stands beside is itself at about half the scale of the books it
 * holds. Matching the furniture wins here — the lamp's job is to look like it
 * belongs in this room, not in a correctly-measured different one. */
const LAMP_S = 1.95;
const SHADE_BOTTOM_Y = 0.6815 * LAMP_S;
const SHADE_TOP_Y = 0.86 * LAMP_S;
const SHADE_BOTTOM_R = 0.0878 * LAMP_S;
const SHADE_TOP_R = 0.0623 * LAMP_S;

export default function UnitTalks({
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
      data.talks.map((talk) => ({
        src: proxied(talk.still, coverWidth),
        key: talk.url,
      })),
    [data.talks, coverWidth],
  );
  return (
    <>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
          <group>
            <group position={[0.55, 0, 0]}>
              {/* Egg: the lamp clicks off and back on. */}
              <EggLamp
                unitIndex={index}
                palette={palette}
                dark={dark}
                yaw={-0.5}
              />
            </group>
            {/* GenAI Summit open — him on the mic in the organizer vest
                (curator's top talks pick), an instant print leaning at the
                shelf's far left. */}
            <PhotoMount
              unitIndex={index}
              id="talk-summit"
              position={[-1.12, 0.1555, 0.05]}
              rotation={[-0.15, 0.1, -0.05]}
            >
              <Polaroid
                src="/images/stacks/talk-summit.jpg"
                palette={palette}
                size={0.26}
                textured={textured}
              />
            </PhotoMount>
            {/* Mic in hand, arm up, GenAI Collective banners behind — him
                HOSTING, a different register from the polished stage shoot.
                It links: this one came off a tweet, and the id survived
                verbatim in the archived filename. */}
            <PhotoMount
              unitIndex={index}
              id="talk-mic"
              position={[0.06, 0.1425, 0.14]}
              rotation={[-0.15, -0.14, 0.04]}
              href="https://x.com/i/status/1798370655718744491"
            >
              <Polaroid
                src="/images/stacks/talk-mic.jpg"
                palette={palette}
                textured={textured}
              />
            </PhotoMount>
            {/* Framed Stanford panel shot fills the dead zone left of the
                lamp — the stand mic read "stupid and out of place" (owner, at
                browse); a real stage moment does the same narrative work. */}
            <PhotoMount
              unitIndex={index}
              id="talk-stanford"
              position={[-0.5, 0.224, 0]}
              rotation={[-0.1, 0.12, 0]}
            >
              <RoundedBox
                castShadow
                args={[0.58, 0.44, 0.03]}
                radius={0.008}
                smoothness={4}
                position={[0, 0, -0.018]}
              >
                <meshStandardMaterial color={palette.frame} roughness={0.6} />
              </RoundedBox>
              {textured && (
                <React.Suspense fallback={null}>
                  <LitImage
                    url="/images/stacks/talk-stanford.jpg"
                    width={0.52}
                    height={0.38}
                    roughness={0.5}
                    position={[0, 0, -0.001]}
                  />
                </React.Suspense>
              )}
            </PhotoMount>
            {/* The badge you come home with, lanyard coiled beside it. The
                only object in the unit that is residue rather than record —
                everything else here is a picture OF a talk. Under the lamp's
                pool, in the gap the lamp left on its right. */}
            <group position={[0.38, 0, 0.12]} rotation={[0, -0.35, 0]}>
              <ConferenceBadge
                palette={palette}
                venue="CONSENSUS"
                cordColor={palette.spines[3] ?? palette.ink}
              />
            </group>
          </group>
        }
      >
        <group position={[-0.25, 0, 0]}>
          <FrameRow
            frames={frames}
            width={2.6}
            palette={palette}
            textured={textured}
            onFrameClick={onOpenUrl}
          />
        </group>
        {/* The panel table's name card, standing on the front ledge and
            overlapping the bottom of the first frame. The overlap is the
            point: the row's problem was that it reads as a flat plane of
            thumbnails, and one small object standing in front of it is the
            cheapest way to break that. */}
        <group position={[-1.0, 0, 0.3]} rotation={[0, 0.24, 0]}>
          <TentCard palette={palette} />
        </group>
        {/* The one Talks photograph the repo processed and never placed. It
            earns a seventh image on three counts: it is the only WIDE
            silhouette among three tall frames and three square prints, the
            only one showing a conversation rather than him addressing a
            room, and it stands 0.33 forward of the row, which is the
            front-to-back depth this unit had none of. */}
        <PhotoMount
          unitIndex={index}
          id="talk-fireside-wide"
          position={[0.26, deskFrameHeight(0.236) / 2, 0.27]}
          rotation={[-0.08, -0.18, 0.02]}
        >
          <DeskFrame
            src="/images/stacks/talk-fireside-wide.jpg"
            palette={palette}
            textured={textured}
            width={0.42}
            height={0.236}
          />
        </PhotoMount>
      </ShelfUnit>
      {/* Floor lamp at the left flank, clear of the lower plank (which ends
          at −1.6). Scale 1.44 puts it at world height 1.24 — a real 1.55m
          lamp against the 1.95m grandfather clock in Systems, which is the
          ratio the floor-prop conversion (~0.80 units/metre) asks for.
          Shelf-rate would have out-topped the clock. */}
      <group position={[-1.98, -1.115, 0.06]} rotation={[0, 0.45, 0]}>
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/lamp-floor.glb"
            dark={dark}
            variant="tinted"
            tints={{ metal: palette.metal }}
            scale={LAMP_S}
          />
        </React.Suspense>
        {/* Light has to LEAVE a shade, out of both ends, or the lamp is a
            painted cone on a stick — which is exactly what shipped first and
            what the owner called out. Measured rather than guessed: parsing
            the GLB by material puts the shade's `lamp` island at y 0.6815 to
            0.8600, a truncated cone with a 0.0878 mouth at the bottom and a
            0.0623 opening at the top. Everything below is those two numbers
            times the scale, so the rig cannot drift if the lamp is resized.
            Same recipe as LampGlow, which is the one that survived four
            rebuilds: emissive discs ON the measured openings, pushed past
            Bloom's 0.95 threshold so the composer grows the falloff, and
            REAL lights for the pools. Never fake light with geometry. */}
        <mesh position={[0, SHADE_BOTTOM_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[SHADE_BOTTOM_R * 0.94, 24]} />
          <meshStandardMaterial
            color="#fff1d6"
            emissive="#ffc98a"
            emissiveIntensity={dark ? 3.2 : 1.6}
            roughness={0.4}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, SHADE_TOP_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[SHADE_TOP_R * 0.94, 24]} />
          <meshStandardMaterial
            color="#fff1d6"
            emissive="#ffc98a"
            emissiveIntensity={dark ? 2.4 : 1.2}
            roughness={0.4}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        {/* The camera sits at y 0.25 and the shade's mouth lands at 0.214,
            so a disc on that opening is within four centimetres of exactly
            edge-on and contributes nothing — the same grazing-angle geometry
            that made the old ContactPools invisible and the badge read as a
            smear. What you actually SEE of a floor lamp from eye level is
            the air below the mouth and the air above the top opening, so
            those get camera-facing glows, sized to the shade and no wider:
            a glow wider than the object making it is weather, not light. */}
        <group position={[0, SHADE_BOTTOM_Y - 0.13, 0]}>
          <GlowSprite opacity={palette.glowOpacity * 0.9} eased scale={0.62} />
        </group>
        <group position={[0, SHADE_TOP_Y + 0.1, 0]}>
          <GlowSprite opacity={palette.glowOpacity * 0.55} eased scale={0.4} />
        </group>
        {/* And a real spot down the mouth, so anything that does pass under
            it is genuinely lit rather than merely near a glow. */}
        <spotLight
          position={[0, SHADE_BOTTOM_Y - 0.01, 0]}
          color="#ffbe73"
          intensity={dark ? 6.5 : 2.6}
          angle={0.85}
          penumbra={0.9}
          distance={2.6}
          decay={2}
        />
        {/* Up out of the top opening — a drum shade throws as much light at
            the ceiling as at the floor, and without it the top of the lamp
            is a dark rim above a lit cone. */}
        <pointLight
          position={[0, SHADE_TOP_Y + 0.05, 0]}
          color="#ffcf96"
          intensity={dark ? 0.9 : 0.4}
          distance={1.4}
          decay={2}
        />
        {/* The shade's own interior, so the cone glows rather than the lamp
            reading as a torch on a stick. */}
        <pointLight
          position={[0, (SHADE_BOTTOM_Y + SHADE_TOP_Y) / 2, 0]}
          color="#ffcf96"
          intensity={0.3}
          distance={0.5}
          decay={2}
        />
        {/* Both pools, in this order: the warm one is the light landing on
            the ground, the dark one is the lamp's own foot occluding it. A
            lit lamp with only a shadow under it reads as switched off. */}
        <FootPool color="#ffbe73" size={[0.8, 0.52]} opacity={dark ? 0.26 : 0.12} />
        <FootPool
          color={palette.shadow}
          size={[0.34, 0.24]}
          opacity={0.3}
          position={[0, 0.002, 0]}
        />
      </group>
    </>
  );
}
