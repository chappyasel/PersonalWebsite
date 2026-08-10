"use client";

// About — framed portrait, calling cards, mug, and a globe (he has the
// travel to claim it); desk lamp + book pile below.
import React from "react";

import { proxied } from "../../theme";
import { EggLamp, SpinProp, Sway } from "../eggs";
import { ContactShade, FootPool } from "../GroundPool";
import ModelProp from "../ModelProp";
import {
  CardStack,
  DeskApple,
  Polaroid,
  PortraitFrame,
  PostcardPrint,
} from "../objects";
import { DeskFrame, deskFrameHeight, PhotoMount } from "../photos";
import { BookPile, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

export const PORTRAIT_SRC = "/images/about/profile.jpg";

export default function UnitAbout({
  palette,
  dark,
  index,
  coverWidth,
}: UnitProps) {
  const textured = useUnitLod(index);
  return (
    <group>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
        <group>
          <group position={[-0.65, 0, 0]}>
            {/* Egg: the lamp clicks off and back on. */}
            <EggLamp unitIndex={index} palette={palette} dark={dark} yaw={0.55} />
          </group>
          <BookPile palette={palette} x={0.62} salt={9} linkUnit={index} />
          {/* Apple desk object in the gap between the lamp and the family
              frame. It belongs on THIS unit and not on Projects: the bio in
              the placard beside it is the only text in the world that says
              Apple, Vision Pro, Apple Intelligence, so here the prop is a
              footnote to a sentence a reader can actually see, and on the
              Projects shelf (personal apps, none of them Apple's) it would
              be an unexplained logo. Square to the plank rather than to the
              camera (so no rotation of its own): the mark's face is the one
              near-mirror in the scene, and off-square it swings away from
              the environment probe's lit half and goes black. */}
          <group position={[-0.42, 0, 0.15]}>
            <DeskApple palette={palette} />
          </group>
          {/* Same 2.1 as its twin on Musings — mug.glb is really a pen-and-
              scissors caddy whose bbox top is the scissor tips, not the cup
              rim, so the unscaled prop was reading as an egg cup.
              Moved 0.86 → 0.16, and the book pile 0.5 → 0.62 to open the
              slot. The old spot was written against "x > ~1.1 hides behind
              the desktop placard", which is measurably wrong: the panel is
              528px at ≥1280 and the camera pans ±0.49, so the real threshold
              is x ≤ +0.85 safe / +1.3 invisible. At 0.86 the caddy spanned
              0.749..0.967 and was entirely behind the glass — the whole
              point of resizing it is that the scissors READ, and they cannot
              read through a blurred panel. */}
          <React.Suspense fallback={null}>
            <ModelProp url="/models/mug.glb" dark={dark} position={[0.16, 0, 0.05]} rotation={[0, -0.4, 0]} scale={2.1} />
          </React.Suspense>
          {/* The four brothers, and the whole family at Christmas — the left
              flank of this shelf was empty in every screenshot he sent. */}
          <PhotoMount
            unitIndex={index}
            id="about-brothers"
            position={[-1.06, 0.1425, 0.06]}
            rotation={[-0.16, 0.22, 0.03]}
          >
            <Polaroid
              src="/images/stacks/about-brothers.jpg"
              palette={palette}
              textured={textured}
            />
          </PhotoMount>
          <PhotoMount
            unitIndex={index}
            id="about-holidays"
            position={[-0.14, deskFrameHeight(0.2) / 2, 0.04]}
            rotation={[-0.12, -0.18, 0]}
          >
            <DeskFrame
              src="/images/stacks/about-holidays.jpg"
              palette={palette}
              textured={textured}
              width={0.27}
              height={0.2}
            />
          </PhotoMount>
        </group>
      }
    >
      {/* No rest tilt to hand over — the portrait carries its own lean
          inside the component, so it lifts and grows without straightening. */}
      <PhotoMount unitIndex={index} id="portrait" position={[-0.55, 0, 0]}>
        <PortraitFrame
          src={proxied(PORTRAIT_SRC, coverWidth)}
          palette={palette}
          textured={textured}
        />
      </PhotoMount>
      {/* The portrait frame is 1.02 wide, so it stops at −1.06 and the top
          shelf runs on bare to the plank end. A houseplant is what stands
          in that gap on a real shelf — and it is the only thing on this
          unit that is neither a picture nor a keepsake. */}
      {/* 1.45, not the 1.85 a 0.26 m houseplant would want: the slot itself
          is the limit. Plank end −1.6 to portrait edge −1.06 is 0.54 of
          clear shelf, and this GLB is 0.3526 wide per unit of scale, so
          anything past ~1.47 either overhangs the end or pushes into the
          frame. It reads a little small for a houseplant, and that is the
          shelf's fault rather than a taste call. */}
      <group position={[-1.33, 0, 0.02]}>
        <Sway unitIndex={index} amount={0.022} rate={0.44}>
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/potted-plant.glb"
              dark={dark}
              rotation={[0, 0.5, 0]}
              scale={1.45}
            />
          </React.Suspense>
        </Sway>
        <ContactShade
          color={palette.shadow}
          width={0.4}
          position={[0, 0.02, 0.02]}
        />
      </group>
      <group position={[0.30, 0, 0.05]}>
        <CardStack palette={palette} />
        <ContactShade
          color={palette.shadow}
          width={0.42}
          position={[0, 0.02, 0.02]}
        />
      </group>
      {/* Polaroid pair leaning by the cards — the beach at sunset and the
          four brothers (audit §5 ★ picks). Contact = (h/2)·cos(lean). */}
      <PhotoMount
        unitIndex={index}
        id="beach-sunset"
        position={[0.46, 0.1425, 0.1]}
        rotation={[-0.17, 0.1, -0.04]}
      >
        <Polaroid
          src="/images/stacks/beach-sunset.jpg"
          palette={palette}
          textured={textured}
        />
      </PhotoMount>
      <PhotoMount
        unitIndex={index}
        id="bros"
        position={[0.63, 0.1425, 0.17]}
        rotation={[-0.15, 0.16, 0.06]}
      >
        <Polaroid
          src="/images/stacks/bros.jpg"
          palette={palette}
          textured={textured}
        />
      </PhotoMount>
      {/* Egg: one slow damped revolution per click, over a continuous idle
          drift — a globe that never moves is the most obviously stopped
          object a room can contain. One turn per ~105s: slow enough that you
          notice it the second time you look, which is the right speed for
          something sitting on a shelf. The spin wrapper sits AT the globe's
          slot so the turn is about its own stand, not the unit. */}
      <group position={[0.82, 0, -0.1]}>
        <SpinProp unitIndex={index} hoverKey="egg:globe" idleRate={0.06}>
          <React.Suspense fallback={null}>
            <ModelProp url="/models/globe.glb" dark={dark} rotation={[0, -0.7, 0]} scale={1.5} />
          </React.Suspense>
        </SpinProp>
      </group>
      {/* Postcard pair leaning on the globe stand — Budapest Parliament +
          Delicate Arch (the Instagram curation round's top travel frame). */}
      <PhotoMount
        unitIndex={index}
        id="postcard-budapest"
        position={[0.67, 0.0735, 0.04]}
        rotation={[-0.2, 0.05, 0.05]}
      >
        <PostcardPrint
          src="/images/stacks/postcard-budapest.jpg"
          palette={palette}
          textured={textured}
        />
      </PhotoMount>
      <PhotoMount
        unitIndex={index}
        id="postcard-arches"
        position={[0.8, 0.0735, 0.13]}
        rotation={[-0.18, 0.3, -0.05]}
      >
        <PostcardPrint
          src="/images/stacks/postcard-arches.jpg"
          palette={palette}
          textured={textured}
        />
      </PhotoMount>
      </ShelfUnit>
      {/* Reading chair on the ground at the LEFT flank, angled toward
          the unit — the room reads inhabited before a single word is read.
          x −2.08 keeps its armrest CLEAR of the full-width lower plank
          (ends at −1.6; the v4.0 spot ran the arm through it).
          The owner asked for an Eames. Said plainly: there is no Eames
          lounge chair on poly.pizza — a sweep of eames / lounge chair /
          armchair / recliner / mid century modern turned up about ninety
          chairs and not one plywood shell, leather cushion or ottoman. This
          is the nearest honest read: a 1950s Danish lounge chair, one-piece
          upholstered shell sweeping from a sloping high back into low arms,
          seat cushion a separate slab, on four splayed tapered dowel legs.
          It is a real upgrade on the club chair it replaces and it is not an
          Eames, and he should judge it knowing that. The only genuine icon
          on the site is Breuer's Wassily, which I passed on: 6,116 tris and
          392 KB of tubular steel that reads as a wire scribble at this
          scale.
          0.73 gives 0.890 world against a real 0.85 m chair, on the floor
          conversion the ladder and grandfather clock already imply — 13%
          taller than the old armchair, which is right for a high back.
          The tint is not optional: as authored the upholstery is
          0.10/0.09/0.01, i.e. near-black, and untinted it renders as a
          silhouette with no chair in it. */}
      <group position={[-2.08, -1.115, 0.12]} rotation={[0, 0.55, 0]}>
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/eames-chair.glb"
            dark={dark}
            variant="tinted"
            // Tan leather rather than a palette spine hex: the spine reds
            // are book-cover saturation and put a salmon chair in the room.
            tints={{
              Cloth1MinimalistModernChair1: dark ? "#6d4b38" : "#9a6f52",
              WoodMinimalistModernChair1: palette.woodDark,
            }}
            scale={0.73}
          />
        </React.Suspense>
      </group>
      {/* The monstera goes on the FLOOR beside the chair rather than on a
          shelf: at 0.40 it still needs 0.82 of headroom and a plank gap is
          about 1.0, so anywhere under wood it is a plant in a box. On the
          ground it can run at 0.47 and be the full-height plant the room did
          not have. Behind the chair rather than beside it: at −2.72 it sat
          on the viewport edge at unit 0, and tucked in at −2.5 with z −0.32
          it clears the chair's back by a few centimetres and stays in
          frame. */}
      <Sway unitIndex={index} amount={0.018} rate={0.31} phase={0.7}>
        <group position={[-2.5, -1.115, -0.32]} rotation={[0, -0.4, 0]}>
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/monstera.glb"
              dark={dark}
              variant="recolor"
              scale={0.55}
            />
          </React.Suspense>
        </group>
      </Sway>
      <FootPool
        color={palette.shadow}
        size={[0.5, 0.38]}
        position={[-2.5, -1.115, -0.32]}
      />
      <FootPool
        color={palette.shadow}
        size={[0.62, 0.48]}
        position={[-2.08, -1.115, 0.12]}
      />
    </group>
  );
}
