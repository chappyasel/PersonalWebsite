"use client";

// Systems — CT Books as the operating manual, the real 3:45 alarm clock
// (canvas face over the GLB dial), and a paper inbox tray; book pile +
// sansevieria below; the grandfather clock stands on the floor at the
// unit's left flank, also reading 3:45.
import React from "react";

import { ContactShade, FootPool } from "../GroundPool";
import ModelProp from "../ModelProp";
import { ClockFace, InboxTray } from "../objects";
import { BookPile, ShelfUnit } from "../primitives";
import { type UnitProps } from "./types";

export default function UnitSystems({ palette, dark }: UnitProps) {
  return (
    <group>
      <ShelfUnit
        palette={palette}
        lower={
          <group>
            <BookPile palette={palette} x={0.3} salt={58} />
            <group position={[-0.55, 0, 0]}>
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/sansevieria.glb"
                  dark={dark}
                  variant="recolor"
                  rotation={[0, 0.4, 0]}
                  scale={0.16}
                />
              </React.Suspense>
              {/* Soil disc — the pot rim was visibly hollow (audit
                  §3-Systems). Radius eyeballed to the pot mouth at 0.16. */}
              <mesh position={[0, 0.088, 0]}>
                <cylinderGeometry args={[0.062, 0.062, 0.012, 20]} />
                <meshStandardMaterial color="#3a2b1c" roughness={1} />
              </mesh>
              <ContactShade
                color={palette.shadow}
                width={0.34}
                position={[0, 0.03, 0.06]}
              />
            </group>
          </group>
        }
      >
        <group position={[-1.0, 0, 0]}>
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/ct-books.glb"
              dark={dark}
              rotation={[0, 0.25, 0]}
              scale={2.2}
            />
          </React.Suspense>
          <ContactShade
            color={palette.shadow}
            width={0.52}
            position={[0, 0.03, 0.08]}
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
          <InboxTray palette={palette} />
          <ContactShade
            color={palette.shadow}
            width={0.5}
            position={[0, 0.03, 0.1]}
          />
        </group>
      </ShelfUnit>
      {/* Grandfather clock on the ground at the LEFT flank — the statement
          prop that shifts the unit's grammar from "shelf" toward "room".
          Dial measured at local (0, 1.150, 0.072) r 0.0711 → ×1.15 scale. */}
      <group position={[-1.95, -1.115, -0.15]} rotation={[0, 0.15, 0]}>
        <React.Suspense fallback={null}>
          <ModelProp url="/models/grandfather-clock.glb" dark={dark} scale={1.15} />
        </React.Suspense>
        <group position={[0, 1.3225, 0.0838]}>
          <ClockFace radius={0.0777} />
        </group>
      </group>
      <FootPool
        color={palette.shadow}
        size={[0.48, 0.32]}
        position={[-1.95, -1.115, -0.1]}
      />
    </group>
  );
}
