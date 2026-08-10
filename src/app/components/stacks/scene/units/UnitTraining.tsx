"use client";

// Training — real bumper plates leaning against the shelf back with a
// kettlebell, a loaded barbell lying along the lower shelf behind the
// dumbbell and basketball, and a golf club leaning against the unit's side
// (the only prop tall enough to demand the floor). Every piece of iron —
// plates, kettlebell, barbell, dumbbell — opens the training log.
import { RoundedBox } from "@react-three/drei";
import React from "react";

import { BounceProp, RollBall } from "../eggs";
import { ContactShade, FootPool } from "../GroundPool";
import PropLink from "../links";
import LitImage from "../LitImage";
import ModelProp from "../ModelProp";
import { Polaroid } from "../objects";
import { DeskFrame, deskFrameHeight } from "../photos";
import { BookPile, BumperPlates, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

export default function UnitTraining({ palette, dark, index }: UnitProps) {
  const textured = useUnitLod(index);
  return (
    <group>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
          <group>
            <PropLink
              unitIndex={index}
              to="weightlifting"
              hoverKey="link:dumbbell"
              lift={[0, 0.018, 0.015]}
            >
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
            </PropLink>
            {/* Egg: one soft bounce per click, landing exactly back. */}
            <BounceProp unitIndex={index} hoverKey="egg:basketball">
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
            </BounceProp>
            <PropLink
              unitIndex={index}
              to="weightlifting"
              hoverKey="link:barbell"
              lift={[0, 0.018, 0.015]}
            >
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
            </PropLink>
            {/* Framed gym photo fills the bare lower-left (audit §2.5) —
                the SF Gyms mirror shot, the one that survives 300px. */}
            {/* Tough Mudder, under the wire and grinning — effort without
                the posing register he rules out. */}
            <group position={[-0.42, 0.1425, 0.16]} rotation={[-0.14, -0.22, -0.04]}>
              <Polaroid
                src="/images/stacks/training-mud.jpg"
                palette={palette}
                textured={textured}
              />
            </group>
            <group position={[-1.12, 0.272, -0.02]} rotation={[-0.1, 0.16, 0]}>
              <RoundedBox
                castShadow
                args={[0.42, 0.54, 0.03]}
                radius={0.008}
                smoothness={4}
                position={[0, 0, -0.018]}
              >
                <meshStandardMaterial color={palette.frame} roughness={0.6} />
              </RoundedBox>
              {textured && (
                <React.Suspense fallback={null}>
                  <LitImage
                    url="/images/stacks/gym-mirror.jpg"
                    width={0.36}
                    height={0.48}
                    roughness={0.5}
                    position={[0, 0, -0.001]}
                  />
                </React.Suspense>
              )}
            </group>
          </group>
        }
      >
        {/* Two bumper plates with a real through-bore, leaning against the
            shelf back — the CC-BY porcelain proxy read as dinnerware
            (owner-killed at browse). */}
        <group position={[-0.95, 0, -0.08]}>
          <BumperPlates linkUnit={index} />
          <ContactShade
            color={palette.shadow}
            width={0.9}
            height={0.22}
            position={[0.15, 0.04, 0.12]}
          />
        </group>
        <PropLink
          unitIndex={index}
          to="weightlifting"
          hoverKey="link:kettlebell"
          lift={[0, 0.018, 0.015]}
        >
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
        </PropLink>
        <group position={[0.75, 0, 0]}>
          <BookPile palette={palette} salt={31} linkUnit={index} />
        </group>
        {/* Chappaquiddick pin-flag print — the golf half of the training
            story, leaning between kettlebell and pile. */}
        <group position={[0.32, 0.1305, 0.12]} rotation={[-0.16, -0.08, 0.06]}>
          <Polaroid
            src="/images/stacks/golf-flag.jpg"
            palette={palette}
            size={0.215}
            textured={textured}
          />
        </group>
        {/* Racked and folded over the bar after a heavy set. The v4 audit
            concluded no mid-lift still existed in any archive and only a
            video frame-grab could supply one; it was in the Twitter export.
            Framed, because it's the one that earns it. */}
        <group
          position={[-0.45, deskFrameHeight(0.23) / 2, 0.12]}
          rotation={[-0.09, 0.2, 0.02]}
        >
          <DeskFrame
            src="/images/stacks/training-squat.jpg"
            palette={palette}
            textured={textured}
            width={0.24}
            height={0.23}
          />
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
          the club's company, which is exactly the company it keeps.
          Egg: click and it rolls a few cm, settles, rolls back next click
          (RollBall carries its own FootPool so the shadow rides along). */}
      <RollBall
        unitIndex={index}
        hoverKey="egg:golf"
        palette={palette}
        position={[-1.78, -1.115, 0.06]}
      />
      <FootPool color={palette.shadow} size={[0.42, 0.3]} position={[-1.99, -1.115, -0.06]} />
    </group>
  );
}
