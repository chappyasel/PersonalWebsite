"use client";

// Musings — leaning notebook spines (front three are the latest posts), a
// real open book mid-thought, headphones, tea, and a pinned corkboard;
// paper stack + pen cup below.
import React, { useMemo } from "react";

import { RoundedBox } from "@react-three/drei";

import { SteamCup } from "../eggs";
import { ContactShade } from "../GroundPool";
import LitImage from "../LitImage";
import ModelProp from "../ModelProp";
import { NotebookLean, PaperStack, Polaroid } from "../objects";
import { ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

export default function UnitBlog({
  data,
  palette,
  dark,
  index,
  onOpenUrl,
}: UnitProps) {
  const textured = useUnitLod(index);
  const clickKeys = useMemo(
    () => data.blogPosts.map((post) => post.link),
    [data.blogPosts],
  );
  return (
    <ShelfUnit
      palette={palette}
      toneSeed={index}
      lower={
        <group>
          <group position={[0.25, 0, 0]}>
            <PaperStack palette={palette} />
            <ContactShade
              color={palette.shadow}
              width={0.55}
              position={[0, 0.02, 0.02]}
            />
          </group>
          <React.Suspense fallback={null}>
            <ModelProp url="/models/mug.glb" dark={dark} position={[-0.55, 0, 0]} rotation={[0, 0.9, 0]} />
          </React.Suspense>
          {/* Joshua Tree solo walk — the contemplative register of the
              unit, framed small on the empty lower-left. */}
          <group position={[-1.0, 0.152, 0]} rotation={[-0.1, 0.14, 0]}>
            <RoundedBox
              castShadow
              args={[0.4, 0.3, 0.025]}
              radius={0.006}
              smoothness={4}
              position={[0, 0, -0.015]}
            >
              <meshStandardMaterial color={palette.frame} roughness={0.6} />
            </RoundedBox>
            {textured && (
              <React.Suspense fallback={null}>
                <LitImage
                  url="/images/stacks/musings-walk.jpg"
                  width={0.35}
                  height={0.26}
                  roughness={0.5}
                  position={[0, 0, -0.001]}
                />
              </React.Suspense>
            )}
          </group>
        </group>
      }
    >
      <group position={[-0.7, 0, 0]}>
        <NotebookLean
          palette={palette}
          clickKeys={clickKeys}
          onNotebookClick={onOpenUrl}
        />
        <ContactShade
          color={palette.shadow}
          width={0.8}
          height={0.18}
          position={[0, 0.03, 0.1]}
        />
      </group>
      <React.Suspense fallback={null}>
        <ModelProp
          url="/models/open-book.glb"
          dark={dark}
          variant="tinted"
          tints={{ Beige: palette.pages, DarkRed: palette.spines[3] }}
          position={[0.85, 0, 0.08]}
          rotation={[0, -0.35, 0]}
          scale={0.7}
        />
      </React.Suspense>
      {/* Cup of tea beside the open book — mid-thought, mid-sip.
          Egg: click and a few faint steam wisps rise off the surface. */}
      <SteamCup
        unitIndex={index}
        hoverKey="egg:tea"
        steamAt={[0.55, 0.105, 0.22]}
        dark={dark}
      >
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/cup-tea.glb"
            dark={dark}
            position={[0.55, 0, 0.22]}
            rotation={[0, 0.6, 0]}
            scale={2.0}
          />
        </React.Suspense>
      </SteamCup>
      <React.Suspense fallback={null}>
        <ModelProp url="/models/headphones.glb" dark={dark} position={[0.12, 0, 0.14]} rotation={[0, 0.5, 0]} scale={2.0} />
      </React.Suspense>
      {/* Corkboard leaning back-right, top corner on the strap — fills the
          empty right third (audit §3-Musings). Three pinned instant prints
          from the Instagram curation round (fresh content — the earlier
          two duplicated the About pair). */}
      <group position={[1.02, 0, -0.16]} rotation={[-0.28, 0.35, 0.02]}>
        <React.Suspense fallback={null}>
          <ModelProp url="/models/corkboard.glb" dark={dark} scale={0.9} />
        </React.Suspense>
        {[
          { src: "/images/stacks/pin-dunes.jpg", x: -0.17, y: 0.22, roll: -0.08 },
          { src: "/images/stacks/pin-trail.jpg", x: 0.11, y: 0.28, roll: 0.1 },
          { src: "/images/stacks/pin-creek.jpg", x: -0.02, y: 0.09, roll: 0.04 },
        ].map((pin) => (
          <group
            key={pin.src}
            position={[pin.x, pin.y, 0.022]}
            rotation={[0, 0, pin.roll]}
          >
            <Polaroid
              src={pin.src}
              palette={palette}
              size={0.11}
              textured={textured}
            />
            <mesh position={[0, 0.075, 0.008]}>
              <sphereGeometry args={[0.008, 10, 10]} />
              <meshStandardMaterial
                color={palette.hub}
                metalness={0.4}
                roughness={0.4}
              />
            </mesh>
          </group>
        ))}
      </group>
      <ContactShade
        color={palette.shadow}
        width={0.6}
        position={[1.0, 0.03, -0.05]}
      />
    </ShelfUnit>
  );
}
