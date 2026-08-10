"use client";

// Featured talks — framed stills warmed by the reading lamp.
import React, { useMemo } from "react";

import { proxied } from "../../theme";
import ModelProp from "../ModelProp";
import { FrameRow, LampGlow, ShelfUnit } from "../primitives";
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
      lower={
        <group>
          <group position={[0.55, 0, 0]}>
            <React.Suspense fallback={null}>
              <ModelProp url="/models/desk-lamp.glb" dark={dark} rotation={[0, -0.5, 0]} />
            </React.Suspense>
            <LampGlow palette={palette} />
          </group>
          {/* Retro desk mic fills the 550px dead zone left of the lamp
              (audit §3-Talks) — the podcast half of the talks story. */}
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/mic.glb"
              dark={dark}
              variant="tinted"
              tints={{
                Black: palette.hub,
                Metal: palette.metal,
                LightGrey: "#8d857c",
              }}
              roughness={0.45}
              position={[-0.5, 0, 0.05]}
              rotation={[0, 0.4, 0]}
              scale={0.38}
            />
          </React.Suspense>
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
