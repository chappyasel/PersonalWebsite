"use client";

// About — framed portrait, calling cards, and a mug; lamp + book pile below.
import { proxied } from "../../theme";
import { ContactPool } from "../GroundPool";
import { CardStack, Mug, PortraitFrame } from "../objects";
import { BookPile, Lamp, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

const PORTRAIT_SRC = "/images/about/profile.jpg";

export default function UnitAbout({
  palette,
  index,
  coverWidth,
}: UnitProps) {
  const textured = useUnitLod(index);
  return (
    <ShelfUnit
      palette={palette}
      lower={
        <group>
          <group position={[-0.65, 0, 0]}>
            <Lamp palette={palette} />
          </group>
          <BookPile palette={palette} x={0.55} />
          <ContactPool color={palette.shadow} size={[0.5, 0.5]} position={[-0.65, 0, 0]} />
          <ContactPool color={palette.shadow} size={[0.78, 0.52]} position={[0.57, 0, 0.01]} />
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
      <group position={[0.5, 0, 0.05]}>
        <CardStack palette={palette} />
      </group>
      <group position={[1.05, 0, -0.1]}>
        <Mug palette={palette} />
      </group>
      <ContactPool color={palette.shadow} size={[1.3, 0.42]} position={[-0.55, 0, -0.08]} />
      <ContactPool color={palette.shadow} size={[0.5, 0.32]} position={[0.5, 0, 0.05]} />
      <ContactPool color={palette.shadow} size={[0.26, 0.26]} position={[1.05, 0, -0.1]} />
    </ShelfUnit>
  );
}
