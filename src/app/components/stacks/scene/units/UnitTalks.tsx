"use client";

// Featured talks — framed stills warmed by the reading lamp.
import { useMemo } from "react";

import { proxied } from "../../theme";
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
        <group position={[0.55, 0, 0]}>
          <Lamp palette={palette} />
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
    </ShelfUnit>
  );
}
