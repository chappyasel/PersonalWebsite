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

import { proxied } from "../../theme";
import { EggLamp } from "../eggs";
import { FootPool } from "../GroundPool";
import LitImage from "../LitImage";
import ModelProp from "../ModelProp";
import { Polaroid } from "../objects";
import { DeskFrame, deskFrameHeight, PhotoMount } from "../photos";
import { FrameRow, ShelfUnit } from "../primitives";
import { ConferenceBadge, TentCard } from "../speaking";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

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
            <group position={[0.31, 0, 0.1]} rotation={[0, -0.35, 0]}>
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
          <TentCard palette={palette} width={0.19} height={0.105} />
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
            scale={1.44}
          />
        </React.Suspense>
        {/* A bare shade in a dark room reads as switched off. One weak point
            under the shade, short-range so it lights its own corner and
            nothing else — the desk lamp on the shelf above keeps ownership
            of the unit's key light. */}
        <pointLight
          position={[0, 1.16, 0]}
          intensity={dark ? 0.5 : 0.22}
          distance={1.5}
          decay={2}
          color="#ffcf9a"
        />
        <FootPool color={palette.shadow} size={[0.34, 0.24]} opacity={0.26} />
      </group>
    </>
  );
}
