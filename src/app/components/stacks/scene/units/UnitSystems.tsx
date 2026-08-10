"use client";

// Systems — CT Books as the operating manual, the alarm clock (live canvas
// face over the GLB dial), and a paper inbox tray; book pile + sansevieria
// below; the grandfather clock stands on the floor at the unit's left
// flank, ticking the same live time. The 3:45 wake-up story lives in the
// click easter egg (EggClock).
import React from "react";

import { EggClock } from "../eggs";
import { ContactShade, FootPool } from "../GroundPool";
import ModelProp from "../ModelProp";
import { InboxTray } from "../objects";
import { BookPile, ShelfUnit } from "../primitives";
import { type UnitProps } from "./types";

export default function UnitSystems({ palette, dark, index }: UnitProps) {
  return (
    <group>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
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
          {/* Canvas face registered to the GLB's measured dial: the front
              disc sits at local z 0.024, center y 0.0828, r 0.0614 — ×1.6
              scale puts the canvas at y 0.1325, z 0.040 (1.6mm proud of the
              paint, behind the bezel rim), r ≈ 0.95× the dial so the painted
              ticks never peek out around it.
              Egg: click and the hands wind to 3:45 — the wake time — hold,
              then wind on around to the visitor's live time. */}
          <EggClock
            unitIndex={index}
            hoverKey="egg:clock:alarm"
            facePosition={[0, 0.1325, 0.0404]}
            faceRadius={0.0933}
          >
            <React.Suspense fallback={null}>
              <ModelProp url="/models/alarm-clock.glb" dark={dark} scale={1.6} />
            </React.Suspense>
          </EggClock>
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
        {/* Same wind-to-3:45 egg as the alarm clock. */}
        <EggClock
          unitIndex={index}
          hoverKey="egg:clock:floor"
          facePosition={[0, 1.3225, 0.0838]}
          faceRadius={0.0777}
        >
          <React.Suspense fallback={null}>
            <ModelProp url="/models/grandfather-clock.glb" dark={dark} scale={1.15} />
          </React.Suspense>
        </EggClock>
      </group>
      <FootPool
        color={palette.shadow}
        size={[0.48, 0.32]}
        position={[-1.95, -1.115, -0.1]}
      />
    </group>
  );
}
