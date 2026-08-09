"use client";

// Training — plates leaning against the shelf back, a dumbbell below.
import { BookPile, Dumbbell, Plates, ShelfUnit } from "../primitives";
import { type UnitProps } from "./types";

export default function UnitTraining({ palette }: UnitProps) {
  return (
    <ShelfUnit palette={palette} lower={<Dumbbell palette={palette} />}>
      <group position={[-0.9, 0.035, 0]}>
        <Plates palette={palette} />
      </group>
      <group position={[0.75, 0.035, 0]}>
        <BookPile palette={palette} />
      </group>
    </ShelfUnit>
  );
}
