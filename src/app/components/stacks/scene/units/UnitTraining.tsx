"use client";

// Training — real bumper plates leaning against the shelf back with a
// kettlebell, a loaded barbell lying along the lower shelf behind the
// dumbbell and basketball, and a golf club leaning against the unit's side
// (the only prop tall enough to demand the floor).
import React from "react";

import { ContactShade, FootPool } from "../GroundPool";
import ModelProp from "../ModelProp";
import { BookPile, ShelfUnit } from "../primitives";
import { type UnitProps } from "./types";

export default function UnitTraining({ palette, dark }: UnitProps) {
  return (
    <group>
      <ShelfUnit
        palette={palette}
        lower={
          <group>
            <React.Suspense fallback={null}>
              {/* ×1.15 over v3 and darkened toward iron — it sat shelf-toned
                  and undersized next to the basketball (audit §3-Training). */}
              <ModelProp
                url="/models/dumbbell.glb"
                dark={dark}
                atlasOverride={{ tint: "#8d857c", roughness: 0.55 }}
                rotation={[0, 0.5, 0]}
                scale={1.27}
              />
            </React.Suspense>
            <React.Suspense fallback={null}>
              {/* Worn-leather tint mutes the stock arcade orange; normals
                  weld-smoothed at load (it shipped faceted). */}
              <ModelProp
                url="/models/basketball.glb"
                dark={dark}
                variant="tinted"
                tintAll="#b39072"
                roughness={0.78}
                smoothNormals
                position={[0.52, 0.046, 0.2]}
                rotation={[0, 1.2, 0]}
                scale={0.39}
              />
            </React.Suspense>
            <React.Suspense fallback={null}>
              {/* Zsky barbell (CC-BY, credited) lying along the shelf back. */}
              <ModelProp
                url="/models/barbell.glb"
                dark={dark}
                variant="tinted"
                tints={{
                  Iron1Barbell1: palette.hub,
                  Steel1Barbell1: "#8a8f94",
                }}
                roughness={0.45}
                position={[0, 0, -0.19]}
                rotation={[0, 0.02, 0]}
                scale={0.55}
              />
            </React.Suspense>
          </group>
        }
      >
        {/* Two bumper plates leaning with jitter + kettlebell — replaces
            v3's procedural "chocolate donut" lineup (audit §3-Training). */}
        <group position={[-0.95, 0, -0.05]}>
          {[
            { x: 0, yaw: 0.16, lean: 0.13, tint: "#8a4a30", s: 0.85 },
            { x: 0.34, yaw: -0.1, lean: 0.17, tint: "#3a332c", s: 0.7 },
          ].map((p, i) => (
            <group
              key={i}
              position={[p.x, (0.516 / 2) * p.s * Math.cos(p.lean), 0]}
              rotation={[Math.PI / 2 - p.lean, p.yaw, 0]}
            >
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/plate.glb"
                  dark={dark}
                  variant="tinted"
                  tints={{ PorcelainPlate1: p.tint }}
                  roughness={0.6}
                  position={[0, -0.021 * p.s, 0]}
                  scale={p.s}
                />
              </React.Suspense>
            </group>
          ))}
          <ContactShade
            color={palette.shadow}
            width={0.9}
            height={0.22}
            position={[0.15, 0.04, 0.1]}
          />
        </group>
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/kettlebell.glb"
            dark={dark}
            variant="tinted"
            tints={{ phong1SG: palette.hub }}
            roughness={0.5}
            position={[-0.15, 0, 0.1]}
            rotation={[0, -0.5, 0]}
            scale={1.1}
          />
        </React.Suspense>
        <group position={[0.75, 0, 0]}>
          <BookPile palette={palette} salt={31} />
        </group>
      </ShelfUnit>
      {/* Golf club leaning against the unit's LEFT side (the right hides
          behind the desktop placard). Scale 1.5 → 1.15 tall; base out at
          −1.99 with lean −0.36 lands the grip tip at (−1.58, −0.036) —
          tucked under the plank's end lip instead of clipping through it. */}
      <group position={[-1.99, -1.115, -0.1]} rotation={[0, 0, -0.36]}>
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/golf-club.glb"
            dark={dark}
            variant="tinted"
            tints={{
              M_PCL_Flat_Black: palette.hub,
              M_PCL_Flat_Grey_Light: palette.metal,
              // Flat chrome-grey club face — the cream tint read as a
              // wicker-weave tile under raking light (audit §3-Training).
              M_PCL_Flat_White_Darker: "#9aa0a4",
            }}
            rotation={[0, -1.0, 0]}
            scale={1.5}
          />
        </React.Suspense>
      </group>
      {/* Procedural golf ball at the club head — it only reads as golf in
          the club's company, which is exactly the company it keeps. */}
      <mesh position={[-1.78, -1.07, 0.06]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color={palette.pages} roughness={0.55} />
      </mesh>
      <FootPool color={palette.shadow} size={[0.42, 0.3]} position={[-1.99, -1.115, -0.06]} />
      <FootPool color={palette.shadow} size={[0.14, 0.12]} position={[-1.78, -1.115, 0.06]} />
    </group>
  );
}
