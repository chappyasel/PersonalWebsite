"use client";

// Featured talks — framed stills warmed by the reading lamp.
import { RoundedBox } from "@react-three/drei";
import React, { useMemo } from "react";

import { proxied } from "../../theme";
import { EggLamp } from "../eggs";
import LitImage from "../LitImage";
import { Polaroid } from "../objects";
import { FrameRow, ShelfUnit } from "../primitives";
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
    <ShelfUnit
      palette={palette}
      toneSeed={index}
      lower={
        <group>
          <group position={[0.55, 0, 0]}>
            {/* Egg: the lamp clicks off and back on. */}
            <EggLamp unitIndex={index} palette={palette} dark={dark} yaw={-0.5} />
          </group>
          {/* GenAI Summit open — him on the mic in the organizer vest
              (curator's top talks pick), an instant print leaning at the
              shelf's far left. */}
          <group position={[-1.12, 0.1555, 0.05]} rotation={[-0.15, 0.1, -0.05]}>
            <Polaroid
              src="/images/stacks/talk-summit.jpg"
              palette={palette}
              size={0.26}
              textured={textured}
            />
          </group>
          {/* Mic in hand, arm up, GenAI Collective banners behind — him
              HOSTING, a different register from the polished stage shoot. */}
          <group position={[0.06, 0.1425, 0.14]} rotation={[-0.15, -0.14, 0.04]}>
            <Polaroid
              src="/images/stacks/talk-mic.jpg"
              palette={palette}
              textured={textured}
            />
          </group>
          {/* Framed Stanford panel shot fills the dead zone left of the
              lamp — the stand mic read "stupid and out of place" (owner, at
              browse); a real stage moment does the same narrative work. */}
          <group position={[-0.5, 0.224, 0]} rotation={[-0.1, 0.12, 0]}>
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
          </group>
        </group>
      }
    >
      <FrameRow
        frames={frames}
        width={2.6}
        palette={palette}
        textured={textured}
        onFrameClick={onOpenUrl}
      />
    </ShelfUnit>
  );
}
