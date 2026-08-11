"use client";

// Musings is a working shelf rather than a second photo wall: notebooks,
// paper, an open book, headphones and tea, with plants softening both ends.
import Grabbable from "../Grabbable";
import { ContactShade } from "../GroundPool";
import ModelProp from "../ModelProp";
import { EggLamp, SteamCup, Sway } from "../eggs";
import PropLink, { HoverProp } from "../links";
import { NotebookLean, PaperStack } from "../objects";
import { BookPile, Bookend, ShelfUnit } from "../primitives";
import React, { useMemo } from "react";

import { type UnitProps } from "./types";

export default function UnitBlog({
  data,
  palette,
  dark,
  index,
  onOpenUrl,
}: UnitProps) {
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
          <group position={[-1.02, 0, -0.02]}>
            <Sway unitIndex={index} amount={0.022} rate={0.34} phase={1.8}>
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/potted-plant.glb"
                  dark={dark}
                  rotation={[0, 0.45, 0]}
                  scale={0.78}
                />
              </React.Suspense>
            </Sway>
            <ContactShade
              color={palette.shadow}
              width={0.42}
              position={[0, 0.025, 0.04]}
            />
          </group>

          <Grabbable
            unitIndex={index}
            hoverKey="grab:mug"
            base={[-0.55, 0, 0.02]}
            shadeColor={palette.shadow}
            shadeWidth={0.32}
          >
            <React.Suspense fallback={null}>
              <ModelProp
                url="/models/mug.glb"
                dark={dark}
                rotation={[0, 0.9, 0]}
                scale={2.1}
              />
            </React.Suspense>
          </Grabbable>

          <group position={[0.02, 0, 0]}>
            <PaperStack palette={palette} linkUnit={index} />
            <ContactShade
              color={palette.shadow}
              width={0.55}
              position={[0, 0.02, 0.02]}
            />
          </group>

          <BookPile palette={palette} x={0.76} salt={47} linkUnit={index} />
        </group>
      }
    >
      {/* The top lamp is the shared measured angle-poise rig: its shade glow,
          hot mouth, spot and local spill all switch together. */}
      <group position={[-1.06, 0, -0.07]}>
        <EggLamp
          unitIndex={index}
          palette={palette}
          dark={dark}
          yaw={-0.34}
          scale={1.74}
        />
        <ContactShade
          color={palette.shadow}
          width={0.36}
          position={[0, 0.02, 0.01]}
        />
      </group>

      <group position={[-0.55, 0, 0]}>
        <NotebookLean
          palette={palette}
          clickKeys={clickKeys}
          onNotebookClick={onOpenUrl}
          linkUnit={index}
        />
        <ContactShade
          color={palette.shadow}
          width={0.74}
          height={0.18}
          position={[0, 0.03, 0.1]}
        />
      </group>
      <group position={[-0.24, 0, 0.02]}>
        <HoverProp
          unitIndex={index}
          hoverKey="hover:bookend:blog"
          lift={[0, 0, 0]}
          rest={[0, 0, -0.045]}
          settle={0.045}
        >
          <Bookend palette={palette} flip />
        </HoverProp>
      </group>

      <Grabbable
        unitIndex={index}
        hoverKey="grab:headphones"
        base={[0.04, 0, 0.14]}
        shadeColor={palette.shadow}
        shadeWidth={0.46}
      >
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/headphones.glb"
            dark={dark}
            rotation={[0, 0.5, 0]}
            scale={2.9}
          />
        </React.Suspense>
      </Grabbable>

      <SteamCup
        unitIndex={index}
        hoverKey="egg:tea"
        steamAt={[0.39, 0.122, -0.08]}
        dark={dark}
        always
      >
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/cup-tea.glb"
            dark={dark}
            position={[0.39, 0, -0.08]}
            rotation={[0, 0.6, 0]}
            scale={2.4}
          />
        </React.Suspense>
      </SteamCup>

      <PropLink
        unitIndex={index}
        to="books"
        hoverKey="link:openbook"
        lift={[0, 0.025, 0.02]}
      >
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/open-book.glb"
            dark={dark}
            variant="tinted"
            tints={{ Beige: palette.pages, DarkRed: palette.spines[3] }}
            position={[0.8, 0, 0.08]}
            rotation={[0, -0.25, 0]}
            scale={0.7}
          />
        </React.Suspense>
      </PropLink>
    </ShelfUnit>
  );
}
