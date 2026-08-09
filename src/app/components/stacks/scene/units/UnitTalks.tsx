"use client";

// Featured talks — framed stills warmed by the reading lamp.
import { useMemo } from "react";

import { proxied } from "../../theme";
import { ContactPool } from "../GroundPool";
import { FrameRow, Lamp, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

export default function UnitTalks({
  data,
  palette,
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
            <Lamp palette={palette} />
          </group>
          <ContactPool color={palette.shadow} size={[0.5, 0.5]} position={[0.55, 0, 0]} />
        </group>
      }
    >
      <FrameRow
        frames={frames}
        width={3.0}
        palette={palette}
        textured={textured}
        onFrameClick={onOpenUrl}
      />
      <ContactPool color={palette.shadow} size={[3.0, 0.5]} position={[0, 0, -0.05]} />
    </ShelfUnit>
  );
}
