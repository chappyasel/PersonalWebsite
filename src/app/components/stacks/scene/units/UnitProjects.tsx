"use client";

// Projects — framed app screenshots, a pile of reference books below.
import { useMemo } from "react";

import { proxied } from "../../theme";
import { BookPile, FrameRow, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

export default function UnitProjects({
  data,
  palette,
  index,
  coverWidth,
  onOpenUrl,
}: UnitProps) {
  const textured = useUnitLod(index);
  const frames = useMemo(
    () =>
      data.projects.map((project) => ({
        src: proxied(project.image, coverWidth),
        key: project.link,
      })),
    [data.projects, coverWidth],
  );
  return (
    <ShelfUnit
      palette={palette}
      lower={<BookPile palette={palette} x={0.3} />}
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
