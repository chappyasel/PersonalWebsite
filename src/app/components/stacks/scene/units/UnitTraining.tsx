"use client";

// Training — plates leaning against the shelf back, a real dumbbell and a
// basketball below, and a golf club leaning against the unit's side (the
// only prop allowed to touch the floor — its scale demands it).
import React from "react";

import { ContactPool } from "../GroundPool";
import ModelProp from "../ModelProp";
import { BookPile, Plates, ShelfUnit } from "../primitives";
import { type UnitProps } from "./types";

export default function UnitTraining({ palette, dark }: UnitProps) {
  return (
    <group>
      <ShelfUnit
        palette={palette}
        lower={
          <group>
            <React.Suspense fallback={null}>
              <ModelProp url="/models/dumbbell.glb" dark={dark} rotation={[0, 0.5, 0]} scale={1.1} />
            </React.Suspense>
            <React.Suspense fallback={null}>
              {/* Worn-leather tint mutes the stock arcade orange. */}
              <ModelProp
                url="/models/basketball.glb"
                dark={dark}
                variant="tinted"
                tintAll="#b39072"
                roughness={0.78}
                position={[0.72, 0.046, 0]}
                rotation={[0, 1.2, 0]}
                scale={0.39}
              />
            </React.Suspense>
            <ContactPool color={palette.shadow} size={[0.85, 0.4]} position={[0, 0, 0]} />
            <ContactPool color={palette.shadow} size={[0.6, 0.5]} position={[0.72, 0, 0]} />
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
      {/* Golf club leaning against the unit's LEFT side (the right hides
          behind the desktop placard) — 1.23 units tall, it cannot stand on
          a shelf; the lean composes with the leaning plates. */}
      <group position={[-1.93, -1.115, -0.1]} rotation={[0, 0, -0.28]}>
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/golf-club.glb"
            dark={dark}
            variant="tinted"
            tints={{
              M_PCL_Flat_Black: palette.hub,
              M_PCL_Flat_Grey_Light: palette.metal,
              M_PCL_Flat_White_Darker: palette.pages,
            }}
            rotation={[0, -1.0, 0]}
            scale={1.6}
          />
        </React.Suspense>
      </group>
      {/* Procedural golf ball at the club head — it only reads as golf in
          the club's company, which is exactly the company it keeps. */}
      <mesh position={[-1.76, -1.07, 0.06]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color={palette.pages} roughness={0.55} />
      </mesh>
      <ContactPool color={palette.shadow} size={[0.4, 0.32]} position={[-1.93, -1.115, -0.08]} />
      <ContactPool color={palette.shadow} size={[0.14, 0.12]} position={[-1.76, -1.115, 0.06]} />
    </group>
  );
}
