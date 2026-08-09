"use client";

// Systems — the operating manual binder, the real 3:45 alarm clock (canvas
// face over the GLB dial), and quote cards; book pile + potted plant below.
import React from "react";

import { ContactPool } from "../GroundPool";
import ModelProp from "../ModelProp";
import { Binder, ClockFace, QuoteCards } from "../objects";
import { BookPile, ShelfUnit } from "../primitives";
import { type UnitProps } from "./types";

export default function UnitSystems({ palette, dark }: UnitProps) {
  return (
    <ShelfUnit
      palette={palette}
      lower={
        <group>
          <BookPile palette={palette} x={0.3} />
          <React.Suspense fallback={null}>
            <ModelProp url="/models/potted-plant.glb" dark={dark} position={[-0.55, 0, 0]} rotation={[0, 0.4, 0]} scale={1.25} />
          </React.Suspense>
          <ContactPool color={palette.shadow} size={[0.78, 0.52]} position={[0.32, 0, 0.01]} />
          <ContactPool color={palette.shadow} size={[0.62, 0.52]} position={[-0.55, 0, 0]} />
        </group>
      }
    >
      <group position={[-1.0, 0, 0]}>
        <Binder palette={palette} />
      </group>
      <group position={[-0.15, 0, 0.08]}>
        <React.Suspense fallback={null}>
          <ModelProp url="/models/alarm-clock.glb" dark={dark} scale={1.6} />
        </React.Suspense>
        {/* 3:45 face floats just in front of the GLB's painted dial. */}
        <group position={[0, 0.17, 0.053]}>
          <ClockFace radius={0.082} />
        </group>
      </group>
      <group position={[0.85, 0, 0]}>
        <QuoteCards palette={palette} />
      </group>
      <ContactPool color={palette.shadow} size={[0.6, 0.52]} position={[-1.0, 0, -0.02]} />
      <ContactPool color={palette.shadow} size={[0.42, 0.28]} position={[-0.15, 0, 0.08]} />
      <ContactPool color={palette.shadow} size={[0.85, 0.42]} position={[0.85, 0, 0.03]} />
    </ShelfUnit>
  );
}
