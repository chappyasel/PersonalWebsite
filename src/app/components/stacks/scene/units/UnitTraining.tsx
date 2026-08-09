"use client";

// Training — plates leaning against the shelf back, a dumbbell below.
import { ContactPool } from "../GroundPool";
import { BookPile, Dumbbell, Plates, ShelfUnit } from "../primitives";
import { type UnitProps } from "./types";

export default function UnitTraining({ palette }: UnitProps) {
  return (
    <ShelfUnit
      palette={palette}
      lower={
        <group>
          <Dumbbell palette={palette} />
          <ContactPool color={palette.shadow} size={[0.85, 0.4]} position={[0, 0, 0]} />
        </group>
      }
    >
      <group position={[-0.9, 0, 0]}>
        <Plates palette={palette} />
      </group>
      <group position={[0.75, 0, 0]}>
        <BookPile palette={palette} />
      </group>
      <ContactPool color={palette.shadow} size={[1.35, 0.5]} position={[-0.58, 0, -0.1]} />
      <ContactPool color={palette.shadow} size={[0.78, 0.52]} position={[0.77, 0, 0.01]} />
    </ShelfUnit>
  );
}
