"use client";

// Systems — the operating manual binder, the real 3:45 alarm clock (canvas
// face over the GLB dial), and quote cards; book pile + potted plant below.
import React from "react";

import { ContactShade } from "../GroundPool";
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
          <BookPile palette={palette} x={0.3} salt={58} />
          <React.Suspense fallback={null}>
            <ModelProp url="/models/potted-plant.glb" dark={dark} position={[-0.55, 0, 0]} rotation={[0, 0.4, 0]} scale={1.25} />
          </React.Suspense>
        </group>
      }
    >
      <group position={[-1.0, 0, 0]}>
        <Binder palette={palette} />
        <ContactShade
          color={palette.shadow}
          width={0.5}
          position={[0, 0.03, 0.1]}
        />
      </group>
      <group position={[-0.15, 0, 0.08]}>
        <React.Suspense fallback={null}>
          <ModelProp url="/models/alarm-clock.glb" dark={dark} scale={1.6} />
        </React.Suspense>
        {/* 3:45 face registered to the GLB's measured dial: the front disc
            sits at local z 0.024, center y 0.0828, r 0.0614 — ×1.6 scale
            puts the canvas at y 0.1325, z 0.040 (1.6mm proud of the paint,
            behind the bezel rim), r ≈ 0.95× the dial so the painted ticks
            never peek out around it. */}
        <group position={[0, 0.1325, 0.0404]}>
          <ClockFace radius={0.0933} />
        </group>
      </group>
      <group position={[0.85, 0, 0]}>
        <QuoteCards palette={palette} />
      </group>
    </ShelfUnit>
  );
}
